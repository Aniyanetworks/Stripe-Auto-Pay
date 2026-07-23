import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const fmt     = cents => cents != null ? `$${(cents / 100).toFixed(0)}` : '—'
const fmtFull = cents => cents != null ? `$${(cents / 100).toFixed(2)}` : '—'

function PeriodBlock({ label, data }) {
  return (
    <div className="rpt-period">
      <div className="rpt-period-label">{label}</div>
      <div className="rpt-period-appts">{data.appointments} appt{data.appointments !== 1 ? 's' : ''}</div>
      <div className="rpt-period-stats">
        <span className="rpt-stat rpt-charged">✓ {data.charged} charged</span>
        <span className="rpt-stat rpt-pending">◷ {data.pending} pending</span>
        <span className="rpt-stat rpt-canceled">✕ {data.canceled} canceled</span>
      </div>
    </div>
  )
}

export default function Reports() {
  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/login'); return }
    try {
      const res = await fetch('/api/reports-data', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.status === 401) { navigate('/login'); return }
      if (!res.ok) throw new Error('Failed to load report data')
      const json = await res.json()
      setReport(json.report)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const filtered = (report || []).filter(r =>
    !search.trim() ||
    r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    r.location_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="db-wrapper">
      <header className="db-header">
        <Logo />
        <div className="db-header-actions">
          <button className="btn-ghost" onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <button className="btn-ghost" onClick={loadData} disabled={loading}>{loading ? '...' : '↻ Refresh'}</button>
          <button className="btn-ghost btn-ghost-danger" onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}>Sign Out</button>
        </div>
      </header>

      {error && <div className="db-error">{error}</div>}

      <div className="db-section">
        <div className="db-section-header">
          <div className="db-section-title">Location Reports</div>
          <div className="db-section-controls">
            <input
              className="table-search"
              placeholder="Search name or location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="db-loading"><div className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <p className="db-empty">No report data found.</p>
        ) : (
          <div className="rpt-grid">
            {filtered.map(r => (
              <div className="rpt-card" key={r.location_id}>
                <div className="rpt-card-header">
                  <div>
                    <div className="rpt-name">{r.customer_name}</div>
                    <div className="rpt-loc">{r.location_id}</div>
                  </div>
                  {r.per_appointment_rate && (
                    <div className="rpt-rate">
                      {fmt(r.per_appointment_rate)}<span className="rpt-rate-sub">/appt</span>
                    </div>
                  )}
                </div>
                <div className="rpt-periods">
                  <PeriodBlock label="This Week"  data={r.this_week} />
                  <PeriodBlock label="Last Week"  data={r.last_week} />
                  <PeriodBlock label="This Month" data={r.this_month} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
