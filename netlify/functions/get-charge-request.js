import { supabase } from './lib/supabase.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { token } = event.queryStringParameters || {}
  if (!token)
    return { statusCode: 400, body: JSON.stringify({ error: 'token required' }) }

  try {
    const { data, error } = await supabase
      .from('charge_requests')
      .select('customer_name, amount, description, status, expires_at')
      .eq('token', token)
      .single()

    if (error || !data)
      return { statusCode: 404, body: JSON.stringify({ error: 'Charge request not found or expired' }) }

    if (new Date(data.expires_at) < new Date())
      return { statusCode: 410, body: JSON.stringify({ error: 'This charge request has expired' }) }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: data.customer_name,
        amount:        data.amount,
        description:   data.description,
        status:        data.status,
      }),
    }
  } catch (err) {
    console.error('[get-charge-request]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
