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

    const { id, expires_at } = JSON.parse(event.body || '{}')
    if (!id || !expires_at)
      return { statusCode: 400, body: JSON.stringify({ error: 'id and expires_at required' }) }

    const newExpiry = new Date(expires_at)
    if (isNaN(newExpiry.getTime()) || newExpiry <= new Date())
      return { statusCode: 400, body: JSON.stringify({ error: 'expires_at must be a future date' }) }

    const { data: entry } = await supabase.from('charge_requests').select('status').eq('id', id).single()
    if (!entry)
      return { statusCode: 404, body: JSON.stringify({ error: 'Charge request not found' }) }

    if (['charged', 'processing', 'rejected'].includes(entry.status))
      return { statusCode: 409, body: JSON.stringify({ error: `Cannot extend a ${entry.status} charge` }) }

    // If it was expired (pending with past date), reset status to pending
    const updates = { expires_at: newExpiry.toISOString() }
    if (entry.status === 'pending') updates.status = 'pending' // stays pending

    const { error: updateError } = await supabase
      .from('charge_requests')
      .update(updates)
      .eq('id', id)

    if (updateError) throw new Error(updateError.message)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, expires_at: newExpiry.toISOString() }),
    }
  } catch (err) {
    console.error('[extend-token]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
