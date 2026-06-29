const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

export async function createBusiness(req, res) {
  const { name, location_id } = req.body
  if (!name || !location_id)
    return res.status(400).json({ error: 'name and location_id required' })

  try {
    const ghlRes = await fetch(`${GHL_API_BASE}/businesses/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, locationId: location_id }),
    })

    const text = await ghlRes.text()
    console.log('[create-business] GHL response:', ghlRes.status, text)

    if (!ghlRes.ok) throw new Error(`GHL ${ghlRes.status}: ${text}`)

    const data       = JSON.parse(text)
    const business   = data.business || data
    const businessId = business.id

    const siteUrl    = (process.env.SITE_URL || 'http://localhost:3001').replace(/\/$/, '')

    res.json({
      success:     true,
      business_id: businessId,
      onboard_url: `${siteUrl}/onboard?location_id=${businessId}`,
    })
  } catch (err) {
    console.error('[create-business]', err)
    res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
