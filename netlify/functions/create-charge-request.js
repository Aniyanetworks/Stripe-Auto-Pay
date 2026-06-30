import crypto from 'crypto'
import Stripe from 'stripe'
import { supabase } from './lib/supabase.js'
import { postSlack } from './lib/slack.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { location_id, amount, description, name } = JSON.parse(event.body || '{}')

  if (!location_id || !amount || !description)
    return { statusCode: 400, body: JSON.stringify({ error: 'location_id, amount (cents integer), description required' }) }

  if (!Number.isInteger(amount) || amount < 50)
    return { statusCode: 400, body: JSON.stringify({ error: 'amount must be a whole-number of cents (min 50)' }) }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const internalEmail = `loc_${location_id}@billing.internal`
    const list          = await stripe.customers.list({ email: internalEmail, limit: 1 })

    if (list.data.length === 0)
      return { statusCode: 400, body: JSON.stringify({ error: 'No saved payment method found for this location. Ask them to save their card first.' }) }

    const customer        = list.data[0]
    const customerId      = customer.id
    const paymentMethodId = customer.invoice_settings?.default_payment_method

    if (!paymentMethodId)
      return { statusCode: 400, body: JSON.stringify({ error: 'Customer has no default payment method saved yet.' }) }

    const businessName = name || customer.name || location_id

    if (name && !customer.name)
      await stripe.customers.update(customerId, { name })

    const token      = crypto.randomUUID()
    const siteUrl    = (process.env.URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '')
    const approveUrl = `${siteUrl}/approve?token=${token}`
    const dollars    = (amount / 100).toFixed(2)
    const expiresAt  = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { error: dbError } = await supabase.from('charge_requests').insert({
      token,
      location_id,
      customer_id:       customerId,
      payment_method_id: paymentMethodId,
      customer_name:     businessName,
      customer_address:  { country: 'US' },
      amount,
      description,
      status:            'pending',
      expires_at:        expiresAt,
    })

    if (dbError) throw new Error(`DB insert failed: ${dbError.message}`)

    await postSlack(
      `💳 *Charge Request — Approval Needed*\n` +
      `*Business:* ${businessName}\n` +
      `*Amount:* $${dollars}\n` +
      `*Description:* ${description}\n\n` +
      `<${approveUrl}|👉 Click here to Approve or Reject>`
    )

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, token, approve_url: approveUrl }),
    }
  } catch (err) {
    console.error('[create-charge-request]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
