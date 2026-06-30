import Stripe from 'stripe'
import { supabase } from './lib/supabase.js'
import { postSlack } from './lib/slack.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { token } = JSON.parse(event.body || '{}')
  if (!token)
    return { statusCode: 400, body: JSON.stringify({ error: 'token required' }) }

  try {
    const { data: entry, error } = await supabase
      .from('charge_requests')
      .select('*')
      .eq('token', token)
      .single()

    if (error || !entry)
      return { statusCode: 404, body: JSON.stringify({ error: 'Charge request not found or expired' }) }

    if (new Date(entry.expires_at) < new Date())
      return { statusCode: 410, body: JSON.stringify({ error: 'This charge request has expired' }) }

    if (entry.status !== 'pending')
      return { statusCode: 409, body: JSON.stringify({ error: `Charge already ${entry.status}` }) }

    await supabase.from('charge_requests').update({ status: 'processing' }).eq('token', token)

    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY)
    const dollars = (entry.amount / 100).toFixed(2)

    try {
      const billingAddress = {
        line1:       entry.customer_address?.line1       || '175 Derby St',
        city:        entry.customer_address?.city        || 'Hingham',
        state:       entry.customer_address?.state       || 'MA',
        postal_code: entry.customer_address?.postal_code || '02043',
        country:     entry.customer_address?.country     || 'US',
      }

      await stripe.paymentMethods.update(entry.payment_method_id, {
        billing_details: { name: entry.customer_name, address: billingAddress },
      })

      const paymentIntent = await stripe.paymentIntents.create({
        amount:         entry.amount,
        currency:       'usd',
        customer:       entry.customer_id,
        payment_method: entry.payment_method_id,
        off_session:    true,
        confirm:        true,
        description:    entry.description,
        metadata:       { location_id: entry.location_id },
        shipping: {
          name:    entry.customer_name,
          address: billingAddress,
        },
      })

      await supabase
        .from('charge_requests')
        .update({ status: 'charged', payment_intent_id: paymentIntent.id })
        .eq('token', token)

      await postSlack(
        `✅ *Charge Approved & Processed*\n` +
        `*Business:* ${entry.customer_name}\n` +
        `*Amount:* $${dollars}\n` +
        `*Description:* ${entry.description}\n` +
        `*Payment Intent:* \`${paymentIntent.id}\``
      )

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, payment_intent_id: paymentIntent.id }),
      }
    } catch (chargeErr) {
      await supabase.from('charge_requests').update({ status: 'failed' }).eq('token', token)
      await postSlack(
        `🚨 *Charge Failed*\n` +
        `*Business:* ${entry.customer_name}\n` +
        `*Amount:* $${dollars}\n` +
        `*Error:* \`${chargeErr.message}\``
      )
      console.error('[approve-charge]', chargeErr)
      return { statusCode: 500, body: JSON.stringify({ error: 'Charge failed', detail: chargeErr.message }) }
    }
  } catch (err) {
    console.error('[approve-charge]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
