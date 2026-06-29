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
        text: `🚨 *Server Error — save-payment-method*\n*Context:* ${context}\n*Error:* \`${err.message}\``,
      }),
    })
  } catch (_) {}
}

export async function savePaymentMethod(req, res) {
  const { contact_id, payment_method_id, customer_id } = req.body
  if (!contact_id || !payment_method_id || !customer_id)
    return res.status(400).json({ error: 'contact_id, payment_method_id, customer_id required' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Attach the confirmed PaymentMethod to the Customer for future off-session charges
    try {
      await stripe.paymentMethods.attach(payment_method_id, { customer: customer_id })
    } catch (e) {
      if (!e.message?.includes('already been attached')) throw e
    }

    // Set as default so the n8n charge workflow always uses the most recently saved card
    await stripe.customers.update(customer_id, {
      invoice_settings: { default_payment_method: payment_method_id },
    })

    // Write Stripe IDs to GHL contact custom fields — n8n reads these when charging
    const ghlBody = {
      customFields: [
        { key: 'stripe_customer_id',       field_value: customer_id       },
        { key: 'stripe_payment_method_id', field_value: payment_method_id },
        { key: 'card_saved_at',            field_value: new Date().toISOString() },
      ],
    }
    console.log('[save-payment-method] GHL request body:', JSON.stringify(ghlBody))

    const ghlRes = await fetch(`${GHL_API_BASE}/contacts/${contact_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghlBody),
    })

    const ghlText = await ghlRes.text()
    console.log('[save-payment-method] GHL response:', ghlRes.status, ghlText)

    if (!ghlRes.ok) throw new Error(`GHL ${ghlRes.status}: ${ghlText}`)

    res.json({ success: true })
  } catch (err) {
    console.error('[save-payment-method]', err)
    await notifySlackError(`contact=${contact_id}`, err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
