import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const fmt = cents => cents != null ? `$${(cents / 100).toFixed(0)}` : '—'

const PERIODS = [
  { key: 'all',        label: 'All' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
]

export default function Reports() {
  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [period, setPeriod]   = useState('all')
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

  const q = search.trim().toLowerCase()
  const filtered = (report || []).filter(r =>
    !q ||
    r.customer_name.toLowerCase().includes(q) ||
    r.location_id.toLowerCase().includes(q)
  )

  function getPeriodData(r) {
    if (period !== 'all') return r[period]
    return {
      appointments: r.this_week.appointments + r.last_week.appointments + r.this_month.appointments,
      charged:      r.this_week.charged      + r.last_week.charged      + r.this_month.charged,
      pending:      r.this_week.pending      + r.last_week.pending      + r.this_month.pending,
      canceled:     r.this_week.canceled     + r.last_week.canceled     + r.this_month.canceled,
    }
  }

  const totals = filtered.reduce((acc, r) => {
    const p = getPeriodData(r)
    acc.appointments += p.appointments
    acc.charged      += p.charged
    acc.pending      += p.pending
    acc.canceled     += p.canceled
    return acc
  }, { appointments: 0, charged: 0, pending: 0, canceled: 0 })

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
            <div className="filter-tabs">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  className={`filter-tab ${period === p.key ? 'active' : ''}`}
                  onClick={() => setPeriod(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="db-loading"><div className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <p className="db-empty">No report data found.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Location ID</th>
                  <th className="th-num">Rate/Appt</th>
                  <th className="th-num">Appointments</th>
                  <th className="th-num">Charged</th>
                  <th className="th-num">Pending</th>
                  <th className="th-num">Canceled</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const p = getPeriodData(r)
                  return (
                    <tr key={r.location_id}>
                      <td style={{ fontWeight: 500, color: '#e0e0ff' }}>{r.customer_name}</td>
                      <td className="td-muted" style={{ fontSize: '0.75rem' }}>{r.location_id}</td>
                      <td className="th-num" style={{ color: '#a78bfa' }}>
                        {r.per_appointment_rate ? fmt(r.per_appointment_rate) : '—'}
                      </td>
                      <td className="th-num" style={{ fontWeight: 600 }}>{p.appointments}</td>
                      <td className="th-num rpt-charged">{p.charged}</td>
                      <td className="th-num rpt-pending">{p.pending}</td>
                      <td className="th-num rpt-canceled">{p.canceled}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="rpt-totals-row">
                  <td colSpan={3} style={{ fontWeight: 600, color: '#e0e0ff' }}>Total ({filtered.length} locations)</td>
                  <td className="th-num" style={{ fontWeight: 700, color: '#e0e0ff' }}>{totals.appointments}</td>
                  <td className="th-num rpt-charged" style={{ fontWeight: 700 }}>{totals.charged}</td>
                  <td className="th-num rpt-pending"  style={{ fontWeight: 700 }}>{totals.pending}</td>
                  <td className="th-num rpt-canceled" style={{ fontWeight: 700 }}>{totals.canceled}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
