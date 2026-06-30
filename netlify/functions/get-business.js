const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  const { location_id } = event.queryStringParameters || {}
  if (!location_id)
    return { statusCode: 400, body: JSON.stringify({ error: 'location_id is required' }) }

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version:       GHL_API_VERSION,
  }

  try {
    const attempts = [
      `${GHL_API_BASE}/businesses?locationId=${location_id}&limit=20`,
      `${GHL_API_BASE}/businesses?location_id=${location_id}&limit=20`,
      `${GHL_API_BASE}/businesses?limit=20`,
    ]

    for (const url of attempts) {
      const r    = await fetch(url, { headers })
      const text = await r.text()
      console.log('[get-business] tried:', url, '→', r.status, text.slice(0, 300))

      if (r.ok) {
        const data       = JSON.parse(text)
        const businesses = data.businesses || data.data || (Array.isArray(data) ? data : null)
        if (businesses?.length > 0) {
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businesses: businesses.map(b => ({ id: b.id, name: b.name })) }),
          }
        }
      }
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'No businesses found.' }) }
  } catch (err) {
    console.error('[get-business]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', detail: err.message }) }
  }
}
