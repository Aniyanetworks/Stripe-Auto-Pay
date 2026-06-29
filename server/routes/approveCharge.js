import Stripe from 'stripe'
import { chargeRequests } from './createChargeRequest.js'

async function postSlack(text) {
  const botToken = process.env.SLACK_BOT_TOKEN
  const userId   = process.env.ADMIN_SLACK_USER_ID
  if (!botToken || !userId) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: userId, text }),
  })
}

export async function approveCharge(req, res) {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token required' })

  const entry = chargeRequests.get(token)
  if (!entry)                     return res.status(404).json({ error: 'Charge request not found or expired' })
  if (entry.expiresAt < Date.now()) {
    chargeRequests.delete(token)
    return res.status(410).json({ error: 'This charge request has expired' })
  }
  if (entry.status !== 'pending') return res.status(409).json({ error: `Charge already ${entry.status}` })

  entry.status = 'processing'

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY)
  const dollars = (entry.amount / 100).toFixed(2)

  try {
    // Stripe India requires billing details on the PaymentMethod for export transactions
    const billingAddress = {
      line1:       entry.customer_address?.line1       || '175 Derby St',
      city:        entry.customer_address?.city        || 'Hingham',
      state:       entry.customer_address?.state       || 'MA',
      postal_code: entry.customer_address?.postal_code || '02043',
      country:     entry.customer_address?.country     || 'US',
    }
    await stripe.paymentMethods.update(entry.payment_method_id, {
      billing_details: {
        name:    entry.customer_name,
        address: billingAddress,
      },
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
        address: {
          line1:       entry.customer_address?.line1       || '175 Derby St',
          city:        entry.customer_address?.city        || 'Hingham',
          state:       entry.customer_address?.state       || 'MA',
          postal_code: entry.customer_address?.postal_code || '02043',
          country:     entry.customer_address?.country     || 'US',
        },
      },
    })

    entry.status         = 'charged'
    entry.payment_intent = paymentIntent.id

    await postSlack(
      `✅ *Charge Approved & Processed*\n` +
      `*Business:* ${entry.customer_name}\n` +
      `*Amount:* $${dollars}\n` +
      `*Description:* ${entry.description}\n` +
      `*Payment Intent:* \`${paymentIntent.id}\``
    )

    res.json({ success: true, payment_intent_id: paymentIntent.id })
  } catch (err) {
    entry.status = 'failed'
    console.error('[approve-charge]', err)
    await postSlack(
      `🚨 *Charge Failed*\n` +
      `*Business:* ${entry.customer_name}\n` +
      `*Amount:* $${dollars}\n` +
      `*Error:* \`${err.message}\``
    )
    res.status(500).json({ error: 'Charge failed', detail: err.message })
  }
}
