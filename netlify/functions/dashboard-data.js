import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer '))
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user)
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }

    const [pendingRes, chargesRes] = await Promise.all([
      supabase
        .from('pending_appointments')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('charge_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (pendingRes.error) throw new Error(pendingRes.error.message)
    if (chargesRes.error) throw new Error(chargesRes.error.message)

    const pending = pendingRes.data || []
    const charges = chargesRes.data || []

    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const monthRevenue = charges
      .filter(c => c.status === 'charged' && c.created_at >= monthStart)
      .reduce((sum, c) => sum + c.amount, 0)

    const awaitingApproval = charges.filter(c =>
      c.status === 'pending' && new Date(c.expires_at) >= now
    ).length

    // Distinct customers from all activity
    const customerMap = new Map()
    for (const a of pending) {
      if (!customerMap.has(a.location_id))
        customerMap.set(a.location_id, { location_id: a.location_id, customer_name: a.customer_name || a.location_id })
    }
    for (const c of charges) {
      if (!customerMap.has(c.location_id))
        customerMap.set(c.location_id, { location_id: c.location_id, customer_name: c.customer_name || c.location_id })
    }
    const customers   = [...customerMap.values()]
    const customerIds = new Set(customerMap.keys())

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stats: {
          queued_count:      pending.length,
          awaiting_approval: awaitingApproval,
          month_revenue:     monthRevenue,
          customer_count:    customerIds.size,
        },
        pending,
        charges,
        customers,
      }),
    }
  } catch (err) {
    console.error('[dashboard-data]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
