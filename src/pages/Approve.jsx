import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import SecureBadge from '../components/SecureBadge'

export default function Approve() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status,  setStatus]  = useState('loading') // loading | ready | error | done
  const [charge,  setCharge]  = useState(null)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!token) {
      setMessage('Invalid approval link.')
      setStatus('error')
      return
    }

    fetch(`/api/charge-request/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setMessage(data.error); setStatus('error'); return }
        if (data.status !== 'pending') {
          setMessage(`This charge has already been ${data.status}.`)
          setStatus('done')
          return
        }
        setCharge(data)
        setStatus('ready')
      })
      .catch(() => { setMessage('Could not load charge details.'); setStatus('error') })
  }, [token])

  async function handleDecision(action) {
    setWorking(true)
    try {
      const res  = await fetch(`/api/${action}-charge`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')

      setMessage(
        action === 'approve'
          ? `Payment of $${(charge.amount / 100).toFixed(2)} processed successfully.`
          : 'Charge rejected. No payment was taken.'
      )
      setStatus('done')
    } catch (err) {
      setMessage(err.message)
      setWorking(false)
    }
  }

  const dollars = charge ? `$${(charge.amount / 100).toFixed(2)}` : ''

  if (status === 'loading') {
    return (
      <div className="loading-overlay" aria-label="Loading">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="page-wrapper">
        <div className="card" style={{ textAlign: 'center' }}>
          <Logo />
          <div className="status-msg error" role="alert">{message}</div>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="page-wrapper">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <Logo />
          </div>
          <div className="status-msg info" role="status">{message}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="card">
        <Logo />
        <h1>Charge Approval</h1>
        <p className="subtitle">Review the charge details below and approve or reject.</p>

        <div className="charge-summary">
          <div className="charge-row">
            <span className="charge-label">Customer</span>
            <span className="charge-value">{charge.customer_name}</span>
          </div>
          <div className="charge-row">
            <span className="charge-label">Amount</span>
            <span className="charge-value charge-amount">{dollars}</span>
          </div>
          <div className="charge-row">
            <span className="charge-label">Description</span>
            <span className="charge-value">{charge.description}</span>
          </div>
        </div>

        {message && <div className="status-msg error" role="alert" style={{ marginBottom: '1rem' }}>{message}</div>}

        <div className="approve-actions">
          <button
            className="btn btn-approve"
            disabled={working}
            onClick={() => handleDecision('approve')}
          >
            {working ? <><span className="spinner" aria-hidden="true" /> Processing…</> : '✓ Yes, Charge'}
          </button>
          <button
            className="btn btn-reject"
            disabled={working}
            onClick={() => handleDecision('reject')}
          >
            ✕ No, Reject
          </button>
        </div>

        <SecureBadge />
      </div>

      <div className="footer">
        &copy; {new Date().getFullYear()} Aniya Network Solutions. All rights reserved.
      </div>
    </div>
  )
}
