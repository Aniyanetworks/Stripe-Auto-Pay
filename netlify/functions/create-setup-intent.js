import Stripe from 'stripe'
import { postSlack } from './lib/slack.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { location_id } = event.queryStringParameters || {}
  if (!location_id)
    return { statusCode: 400, body: JSON.stringify({ error: 'location_id is required' }) }

  const stripe        = new Stripe(process.env.STRIPE_SECRET_KEY)
  const internalEmail = `loc_${location_id}@billing.internal`

  try {
    let customerId = null
    const list = await stripe.customers.list({ email: internalEmail, limit: 1 })
    if (list.data.length > 0) customerId = list.data[0].id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    internalEmail,
        metadata: { location_id },
      })
      customerId = customer.id
    }

    const setupIntent = await stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
      usage:                'off_session',
      metadata:             { location_id },
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_secret:      setupIntent.client_secret,
        customer_id:        customerId,
        business_record_id: location_id,
      }),
    }
  } catch (err) {
    console.error('[create-setup-intent]', err)
    await postSlack(`🚨 *Server Error — create-setup-intent*\n*Context:* location_id=${location_id}\n*Error:* \`${err.message}\``)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
