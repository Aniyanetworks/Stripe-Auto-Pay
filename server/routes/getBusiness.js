const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

export async function getBusiness(req, res) {
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id is required' })

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: GHL_API_VERSION,
  }

  try {
    // Try fetching businesses list for this location
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
        if (businesses && businesses.length > 0) {
          return res.json({
            businesses: businesses.map(b => ({ id: b.id, name: b.name })),
          })
        }
      }
    }

    res.status(404).json({ error: 'No businesses found. Check the logs for details.' })
  } catch (err) {
    console.error('[get-business]', err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
