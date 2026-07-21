import Stripe from 'stripe'
import crypto from 'crypto'
import { supabase } from './lib/supabase.js'

const ALLOWED_AMOUNTS = [25000, 50000, 100000] // $250, $500, $1000

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer '))
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user)
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }

    const { location_id, amount, description } = JSON.parse(event.body || '{}')

    if (!location_id || !amount || !description)
      return { statusCode: 400, body: JSON.stringify({ error: 'location_id, amount, description required' }) }

    if (!ALLOWED_AMOUNTS.includes(amount))
      return { statusCode: 400, body: JSON.stringify({ error: 'Amount must be $250, $500, or $1000' }) }

    const stripe         = new Stripe(process.env.STRIPE_SECRET_KEY)
    const internalEmail  = `loc_${location_id}@billing.internal`
    const list           = await stripe.customers.list({ email: internalEmail, limit: 1 })

    if (list.data.length === 0)
      return { statusCode: 404, body: JSON.stringify({ error: 'No Stripe customer found for this location.' }) }

    const customer        = list.data[0]
    const paymentMethodId = customer.invoice_settings?.default_payment_method

    if (!paymentMethodId)
      return { statusCode: 400, body: JSON.stringify({ error: 'Customer has no saved payment method.' }) }

    const chargeToken = crypto.randomUUID()
    const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const siteUrl     = (process.env.URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '')
    const approveUrl  = `${siteUrl}/approve?token=${chargeToken}`

    const { error: insertError } = await supabase.from('charge_requests').insert({
      token:             chargeToken,
      location_id,
      customer_id:       customer.id,
      payment_method_id: paymentMethodId,
      customer_name:     customer.name || location_id,
      customer_address:  { country: 'US' },
      amount,
      description,
      status:            'pending',
      expires_at:        expiresAt,
      appointment_ids:   [],
    })

    if (insertError) throw new Error(insertError.message)

    console.log(`[manual-charge] created — location=${location_id} amount=${amount}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, approve_url: approveUrl, token: chargeToken }),
    }
  } catch (err) {
    console.error('[manual-charge]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
