import { supabase } from './lib/supabase.js'

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

    const { id } = JSON.parse(event.body || '{}')
    if (!id)
      return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) }

    const { data: entry, error: fetchError } = await supabase
      .from('charge_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !entry)
      return { statusCode: 404, body: JSON.stringify({ error: 'Charge request not found' }) }

    const isExpired = entry.status === 'pending' && new Date(entry.expires_at) < new Date()
    const isFailed  = entry.status === 'failed'

    if (!isExpired && !isFailed)
      return { statusCode: 409, body: JSON.stringify({ error: 'Only failed or expired charges can be retried' }) }

    // Put appointments back into the pending queue so next daily-summary picks them up
    if (entry.appointment_ids?.length) {
      await supabase
        .from('pending_appointments')
        .update({ status: 'pending', batch_token: null })
        .in('id', entry.appointment_ids)
        .eq('status', 'batched') // never touch already-charged appointments
    }

    // Mark the charge request as retried (kept for audit history, not deleted)
    await supabase
      .from('charge_requests')
      .update({ status: 'retried' })
      .eq('id', id)

    console.log(`[retry-charge] id=${id} requeued ${entry.appointment_ids?.length ?? 0} appointments`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success:              true,
        appointments_requeued: entry.appointment_ids?.length ?? 0,
      }),
    }
  } catch (err) {
    console.error('[retry-charge]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
