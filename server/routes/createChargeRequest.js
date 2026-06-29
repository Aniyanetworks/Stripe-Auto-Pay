import crypto from 'crypto'

const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

// In-memory store — survives server restarts only if you redeploy; fine for approval flow
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
  const { contact_id, amount, description } = req.body
  if (!contact_id || !amount || !description)
    return res.status(400).json({ error: 'contact_id, amount (cents integer), description required' })

  if (!Number.isInteger(amount) || amount < 50)
    return res.status(400).json({ error: 'amount must be a whole-number of cents (min 50)' })

  try {
    const ghlRes = await fetch(`${GHL_API_BASE}/contacts/${contact_id}`, {
      headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: GHL_API_VERSION },
    })
    if (!ghlRes.ok) throw new Error(`GHL ${ghlRes.status}: ${await ghlRes.text()}`)

    const { contact } = await ghlRes.json()
    const cf          = contact.customFields || []
    console.log('[create-charge-request] customFields raw:', JSON.stringify(cf))

    // GHL GET responses return fields with {id, value} — search by key OR by Stripe ID prefix
    const getField = key => (cf.find(f => f.key === key) || {}).value
    let customerId      = getField('stripe_customer_id')
    let paymentMethodId = getField('stripe_payment_method_id')

    // Fallback: GHL may return field id instead of key — match by Stripe value prefix
    if (!customerId)
      customerId      = (cf.find(f => typeof f.value === 'string' && f.value.startsWith('cus_')) || {}).value
    if (!paymentMethodId)
      paymentMethodId = (cf.find(f => typeof f.value === 'string' && f.value.startsWith('pm_')) || {}).value

    console.log('[create-charge-request] customerId:', customerId, 'paymentMethodId:', paymentMethodId)

    if (!customerId || !paymentMethodId)
      return res.status(400).json({ error: 'No saved payment method found for this contact. Ask them to save their card first.' })

    const customerName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Customer'

    cleanupExpired()

    const token      = crypto.randomUUID()
    const siteUrl    = (process.env.SITE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const approveUrl = `${siteUrl}/approve?token=${token}`
    const dollars    = (amount / 100).toFixed(2)

    chargeRequests.set(token, {
      contact_id,
      customer_id:       customerId,
      payment_method_id: paymentMethodId,
      customer_name:     customerName,
      customer_email:    contact.email   || undefined,
      customer_phone:    contact.phone   || undefined,
      customer_address: {
        line1:       contact.address1   || '',
        city:        contact.city       || '',
        state:       contact.state      || '',
        postal_code: contact.postalCode || '',
        country:     contact.country    || 'US',
      },
      amount,
      description,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000,
      status:    'pending',
    })

    await postSlack(
      `💳 *Charge Request — Approval Needed*\n` +
      `*Customer:* ${customerName}\n` +
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
