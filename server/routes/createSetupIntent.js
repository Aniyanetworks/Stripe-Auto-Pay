import Stripe from 'stripe'

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
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id is required' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // Internal email used as a stable lookup key — not a real email address
  const internalEmail = `loc_${location_id}@billing.internal`

  try {
    // Find existing Stripe Customer for this location by internal email
    let customerId = null
    const list = await stripe.customers.list({ email: internalEmail, limit: 1 })
    if (list.data.length > 0) customerId = list.data[0].id

    // Create new customer if none found
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

    res.json({
      client_secret:      setupIntent.client_secret,
      customer_id:        customerId,
      business_record_id: location_id,
    })
  } catch (err) {
    console.error('[create-setup-intent]', err)
    await notifySlackError(`location_id=${location_id}`, err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
