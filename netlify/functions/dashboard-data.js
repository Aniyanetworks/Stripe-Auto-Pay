import Stripe from 'stripe'
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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    const [[pendingRes, chargesRes], stripeCustomers] = await Promise.all([
      Promise.all([
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
      ]),
      // Fetch all Stripe customers (auto-paginate up to 10 pages / 1000 customers)
      (async () => {
        const all = []
        let params = { limit: 100 }
        for (let i = 0; i < 10; i++) {
          const page = await stripe.customers.list(params)
          all.push(...page.data)
          if (!page.has_more) break
          params.starting_after = page.data[page.data.length - 1].id
        }
        return all
      })(),
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

    // Build customers from Stripe — all customers, regardless of email format
    const customerMap = new Map()
    for (const sc of stripeCustomers) {
      const email = sc.email || ''
      const billingMatch = email.match(/^(loc_.+)@billing\.internal$/)
      // Use loc_<id> as location_id if present, otherwise fall back to Stripe customer ID
      const location_id = billingMatch ? billingMatch[1] : sc.id
      const customer_name = sc.name || sc.email || sc.id
      customerMap.set(sc.id, {
        location_id,
        customer_name,
        stripe_customer_id: sc.id,
      })
    }
    const customers = [...customerMap.values()]
      .filter(c => c.location_id?.startsWith('loc_'))
      .sort((a, b) => a.customer_name.localeCompare(b.customer_name))
    const customerIds = new Set(customers.map(c => c.location_id))

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
