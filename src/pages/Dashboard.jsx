import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'
import ConfirmModal from '../components/ConfirmModal'
import ManualChargeModal from '../components/ManualChargeModal'

const fmt     = cents => `$${(cents / 100).toFixed(2)}`
const fmtDate = iso   => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_BADGE = {
  batched:    { label: 'Batched',    cls: 'badge-batched' },
  pending:    { label: 'Pending',    cls: 'badge-pending' },
  processing: { label: 'Processing', cls: 'badge-processing' },
  charged:    { label: 'Charged',    cls: 'badge-charged' },
  failed:     { label: 'Failed',     cls: 'badge-failed' },
  rejected:   { label: 'Rejected',   cls: 'badge-rejected' },
  retried:    { label: 'Requeued',   cls: 'badge-retried' },
}

function Badge({ status }) {
  const b = STATUS_BADGE[status] || { label: status, cls: '' }
  return <span className={`badge ${b.cls}`}>{b.label}</span>
}

function effectiveStatus(c) {
  if (c.status === 'pending' && c.appointment_ids?.length) return 'batched'
  return c.status
}

const STATUS_FILTERS = ['all', 'batched', 'pending', 'charged', 'failed', 'rejected', 'retried']

function CustomerListModal({ customers, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = customers.filter(c =>
    c.customer_name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Stripe Customers ({customers.length})</h2>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '0.25rem 0.75rem' }}>✕</button>
        </div>
        <input
          className="mc-input"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: '1rem' }}
          autoFocus
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <p style={{ color: '#55557a', textAlign: 'center', padding: '2rem 0' }}>No customers found.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Location ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.stripe_customer_id}>
                    <td className="td-muted">{i + 1}</td>
                    <td>{c.customer_name}</td>
                    <td className="td-muted" style={{ fontSize: '0.75rem' }}>{c.location_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [deleting, setDeleting]   = useState(false)
  const [retrying, setRetrying]   = useState(false)
  const [confirmMode, setConfirmMode]     = useState(null) // 'single' | 'bulk'
  const [showChargeModal, setShowChargeModal]   = useState(false)
  const [showCustomers, setShowCustomers] = useState(false)
  const [selectedIds, setSelectedIds]     = useState(new Set())
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    setSelectedIds(new Set())
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

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ── Selection ─────────────────────────────────────────────────────
  function toggleRow(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filteredCharges.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredCharges.map(c => c.id)))
    }
  }

  // ── Single delete ─────────────────────────────────────────────────
  function handleDeleteSingle(id) {
    setSelectedIds(new Set([id]))
    setConfirmMode('single')
  }

  // ── Bulk delete ───────────────────────────────────────────────────
  function handleBulkDelete() {
    setConfirmMode('bulk')
  }

  async function confirmDelete() {
    const ids = [...selectedIds]
    setConfirmMode(null)
    setDeleting(true)
    const session = await getSession()
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch('/api/delete-charge', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      )
    )
    const deleted = ids.filter((_, i) => results[i].status === 'fulfilled' && results[i].value.ok)
    setData(prev => ({ ...prev, charges: prev.charges.filter(c => !deleted.includes(c.id)) }))
    setSelectedIds(new Set())
    setDeleting(false)
  }

  // ── Single retry ──────────────────────────────────────────────────
  async function handleRetrySingle(id) {
    setRetrying(true)
    const session = await getSession()
    try {
      const res  = await fetch('/api/retry-charge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      await loadData()
    } catch (e) { alert(e.message) }
    setRetrying(false)
  }

  // ── Bulk retry ────────────────────────────────────────────────────
  async function handleBulkRetry() {
    const retryable = [...selectedIds].filter(id => {
      const c = data.charges.find(x => x.id === id)
      if (!c) return false
      return effectiveStatus(c) === 'failed'
    })
    if (retryable.length === 0) { alert('No failed charges in selection.'); return }
    setRetrying(true)
    const session = await getSession()
    await Promise.allSettled(
      retryable.map(id =>
        fetch('/api/retry-charge', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      )
    )
    setSelectedIds(new Set())
    setRetrying(false)
    await loadData()
  }

  // For 'retried' entries: keep only the most recent per location per day
  const deduped = data ? (() => {
    const seen = new Map()
    return [...data.charges].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).filter(c => {
      if (c.status !== 'retried') return true
      const day = new Date(c.created_at).toDateString()
      const key = `${c.location_id}|${day}`
      if (seen.has(key)) return false
      seen.set(key, true)
      return true
    })
  })() : []

  const q = search.trim().toLowerCase()
  const filteredCharges = deduped.filter(c => {
    if (filter !== 'all' && effectiveStatus(c) !== filter) return false
    if (!q) return true
    return (
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.location_id   || '').toLowerCase().includes(q)
    )
  })

  const allSelected  = filteredCharges.length > 0 && selectedIds.size === filteredCharges.length
  const someSelected = selectedIds.size > 0

  return (
    <div className="db-wrapper">
      <header className="db-header">
        <Logo />
        <div className="db-header-actions">
          <button className="btn-ghost btn-ghost-primary" onClick={() => setShowChargeModal(true)}>
            + New Charge
          </button>
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
        <div className="db-loading"><div className="loading-spinner" /></div>
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
            <div className="stat-card stat-card-clickable" onClick={() => setShowCustomers(true)}>
              <div className="stat-label">Stripe Customers</div>
              <div className="stat-value">{data.stats.customer_count}</div>
              <div className="stat-sub">click to view all</div>
            </div>
          </div>

          {/* Charge History */}
          <div className="db-section">
            <div className="db-section-header">
              <div className="db-section-title">Charge History</div>
              <div className="db-section-controls">
                <input
                  className="table-search"
                  type="text"
                  placeholder="Search name or location…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <div className="filter-tabs">
                  {STATUS_FILTERS.map(f => (
                    <button
                      key={f}
                      className={`filter-tab ${filter === f ? 'active' : ''}`}
                      onClick={() => { setFilter(f); setSelectedIds(new Set()); setSearch('') }}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bulk action bar */}
            {someSelected && (
              <div className="bulk-bar">
                <span className="bulk-count">{selectedIds.size} selected</span>
                <button
                  className="btn-retry"
                  onClick={handleBulkRetry}
                  disabled={retrying}
                >
                  {retrying ? '…' : '↺ Retry Selected'}
                </button>
                <button
                  className="btn-bulk-delete"
                  onClick={handleBulkDelete}
                  disabled={deleting}
                >
                  {deleting ? '…' : '✕ Delete Selected'}
                </button>
                <button className="bulk-clear" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </button>
              </div>
            )}

            {filteredCharges.length === 0 ? (
              <p className="db-empty">No {filter === 'all' ? '' : filter + ' '}charge requests.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="th-check">
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={allSelected}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Customer</th>
                      <th>Location</th>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCharges.map(c => {
                      const status   = effectiveStatus(c)
                      const checked  = selectedIds.has(c.id)
                      return (
                        <tr key={c.id} className={checked ? 'row-selected' : ''}>
                          <td className="td-check">
                            <input
                              type="checkbox"
                              className="row-check"
                              checked={checked}
                              onChange={() => toggleRow(c.id)}
                            />
                          </td>
                          <td>{c.customer_name || c.location_id}</td>
                          <td className="td-muted" style={{ fontSize: '0.78rem' }}>{c.location_id}</td>
                          <td>{fmt(c.amount)}</td>
                          <td className="td-desc">{c.description}</td>
                          <td><Badge status={status} /></td>
                          <td className="td-muted">{fmtDate(c.created_at)}</td>
                          <td className="td-actions">
                            {(status === 'pending' || status === 'batched') && c.token && (
                              <a className="table-link" href={`/approve?token=${c.token}`} target="_blank" rel="noreferrer">
                                Approve →
                              </a>
                            )}
                            {status === 'failed' && (
                              <button
                                className="btn-retry"
                                onClick={() => handleRetrySingle(c.id)}
                                disabled={retrying}
                              >
                                {retrying ? '…' : '↺ Retry'}
                              </button>
                            )}
                            {status !== 'processing' && (
                              <button
                                className="btn-delete"
                                onClick={() => handleDeleteSingle(c.id)}
                                disabled={deleting}
                                title="Delete"
                              >
                                {deleting ? '…' : '✕'}
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

      {showChargeModal && (
        <ManualChargeModal
          customers={data?.customers ?? []}
          onClose={() => setShowChargeModal(false)}
          onSuccess={loadData}
        />
      )}

      {showCustomers && (
        <CustomerListModal
          customers={data?.customers ?? []}
          onClose={() => setShowCustomers(false)}
        />
      )}

      {confirmMode && (
        <ConfirmModal
          message={
            confirmMode === 'bulk'
              ? `Delete ${selectedIds.size} charge request${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`
              : 'Delete this charge request? This cannot be undone.'
          }
          onConfirm={confirmDelete}
          onCancel={() => setConfirmMode(null)}
        />
      )}
    </div>
  )
}
