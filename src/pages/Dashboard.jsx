import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'
import ConfirmModal from '../components/ConfirmModal'

const fmt = cents => `$${(cents / 100).toFixed(2)}`
const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_BADGE = {
  pending:    { label: 'Pending',    cls: 'badge-pending' },
  expired:    { label: 'Expired',    cls: 'badge-expired' },
  processing: { label: 'Processing', cls: 'badge-processing' },
  charged:    { label: 'Charged',    cls: 'badge-charged' },
  failed:     { label: 'Failed',     cls: 'badge-failed' },
  rejected:   { label: 'Rejected',   cls: 'badge-rejected' },
}

function Badge({ status }) {
  const b = STATUS_BADGE[status] || { label: status, cls: '' }
  return <span className={`badge ${b.cls}`}>{b.label}</span>
}

function effectiveStatus(c) {
  if (c.status === 'pending' && new Date(c.expires_at) < new Date()) return 'expired'
  return c.status
}

const STATUS_FILTERS = ['all', 'pending', 'expired', 'charged', 'failed', 'rejected']

export default function Dashboard() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('all')
  const [deleting, setDeleting]       = useState(null)
  const [retrying, setRetrying]       = useState(null)
  const [confirmId, setConfirmId]     = useState(null)
  const navigate                = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/login'); return }

    try {
      const res = await fetch('/api/dashboard-data', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.status === 401) { navigate('/login'); return }
      if (!res.ok) throw new Error('Failed to load dashboard data')
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  async function handleDelete(id) {
    setConfirmId(id)
  }

  async function confirmDelete() {
    const id = confirmId
    setConfirmId(null)
    setDeleting(id)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/delete-charge', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      setData(prev => ({ ...prev, charges: prev.charges.filter(c => c.id !== id) }))
    } catch (e) {
      alert(e.message)
    }
    setDeleting(null)
  }

  async function handleRetry(id) {
    setRetrying(id)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/retry-charge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      // Refresh data so new token + status are reflected
      await loadData()
    } catch (e) {
      alert(e.message)
    }
    setRetrying(null)
  }

  const filteredCharges = data?.charges.filter(c => {
    if (filter === 'all') return true
    return effectiveStatus(c) === filter
  }) ?? []

  return (
    <div className="db-wrapper">
      <header className="db-header">
        <Logo />
        <div className="db-header-actions">
          <button className="btn-ghost" onClick={loadData} disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>
          <button className="btn-ghost btn-ghost-danger" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {error && <div className="db-error">{error}</div>}

      {loading && !data ? (
        <div className="db-loading">
          <div className="loading-spinner" />
        </div>
      ) : data ? (
        <>
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Queued Today</div>
              <div className="stat-value">{data.stats.queued_count}</div>
              <div className="stat-sub">appointments not yet batched</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Awaiting Approval</div>
              <div className="stat-value" style={data.stats.awaiting_approval > 0 ? { color: '#fbbf24' } : {}}>
                {data.stats.awaiting_approval}
              </div>
              <div className="stat-sub">charges pending Carl's approval</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Revenue This Month</div>
              <div className="stat-value">{fmt(data.stats.month_revenue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Locations</div>
              <div className="stat-value">{data.stats.customer_count}</div>
            </div>
          </div>

          {/* Pending Queue */}
          <div className="db-section">
            <div className="db-section-title">Pending Appointments</div>
            {data.pending.length === 0 ? (
              <p className="db-empty">No pending appointments — queue is clear.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pending.map(a => (
                      <tr key={a.id}>
                        <td>{a.customer_name || a.location_id}</td>
                        <td>{fmt(a.amount)}</td>
                        <td className="td-desc">{a.description}</td>
                        <td className="td-muted">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Charge History */}
          <div className="db-section">
            <div className="db-section-header">
              <div className="db-section-title">Charge History</div>
              <div className="filter-tabs">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f}
                    className={`filter-tab ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {filteredCharges.length === 0 ? (
              <p className="db-empty">No {filter === 'all' ? '' : filter + ' '}charge requests.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCharges.map(c => {
                      const status = effectiveStatus(c)
                      return (
                        <tr key={c.id}>
                          <td>{c.customer_name || c.location_id}</td>
                          <td>{fmt(c.amount)}</td>
                          <td className="td-desc">{c.description}</td>
                          <td><Badge status={status} /></td>
                          <td className="td-muted">{fmtDate(c.created_at)}</td>
                          <td className="td-actions">
                            {status === 'pending' && c.token && (
                              <a
                                className="table-link"
                                href={`/approve?token=${c.token}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Approve →
                              </a>
                            )}
                            {(status === 'failed' || status === 'expired') && (
                              <button
                                className="btn-retry"
                                onClick={() => handleRetry(c.id)}
                                disabled={retrying === c.id}
                                title="Reset to pending"
                              >
                                {retrying === c.id ? '…' : '↺ Retry'}
                              </button>
                            )}
                            {status !== 'processing' && (
                              <button
                                className="btn-delete"
                                onClick={() => handleDelete(c.id)}
                                disabled={deleting === c.id}
                                title="Delete"
                              >
                                {deleting === c.id ? '…' : '✕'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {confirmId && (
        <ConfirmModal
          message="Delete this charge request? This cannot be undone."
          onConfirm={confirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
