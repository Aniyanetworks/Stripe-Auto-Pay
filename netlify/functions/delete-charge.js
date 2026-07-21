import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'DELETE')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer '))
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user)
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }

  const { id } = JSON.parse(event.body || '{}')
  if (!id)
    return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) }

  const { data: entry } = await supabase
    .from('charge_requests')
    .select('status, appointment_ids')
    .eq('id', id)
    .single()

  if (!entry)
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) }

  if (entry.status === 'processing')
    return { statusCode: 409, body: JSON.stringify({ error: 'Cannot delete a charge that is currently processing' }) }

  // Reset linked appointments back to pending so they re-queue on next daily-summary
  if (entry.appointment_ids?.length) {
    await supabase
      .from('pending_appointments')
      .update({ status: 'pending', batch_token: null })
      .in('id', entry.appointment_ids)
      .eq('status', 'batched')
  }

  const { error } = await supabase.from('charge_requests').delete().eq('id', id)
  if (error)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }

  return { statusCode: 200, body: JSON.stringify({ success: true }) }
}
