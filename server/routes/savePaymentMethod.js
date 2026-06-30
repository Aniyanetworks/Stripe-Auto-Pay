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
        text: `🚨 *Server Error — save-payment-method*\n*Context:* ${context}\n*Error:* \`${err.message}\``,
      }),
    })
  } catch (_) {}
}

export async function savePaymentMethod(req, res) {
  const { business_record_id, payment_method_id, customer_id, cardholder_name } = req.body
  if (!business_record_id || !payment_method_id || !customer_id)
    return res.status(400).json({ error: 'business_record_id, payment_method_id, customer_id required' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Attach card to Stripe Customer
    try {
      await stripe.paymentMethods.attach(payment_method_id, { customer: customer_id })
    } catch (e) {
      if (!e.message?.includes('already been attached')) throw e
    }

    // Set as default payment method and store cardholder name
    const customerUpdate = {
      invoice_settings: { default_payment_method: payment_method_id },
      metadata:         { location_id: business_record_id, card_saved_at: new Date().toISOString() },
    }
    if (cardholder_name) customerUpdate.name = cardholder_name

    await stripe.customers.update(customer_id, customerUpdate)

    console.log(`[save-payment-method] card saved — location_id=${business_record_id} customer=${customer_id} pm=${payment_method_id}`)
    res.json({ success: true })
  } catch (err) {
    console.error('[save-payment-method]', err)
    await notifySlackError(`location=${business_record_id}`, err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
