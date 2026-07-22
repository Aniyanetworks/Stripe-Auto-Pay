import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AMOUNTS = [
  { label: '$250',  cents: 25000 },
  { label: '$500',  cents: 50000 },
  { label: '$1,000', cents: 100000 },
]

export default function ManualChargeModal({ customers, onClose, onSuccess }) {
  const [selected, setSelected]       = useState(null) // full customer object
  const [amount, setAmount]           = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [result, setResult]           = useState(null)
  const [copied, setCopied]           = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selected)   { setError('Select a customer.'); return }
    if (!amount)     { setError('Select an amount.'); return }
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
          /* Success state */
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
          /* Form state */
          <>
            <h2 className="modal-title">New Manual Charge</h2>
            <form onSubmit={handleSubmit}>
              <div className="mc-field">
                <label className="mc-label">Customer</label>
                <select
                  className="mc-select"
                  value={selected?.stripe_customer_id || ''}
                  onChange={e => setSelected(customers.find(c => c.stripe_customer_id === e.target.value) || null)}
                  required
                >
                  <option value="">— Select customer —</option>
                  {customers.map(c => (
                    <option key={c.stripe_customer_id} value={c.stripe_customer_id}>
                      {c.customer_name}
                    </option>
                  ))}
                </select>
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
