import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const AMOUNTS = [
  { label: '$250',   cents: 25000 },
  { label: '$500',   cents: 50000 },
  { label: '$1,000', cents: 100000 },
]

function CustomerDropdown({ customers, selected, onSelect }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef(null)

  const filtered = query.trim()
    ? customers.filter(c =>
        c.customer_name.toLowerCase().includes(query.toLowerCase()) ||
        (c.stripe_customer_id || '').toLowerCase().includes(query.toLowerCase())
      )
    : customers

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function pick(c) { onSelect(c); setQuery(''); setOpen(false) }

  const displayValue = open ? query : (selected?.customer_name || '')

  return (
    <div className="cdd-wrap" ref={ref}>
      <input
        className="cdd-input"
        placeholder="Search by name or location…"
        value={displayValue}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className="cdd-menu">
          <div className="cdd-list">
            {filtered.length === 0 ? (
              <div className="cdd-empty">No customers found</div>
            ) : filtered.map(c => (
              <div
                key={c.stripe_customer_id}
                className={`cdd-item ${selected?.stripe_customer_id === c.stripe_customer_id ? 'selected' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(c)}
              >
                <span className="cdd-item-name">{c.customer_name}</span>
                <span className="cdd-item-loc">{c.stripe_customer_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ManualChargeModal({ customers, onClose, onSuccess }) {
  const locCustomers = customers
  const [selected, setSelected]       = useState(null)
  const [amount, setAmount]           = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [result, setResult]           = useState(null)
  const [copied, setCopied]           = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selected) { setError('Select a customer.'); return }
    if (!amount)   { setError('Select an amount.'); return }
    setError('')
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res  = await fetch('/api/manual-charge', {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          location_id:        selected.location_id,
          stripe_customer_id: selected.stripe_customer_id,
          amount,
          description: description.trim() || 'Manual charge',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      setResult(json)
      onSuccess?.()
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
        {result ? (
          <>
            <div className="modal-icon modal-icon-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="modal-message" style={{ marginBottom: '0.5rem' }}>Charge request created!</p>
            <p style={{ fontSize: '0.8rem', color: '#55557a', marginBottom: '1.25rem' }}>
              Share this link with Carl to approve the charge:
            </p>
            <div className="approve-url-box">
              <span className="approve-url-text">{result.approve_url}</span>
              <button
                className={`btn-copy ${copied ? 'btn-copy-success' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(result.approve_url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <a className="modal-btn modal-btn-confirm" href={result.approve_url} target="_blank" rel="noreferrer"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Open Approve Page
              </a>
              <button className="modal-btn modal-btn-cancel" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title">New Manual Charge</h2>
            <form onSubmit={handleSubmit}>
              <div className="mc-field">
                <label className="mc-label">Customer</label>
                <CustomerDropdown
                  customers={locCustomers}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>

              <div className="mc-field">
                <label className="mc-label">Amount</label>
                <div className="amount-pills">
                  {AMOUNTS.map(a => (
                    <button
                      key={a.cents}
                      type="button"
                      className={`amount-pill ${amount === a.cents ? 'active' : ''}`}
                      onClick={() => setAmount(a.cents)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mc-field">
                <label className="mc-label">Description <span className="mc-optional">(optional)</span></label>
                <input
                  type="text"
                  className="mc-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Monthly service fee"
                  maxLength={120}
                />
              </div>

              {error && <div className="mc-error">{error}</div>}

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
                <button type="submit" className="modal-btn modal-btn-submit" disabled={loading}>
                  {loading ? '…' : 'Create Charge'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
