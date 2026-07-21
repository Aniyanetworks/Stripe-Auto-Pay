import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const PRESETS = [
  { label: '+7 days',  days: 7 },
  { label: '+14 days', days: 14 },
  { label: '+30 days', days: 30 },
]

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function toDatetimeLocal(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function ExtendTokenModal({ charge, onClose, onSaved }) {
  const currentExpiry = new Date(charge.expires_at)
  const [expiresAt, setExpiresAt] = useState(toDatetimeLocal(addDays(7)))
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  function applyPreset(days) {
    setExpiresAt(toDatetimeLocal(addDays(days)))
  }

  async function handleSave() {
    setError('')
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res  = await fetch('/api/extend-token', {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: charge.id, expires_at: new Date(expiresAt).toISOString() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setLoading(false); return }
      onSaved?.(json.expires_at)
      onClose()
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Change Expiry Date</h2>

        <div className="mc-field">
          <label className="mc-label">Current Expiry</label>
          <div className="expiry-current">
            {currentExpiry < new Date()
              ? <span className="expiry-expired">Expired — {currentExpiry.toLocaleString()}</span>
              : <span className="expiry-valid">{currentExpiry.toLocaleString()}</span>
            }
          </div>
        </div>

        <div className="mc-field">
          <label className="mc-label">Quick Presets</label>
          <div className="amount-pills">
            {PRESETS.map(p => (
              <button
                key={p.days}
                type="button"
                className="amount-pill"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-field">
          <label className="mc-label">Custom Date & Time</label>
          <input
            type="datetime-local"
            className="mc-input"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            min={toDatetimeLocal(new Date())}
          />
        </div>

        {error && <div className="mc-error">{error}</div>}

        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-submit" onClick={handleSave} disabled={loading}>
            {loading ? '…' : 'Save Expiry'}
          </button>
        </div>
      </div>
    </div>
  )
}
