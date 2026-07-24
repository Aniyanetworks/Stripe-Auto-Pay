import Stripe from 'stripe'
import crypto from 'crypto'
import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { customer_id, amount_cents, payment_method_id } = JSON.parse(event.body || '{}')

    if (!customer_id || !amount_cents || !payment_method_id)
      return { statusCode: 400, body: JSON.stringify({ error: 'customer_id, amount_cents, and payment_method_id are required' }) }

    if (amount_cents < 50)
      return { statusCode: 400, body: JSON.stringify({ error: 'Minimum charge is $0.50' }) }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    const customer = await stripe.customers.retrieve(customer_id)
    if (!customer || customer.deleted)
      return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) }

    // Attach PM to customer and set as default
    await stripe.paymentMethods.attach(payment_method_id, { customer: customer_id })
    await stripe.customers.update(customer_id, {
      invoice_settings: { default_payment_method: payment_method_id },
    })

    // Create and confirm PaymentIntent immediately
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amount_cents,
      currency: 'usd',
      customer: customer_id,
      payment_method: payment_method_id,
      confirm:  true,
      automatic_payment_methods: {
        enabled:         true,
        allow_redirects: 'never',
      },
      description: 'Onboarding payment',
    })

    // 3DS required — return client_secret so frontend can handle
    if (paymentIntent.status === 'requires_action') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requires_action: true, client_secret: paymentIntent.client_secret }),
      }
    }

    if (paymentIntent.status !== 'succeeded') {
      return { statusCode: 402, body: JSON.stringify({ error: 'Payment failed. Please try a different card.' }) }
    }

    // Record in charge_requests
    const chargeToken = crypto.randomUUID()
    await supabase.from('charge_requests').insert({
      token:             chargeToken,
      location_id:       customer_id,
      customer_id:       customer_id,
      payment_method_id: payment_method_id,
      customer_name:     customer.name || customer.email || customer_id,
      customer_address:  { country: 'US' },
      amount:            amount_cents,
      description:       'Onboarding payment',
      status:            'charged',
      expires_at:        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      appointment_ids:   [],
    })

    console.log(`[charge-now] charged ${customer_id} amount=${amount_cents}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }
  } catch (err) {
    console.error('[charge-now]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
