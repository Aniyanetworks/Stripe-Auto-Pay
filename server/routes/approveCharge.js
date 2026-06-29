import Stripe from 'stripe'
import { chargeRequests } from './createChargeRequest.js'

const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

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
  if (!entry)                        return res.status(404).json({ error: 'Charge request not found or expired' })
  if (entry.expiresAt < Date.now()) {
    chargeRequests.delete(token)
    return res.status(410).json({ error: 'This charge request has expired' })
  }
  if (entry.status !== 'pending')    return res.status(409).json({ error: `Charge already ${entry.status}` })

  entry.status = 'processing'

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY)
  const dollars = (entry.amount / 100).toFixed(2)

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:         entry.amount,
      currency:       'usd',
      customer:       entry.customer_id,
      payment_method: entry.payment_method_id,
      off_session:    true,
      confirm:        true,
      description:    entry.description,
      metadata:       { ghl_contact_id: entry.contact_id },
      // Required by Stripe India export regulations
      shipping: {
        name:    entry.customer_name,
        address: entry.customer_address || { country: 'US' },
      },
    })

    entry.status         = 'charged'
    entry.payment_intent = paymentIntent.id

    // Write charge record back to GHL contact
    await fetch(`${GHL_API_BASE}/contacts/${entry.contact_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customFields: [
          { key: 'last_charge_amount',      field_value: `$${dollars}` },
          { key: 'last_charge_description', field_value: entry.description },
          { key: 'last_charge_at',          field_value: new Date().toISOString() },
          { key: 'last_payment_intent',     field_value: paymentIntent.id },
        ],
      }),
    })

    await postSlack(
      `✅ *Charge Approved & Processed*\n` +
      `*Customer:* ${entry.customer_name}\n` +
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
      `*Customer:* ${entry.customer_name}\n` +
      `*Amount:* $${dollars}\n` +
      `*Error:* \`${err.message}\``
    )
    res.status(500).json({ error: 'Charge failed', detail: err.message })
  }
}
