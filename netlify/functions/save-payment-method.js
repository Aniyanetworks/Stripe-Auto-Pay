import Stripe from 'stripe'
import { postSlack } from './lib/slack.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { business_record_id, payment_method_id, customer_id, cardholder_name } =
    JSON.parse(event.body || '{}')

  if (!business_record_id || !payment_method_id || !customer_id)
    return { statusCode: 400, body: JSON.stringify({ error: 'business_record_id, payment_method_id, customer_id required' }) }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    try {
      await stripe.paymentMethods.attach(payment_method_id, { customer: customer_id })
    } catch (e) {
      if (!e.message?.includes('already been attached')) throw e
    }

    const customerUpdate = {
      invoice_settings: { default_payment_method: payment_method_id },
      metadata:         { location_id: business_record_id, card_saved_at: new Date().toISOString() },
    }
    if (cardholder_name) customerUpdate.name = cardholder_name

    await stripe.customers.update(customer_id, customerUpdate)

    console.log(`[save-payment-method] card saved — location_id=${business_record_id} customer=${customer_id}`)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }
  } catch (err) {
    console.error('[save-payment-method]', err)
    await postSlack(`🚨 *Server Error — save-payment-method*\n*Context:* location=${business_record_id}\n*Error:* \`${err.message}\``)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
