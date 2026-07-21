import crypto from 'crypto'
import { supabase } from './lib/supabase.js'

// GHL calls this at 5PM ET with: { "location_id": "xxx" }
// Returns total amount + approve URL for GHL to include in its Slack message.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { location_id } = JSON.parse(event.body || '{}')
  if (!location_id)
    return { statusCode: 400, body: JSON.stringify({ error: 'location_id required' }) }

  try {
    // Guard: don't create a duplicate batch if one already exists for today (ET)
    const todayET    = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
    const dayStart   = new Date(`${todayET}T00:00:00-05:00`).toISOString()
    const { data: existing } = await supabase
      .from('charge_requests')
      .select('id, status')
      .eq('location_id', location_id)
      .gte('created_at', dayStart)
      .in('status', ['pending', 'processing', 'charged'])
      .limit(1)

    if (existing?.length > 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, has_charges: false, message: 'Batch already created for today.' }),
      }
    }

    // Fetch all pending appointments for this location
    const { data: appointments, error } = await supabase
      .from('pending_appointments')
      .select('*')
      .eq('location_id', location_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw new Error(`DB query failed: ${error.message}`)

    if (!appointments || appointments.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, has_charges: false, message: 'No pending appointments for today.' }),
      }
    }

    const first            = appointments[0]
    const count            = appointments.length
    const totalAmount      = appointments.reduce((sum, a) => sum + a.amount, 0)
    const perAppt          = appointments[0].amount
    const dollars          = (totalAmount / 100).toFixed(2)
    const perDollars       = (perAppt / 100).toFixed(2)
    const appointmentIds   = appointments.map(a => a.id)
    const token            = crypto.randomUUID()
    const expiresAt        = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const siteUrl          = (process.env.URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '')
    const approveUrl       = `${siteUrl}/approve?token=${token}`
    const today            = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric',
    })

    const allSamePrice     = appointments.every(a => a.amount === perAppt)
    const amountSummary    = allSamePrice
      ? `$${perDollars} × ${count} = $${dollars}`
      : `$${dollars} total (${count} appointments)`

    const descriptions     = [...new Set(appointments.map(a => a.description))].join(', ')

    // Create one charge_request for the full day's batch
    const { error: insertError } = await supabase.from('charge_requests').insert({
      token,
      location_id,
      customer_id:       first.customer_id,
      payment_method_id: first.payment_method_id,
      customer_name:     first.customer_name,
      customer_address:  { country: 'US' },
      amount:            totalAmount,
      description:       `${descriptions} — ${count} appointment${count > 1 ? 's' : ''} (${today})`,
      status:            'pending',
      expires_at:        expiresAt,
      appointment_ids:   appointmentIds,
    })

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

    // Mark appointments as batched so they aren't double-billed
    await supabase
      .from('pending_appointments')
      .update({ status: 'batched', batch_token: token })
      .in('id', appointmentIds)

    console.log(`[daily-summary] batch created — location=${location_id} count=${count} total=$${dollars}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:           true,
        has_charges:       true,
        customer_name:     first.customer_name,
        appointment_count: count,
        amount_summary:    amountSummary,
        total_amount:      totalAmount,
        total_dollars:     dollars,
        approve_url:       approveUrl,
        date:              today,
      }),
    }
  } catch (err) {
    console.error('[daily-summary]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
