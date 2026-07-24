import Stripe from 'stripe'
import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { location_id, customer_id, amount, description, name } = JSON.parse(event.body || '{}')

  if (!location_id && !customer_id)
    return { statusCode: 400, body: JSON.stringify({ error: 'location_id or customer_id required' }) }

  if (!amount || !description)
    return { statusCode: 400, body: JSON.stringify({ error: 'amount (cents integer) and description required' }) }

  if (!Number.isInteger(amount) || amount < 50)
    return { statusCode: 400, body: JSON.stringify({ error: 'amount must be a whole-number of cents (min 50)' }) }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    let customer

    if (customer_id) {
      // New flow — look up directly by Stripe customer ID
      customer = await stripe.customers.retrieve(customer_id)
      if (!customer || customer.deleted)
        return { statusCode: 400, body: JSON.stringify({ error: 'Stripe customer not found.' }) }
    } else {
      // Legacy flow — look up by internal billing email
      const list = await stripe.customers.list({ email: `loc_${location_id}@billing.internal`, limit: 1 })
      if (list.data.length === 0)
        return { statusCode: 400, body: JSON.stringify({ error: 'No saved payment method found for this location.' }) }
      customer = list.data[0]
    }

    const customerId      = customer.id
    const paymentMethodId = customer.invoice_settings?.default_payment_method
    const effectiveLocId  = location_id || customerId

    if (!paymentMethodId)
      return { statusCode: 400, body: JSON.stringify({ error: 'Customer has no default payment method saved yet.' }) }

    const customerName = name || customer.name || effectiveLocId

    if (name && !customer.name)
      await stripe.customers.update(customerId, { name })

    // Queue in Supabase — no Slack, no charge yet
    const { error: dbError } = await supabase.from('pending_appointments').insert({
      location_id:       effectiveLocId,
      customer_id:       customerId,
      payment_method_id: paymentMethodId,
      customer_name:     customerName,
      amount,
      description,
      status: 'pending',
    })

    if (dbError) throw new Error(`DB insert failed: ${dbError.message}`)

    console.log(`[create-charge-request] queued — id=${effectiveLocId} amount=${amount}`)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, queued: true }),
    }
  } catch (err) {
    console.error('[create-charge-request]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
