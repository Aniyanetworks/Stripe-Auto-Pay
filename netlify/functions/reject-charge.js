import { supabase } from './lib/supabase.js'
import { postSlack } from './lib/slack.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { token } = JSON.parse(event.body || '{}')
  if (!token)
    return { statusCode: 400, body: JSON.stringify({ error: 'token required' }) }

  try {
    const { data: entry, error } = await supabase
      .from('charge_requests')
      .select('customer_name, amount, description, status, expires_at')
      .eq('token', token)
      .single()

    if (error || !entry)
      return { statusCode: 404, body: JSON.stringify({ error: 'Charge request not found or expired' }) }

    if (new Date(entry.expires_at) < new Date())
      return { statusCode: 410, body: JSON.stringify({ error: 'This charge request has expired' }) }

    if (entry.status !== 'pending')
      return { statusCode: 409, body: JSON.stringify({ error: `Charge already ${entry.status}` }) }

    await supabase.from('charge_requests').update({ status: 'rejected' }).eq('token', token)

    const dollars = (entry.amount / 100).toFixed(2)
    await postSlack(
      `❌ *Charge Rejected*\n` +
      `*Customer:* ${entry.customer_name}\n` +
      `*Amount:* $${dollars}\n` +
      `*Description:* ${entry.description}`
    )

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }
  } catch (err) {
    console.error('[reject-charge]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
