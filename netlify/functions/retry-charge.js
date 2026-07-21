import crypto from 'crypto'
import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
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

  const newToken   = crypto.randomUUID()
  const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const siteUrl    = (process.env.URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '')
  const approveUrl = `${siteUrl}/approve?token=${newToken}`

  const { error: updateError } = await supabase
    .from('charge_requests')
    .update({ token: newToken, status: 'pending', expires_at: expiresAt })
    .eq('id', id)

  if (updateError)
    return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, approve_url: approveUrl, token: newToken }),
  }
}
