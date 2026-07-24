import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Logo from '../components/Logo'
import SecureBadge from '../components/SecureBadge'

const STRIPE_APPEARANCE = {
  theme: 'flat',
  variables: {
    colorPrimary:    '#6C3FC5',
    colorBackground: '#fafbfd',
    colorText:       '#1a1a2e',
    colorDanger:     '#ef4444',
    fontFamily:      'Inter, -apple-system, sans-serif',
    spacingUnit:     '4px',
    borderRadius:    '6px',
  },
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function PayForm({ customerId, amountCents }) {
  const stripe   = useStripe()
  const elements = useElements()

  const [cardError,  setCardError]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)

  const fmtAmount = `$${(amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`

  async function handleSubmit(e) {
    e.preventDefault()
    setCardError('')

    if (!stripe || !elements) return
    setSubmitting(true)

    const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
      type: 'card',
      card: elements.getElement(CardElement),
    })

    if (pmError) {
      setCardError(pmError.message)
      setSubmitting(false)
      return
    }

    try {
      const res  = await fetch('/api/charge-now', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customer_id:       customerId,
          amount_cents:      amountCents,
          payment_method_id: paymentMethod.id,
        }),
      })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error || 'Payment failed. Please try again.')

      // 3DS required — let Stripe handle the authentication flow
      if (json.requires_action) {
        const { error: actionError } = await stripe.confirmCardPayment(json.client_secret)
        if (actionError) throw new Error(actionError.message)
      }

      setDone(true)
    } catch (err) {
      setCardError(err.message)
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <div className="success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
        <h2 style={{ marginBottom: '0.5rem' }}>Payment Successful!</h2>
        <p className="subtitle">
          {fmtAmount} has been charged successfully. Thank you!
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="pay-amount-banner">
        <span className="pay-amount-label">Amount due</span>
        <span className="pay-amount-value">{fmtAmount}</span>
      </div>

      <div className="form-group">
        <label>Card details</label>
        <div className="card-element-wrapper">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize:        '16px',
                  color:           '#ffffff',
                  fontFamily:      'Inter, -apple-system, sans-serif',
                  '::placeholder': { color: '#55557a' },
                },
                invalid: { color: '#fca5a5', iconColor: '#fca5a5' },
              },
              hidePostalCode: false,
            }}
            onChange={e => setCardError(e.error ? e.error.message : '')}
          />
        </div>
        {cardError && <div className="error-msg" role="alert">{cardError}</div>}
      </div>

      <p className="mandate">
        By submitting this form, you authorise <strong>Zeal Media Solutions</strong> to charge{' '}
        {fmtAmount} to your card.
      </p>

      <button type="submit" className="btn" disabled={submitting || !stripe}>
        {submitting ? (
          <><span className="spinner" aria-hidden="true" />Processing…</>
        ) : (
          `Pay ${fmtAmount}`
        )}
      </button>

      <SecureBadge />
    </form>
  )
}

export default function Pay() {
  const [searchParams] = useSearchParams()

  const customerId  = searchParams.get('customer_id')
  const amountParam = searchParams.get('amount') // dollars (e.g. 500 → $500)
  const amountCents = amountParam ? Math.round(parseFloat(amountParam) * 100) : null

  if (!customerId || !amountCents || amountCents < 50) {
    return (
      <div className="page-wrapper">
        <div className="card">
          <Logo />
          <div className="status-msg error" role="alert">
            Invalid payment link. Please contact your service provider.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="card">
        <Logo />
        <h1>Complete Payment</h1>
        <p className="subtitle">
          Enter your card details to complete your payment securely.
        </p>

        <Elements stripe={stripePromise} options={{ appearance: STRIPE_APPEARANCE }}>
          <PayForm customerId={customerId} amountCents={amountCents} />
        </Elements>
      </div>

      <div className="footer">&copy; {new Date().getFullYear()} Zeal Media Solutions. All rights reserved.</div>
    </div>
  )
}
