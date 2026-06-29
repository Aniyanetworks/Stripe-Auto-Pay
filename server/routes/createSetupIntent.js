import Stripe from 'stripe'

const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

async function notifySlackError(context, err) {
  const token  = process.env.SLACK_BOT_TOKEN
  const userId = process.env.ADMIN_SLACK_USER_ID
  if (!token || !userId) return
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: userId,
        text: `🚨 *Server Error — create-setup-intent*\n*Context:* ${context}\n*Error:* \`${err.message}\``,
      }),
    })
  } catch (_) {}
}

export async function createSetupIntent(req, res) {
  const { client_id } = req.query
  if (!client_id) return res.status(400).json({ error: 'client_id is required' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Fetch GHL contact to check for an existing Stripe Customer
    const ghlRes = await fetch(`${GHL_API_BASE}/contacts/${client_id}`, {
      headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: GHL_API_VERSION },
    })
    if (!ghlRes.ok) throw new Error(`GHL ${ghlRes.status}: ${await ghlRes.text()}`)

    const { contact } = await ghlRes.json()
    const cf = contact.customFields || []
    const existingCusId = (cf.find(f => f.key === 'stripe_customer_id') || {}).value

    let customerId = existingCusId || null

    if (!customerId) {
      // First visit — create a Stripe Customer linked to this GHL contact
      const customer = await stripe.customers.create({
        name:     `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || undefined,
        email:    contact.email || undefined,
        phone:    contact.phone || undefined,
        metadata: { ghl_contact_id: client_id },
      })
      customerId = customer.id
    }

    // SetupIntent with off_session — card can be charged without cardholder present later
    const setupIntent = await stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
      usage:                'off_session',
      metadata:             { ghl_contact_id: client_id },
    })

    res.json({ client_secret: setupIntent.client_secret, customer_id: customerId })
  } catch (err) {
    console.error('[create-setup-intent]', err)
    await notifySlackError(`client_id=${client_id}`, err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
