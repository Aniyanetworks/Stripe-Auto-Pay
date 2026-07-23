import { supabase } from './lib/supabase.js'

function weekBounds(offsetWeeks = 0) {
  const now  = new Date()
  const day  = now.getDay() // 0=Sun
  const mon  = new Date(now)
  mon.setDate(now.getDate() - ((day + 6) % 7) - offsetWeeks * 7)
  mon.setHours(0, 0, 0, 0)
  const sun  = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { start: mon.toISOString(), end: sun.toISOString() }
}

function monthBounds() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end   = now.toISOString()
  return { start, end }
}

function inRange(iso, start, end) {
  return iso >= start && iso <= end
}

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

    // Fetch all charge_requests for the last 2 months
    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    const { data: charges, error } = await supabase
      .from('charge_requests')
      .select('*')
      .gte('created_at', twoMonthsAgo.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const thisWeek  = weekBounds(0)
    const lastWeek  = weekBounds(1)
    const thisMonth = monthBounds()

    // Group by location
    const locMap = new Map()

    // Overall summary counters
    const summary = {
      manual_count:      0,
      manual_amount:     0,
      appt_count:        0,
      appt_amount:       0,
    }

    for (const c of charges) {
      const key = c.location_id
      if (!locMap.has(key)) {
        locMap.set(key, {
          location_id:   c.location_id,
          customer_name: c.customer_name || c.location_id,
          per_appointment_rate: null,
          all:        { appointments: 0, charged: 0, pending: 0, canceled: 0 },
          this_week:  { appointments: 0, charged: 0, pending: 0, canceled: 0 },
          last_week:  { appointments: 0, charged: 0, pending: 0, canceled: 0 },
          this_month: { appointments: 0, charged: 0, pending: 0, canceled: 0 },
        })
      }

      const loc       = locMap.get(key)
      const apptCount = c.appointment_ids?.length || 0
      const isManual  = apptCount === 0

      // Derive per-appointment rate from non-manual charges
      if (apptCount > 0 && loc.per_appointment_rate === null) {
        loc.per_appointment_rate = Math.round(c.amount / apptCount)
      }

      const statusGroup =
        c.status === 'charged'                                    ? 'charged'  :
        ['pending', 'batched', 'processing'].includes(c.status)  ? 'pending'  :
        ['failed', 'rejected', 'retried'].includes(c.status)     ? 'canceled' : null

      if (!statusGroup) continue

      // Overall summary (all time, only charged)
      if (c.status === 'charged') {
        if (isManual) {
          summary.manual_count++
          summary.manual_amount += c.amount
        } else {
          summary.appt_count  += apptCount
          summary.appt_amount += c.amount
        }
      }

      function addTo(period) {
        const count = apptCount || 1
        period.appointments += count
        period[statusGroup] += count
      }

      addTo(loc.all)
      if (inRange(c.created_at, thisWeek.start,  thisWeek.end))  addTo(loc.this_week)
      if (inRange(c.created_at, lastWeek.start,  lastWeek.end))  addTo(loc.last_week)
      if (inRange(c.created_at, thisMonth.start, thisMonth.end)) addTo(loc.this_month)
    }

    const report = [...locMap.values()].sort((a, b) =>
      a.customer_name.localeCompare(b.customer_name)
    )

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, summary }),
    }
  } catch (err) {
    console.error('[reports-data]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
