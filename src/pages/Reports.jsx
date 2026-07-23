import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'
import SearchInput from '../components/SearchInput'

const fmt = cents => cents != null ? `$${(cents / 100).toFixed(0)}` : '—'

const PERIODS = [
  { key: 'all',        label: 'All' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
]

export default function Reports() {
  const [report, setReport]     = useState(null)
  const [summary, setSummary]   = useState(null)
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
      setSummary(json.summary)
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

  function getPeriodData(r) { return r[period] }

  const totals = filtered.reduce((acc, r) => {
    const p = getPeriodData(r)
    acc.manual_count    += p.manual_count
    acc.booking_count   += p.booking_count
    acc.charged         += p.charged
    acc.pending         += p.pending
    acc.canceled        += p.canceled
    acc.booking_revenue += p.booking_revenue
    acc.manual_revenue  += p.manual_revenue
    return acc
  }, { manual_count: 0, booking_count: 0, charged: 0, pending: 0, canceled: 0, booking_revenue: 0, manual_revenue: 0 })

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

      {summary && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Manual Charges</div>
            <div className="stat-value">{summary.manual_count}</div>
            <div className="stat-sub">charged manual requests</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Manual Charge Revenue</div>
            <div className="stat-value">${(summary.manual_amount / 100).toFixed(2)}</div>
            <div className="stat-sub">total collected via manual</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Appointment Bookings</div>
            <div className="stat-value">{summary.appt_count}</div>
            <div className="stat-sub">appointments charged</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Booking Revenue</div>
            <div className="stat-value">${(summary.appt_amount / 100).toFixed(2)}</div>
            <div className="stat-sub">total collected via bookings</div>
          </div>
        </div>
      )}

      <div className="db-section">
        <div className="db-section-header">
          <div className="db-section-title">Location Reports</div>
          <div className="db-section-controls">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name or location…"
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
                  <th className="th-num">Manual Charges</th>
                  <th className="th-num">Bookings</th>
                  <th className="th-num">Charged</th>
                  <th className="th-num">Pending</th>
                  <th className="th-num">Canceled</th>
                  <th className="th-num">Booking Revenue</th>
                  <th className="th-num">Manual Charge Revenue</th>
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
                      <td className="th-num" style={{ fontWeight: 600 }}>{p.manual_count}</td>
                      <td className="th-num" style={{ fontWeight: 600 }}>{p.booking_count}</td>
                      <td className="th-num rpt-charged">{p.charged}</td>
                      <td className="th-num rpt-pending">{p.pending}</td>
                      <td className="th-num rpt-canceled">{p.canceled}</td>
                      <td className="th-num" style={{ color: '#34d399' }}>${(p.booking_revenue / 100).toFixed(2)}</td>
                      <td className="th-num" style={{ color: '#a78bfa' }}>${(p.manual_revenue / 100).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="rpt-totals-row">
                  <td colSpan={3} style={{ fontWeight: 600, color: '#e0e0ff' }}>Total ({filtered.length} location{filtered.length !== 1 ? 's' : ''})</td>
                  <td className="th-num" style={{ fontWeight: 700, color: '#e0e0ff' }}>{totals.manual_count}</td>
                  <td className="th-num" style={{ fontWeight: 700, color: '#e0e0ff' }}>{totals.booking_count}</td>
                  <td className="th-num rpt-charged" style={{ fontWeight: 700 }}>{totals.charged}</td>
                  <td className="th-num rpt-pending"  style={{ fontWeight: 700 }}>{totals.pending}</td>
                  <td className="th-num rpt-canceled" style={{ fontWeight: 700 }}>{totals.canceled}</td>
                  <td className="th-num" style={{ fontWeight: 700, color: '#34d399' }}>${(totals.booking_revenue / 100).toFixed(2)}</td>
                  <td className="th-num" style={{ fontWeight: 700, color: '#a78bfa' }}>${(totals.manual_revenue / 100).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
