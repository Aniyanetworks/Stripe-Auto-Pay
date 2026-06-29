import crypto from 'crypto'
import Stripe from 'stripe'

export const chargeRequests = new Map()

function cleanupExpired() {
  const now = Date.now()
  for (const [token, entry] of chargeRequests) {
    if (entry.expiresAt < now) chargeRequests.delete(token)
  }
}

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

export async function createChargeRequest(req, res) {
  const { location_id, amount, description, name } = req.body
  if (!location_id || !amount || !description)
    return res.status(400).json({ error: 'location_id, amount (cents integer), description required' })

  if (!Number.isInteger(amount) || amount < 50)
    return res.status(400).json({ error: 'amount must be a whole-number of cents (min 50)' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Find the Stripe Customer for this location by internal email
    const internalEmail = `loc_${location_id}@billing.internal`
    const list          = await stripe.customers.list({ email: internalEmail, limit: 1 })

    if (list.data.length === 0)
      return res.status(400).json({ error: 'No saved payment method found for this location. Ask them to save their card first.' })

    const customer       = list.data[0]
    const customerId     = customer.id
    const paymentMethodId = customer.invoice_settings?.default_payment_method

    if (!paymentMethodId)
      return res.status(400).json({ error: 'Customer has no default payment method saved yet.' })

    const businessName = name || customer.name || location_id

    // Update Stripe customer name if provided and not already set
    if (name && !customer.name) {
      await stripe.customers.update(customer.id, { name })
    }

    cleanupExpired()

    const token      = crypto.randomUUID()
    const siteUrl    = (process.env.SITE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const approveUrl = `${siteUrl}/approve?token=${token}`
    const dollars    = (amount / 100).toFixed(2)

    chargeRequests.set(token, {
      location_id,
      customer_id:       customerId,
      payment_method_id: paymentMethodId,
      customer_name:     businessName,
      customer_address:  { country: 'US' },
      amount,
      description,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000,
      status:    'pending',
    })

    await postSlack(
      `💳 *Charge Request — Approval Needed*\n` +
      `*Business:* ${businessName}\n` +
      `*Amount:* $${dollars}\n` +
      `*Description:* ${description}\n\n` +
      `<${approveUrl}|👉 Click here to Approve or Reject>`
    )

    res.json({ success: true, token, approve_url: approveUrl })
  } catch (err) {
    console.error('[create-charge-request]', err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
