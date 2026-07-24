import { useState } from 'react'
import Logo from '../components/Logo'

export default function Onboard() {
  const [form, setForm] = useState({
    name:          '',
    business_name: '',
    email:         '',
    phone:         '',
    address:       '',
  })
  const [status, setStatus] = useState('idle') // idle | submitting | done
  const [error,  setError]  = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.')
      return
    }
    setStatus('submitting')
    try {
      const res  = await fetch('/api/create-customer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit. Please try again.')
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="page-wrapper">
        <div className="card" style={{ textAlign: 'center' }}>
          <Logo />
          <div className="success-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
          <h1>You're all set!</h1>
          <p className="subtitle">
            Your information has been saved. Your provider will send you a
            secure payment link shortly.
          </p>
        </div>
        <div className="footer">&copy; {new Date().getFullYear()} Zeal Media Solutions. All rights reserved.</div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="card card-wide">
        <Logo />
        <h1>Get Started</h1>
        <p className="subtitle">
          Fill in your details below. No payment is required at this step.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Jane Smith"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                disabled={status === 'submitting'}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="business_name">Business Name</label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                placeholder="Acme Co."
                autoComplete="organization"
                value={form.business_name}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                disabled={status === 'submitting'}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                name="phone"
                type="text"
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              name="address"
              type="text"
              placeholder="123 Main St, City, State"
              autoComplete="street-address"
              value={form.address}
              onChange={handleChange}
              disabled={status === 'submitting'}
            />
          </div>

          {error && <div className="error-msg" role="alert">{error}</div>}

          <button type="submit" className="btn" disabled={status === 'submitting'}>
            {status === 'submitting' ? (
              <><span className="spinner" aria-hidden="true" />Saving…</>
            ) : (
              'Submit Information'
            )}
          </button>
        </form>
      </div>

      <div className="footer">&copy; {new Date().getFullYear()} Zeal Media Solutions. All rights reserved.</div>
    </div>
  )
}
