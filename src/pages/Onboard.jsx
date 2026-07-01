import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
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

function CheckoutForm({ businessRecordId, customerId, clientSecret }) {
  const stripe   = useStripe()
  const elements = useElements()
  const navigate = useNavigate()

  const [cardholderName, setCardholderName] = useState('')
  const [nameError,      setNameError]      = useState('')
  const [cardError,      setCardError]      = useState('')
  const [submitting,     setSubmitting]     = useState(false)

  function handleCardChange(e) {
    setCardError(e.error ? e.error.message : '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setNameError('')
    setCardError('')

    if (!cardholderName.trim()) {
      setNameError('Please enter the name on your card.')
      return
    }

    if (!stripe || !elements) return
    setSubmitting(true)

    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card:             elements.getElement(CardElement),
        billing_details: { name: cardholderName.trim() },
      },
    })

    if (error) {
      if (
        error.code === 'setup_intent_unexpected_state' &&
        error.setup_intent?.status === 'succeeded'
      ) {
        const pmId = error.setup_intent.payment_method
        if (pmId) { await finishSave(pmId); return }
      }
      setCardError(error.message)
      setSubmitting(false)
      return
    }

    await finishSave(setupIntent.payment_method)
  }

  async function finishSave(paymentMethodId) {
    try {
      const res = await fetch('/api/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_record_id: businessRecordId,
          payment_method_id:  paymentMethodId,
          customer_id:        customerId,
          cardholder_name:    cardholderName.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Card saved with Stripe but profile update failed. Please contact support.')
      }

      navigate('/success')
    } catch (err) {
      setCardError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="cardholder-name">Name on card</label>
        <input
          id="cardholder-name"
          type="text"
          placeholder="Jane Smith"
          autoComplete="cc-name"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          disabled={submitting}
        />
        {nameError && <div className="error-msg" role="alert">{nameError}</div>}
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
            onChange={handleCardChange}
          />
        </div>
        {cardError && <div className="error-msg" role="alert">{cardError}</div>}
      </div>

      <p className="mandate">
        By saving your card and submitting this form, you authorise{' '}
        <strong>Zeal Media Solutions</strong> to charge your card for services
        rendered at amounts agreed upon during your appointment, without requiring
        your presence for each transaction. You may revoke this authorisation at
        any time by contacting us directly.
      </p>

      <button type="submit" className="btn" disabled={submitting || !stripe}>
        {submitting ? (
          <><span className="spinner" aria-hidden="true" />Processing…</>
        ) : (
          'Save Card Securely'
        )}
      </button>

      <SecureBadge />
    </form>
  )
}

export default function Onboard() {
  const [searchParams] = useSearchParams()
  const businessId = searchParams.get('location_id')

  const [status,          setStatus]          = useState('loading')
  const [pageError,       setPageError]       = useState('')
  const [stripePromise,   setStripePromise]   = useState(null)
  const [clientSecret,    setClientSecret]    = useState(null)
  const [customerId,      setCustomerId]      = useState(null)
  const [businessRecordId, setBusinessRecordId] = useState(null)

  useEffect(() => {
    if (!businessId) {
      setPageError('No location ID provided. Please use the link sent by your service provider.')
      setStatus('error')
      return
    }

    async function init() {
      const res = await fetch(`/api/create-setup-intent?location_id=${encodeURIComponent(businessId)}`)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not initialise payment form. Please try again.')
      }

      const { client_secret, customer_id, business_record_id } = await res.json()

      setStripePromise(loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY))
      setClientSecret(client_secret)
      setCustomerId(customer_id)
      setBusinessRecordId(business_record_id)
      setStatus('ready')
    }

    init().catch((err) => {
      setPageError(err.message)
      setStatus('error')
    })
  }, [businessId])

  if (status === 'loading') {
    return (
      <div className="loading-overlay" aria-label="Loading payment form">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="page-wrapper">
        <div className="card">
          <Logo />
          <div className="status-msg error" role="alert">{pageError}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="card">
        <Logo />
        <h1>Save Your Card</h1>
        <p className="subtitle">
          Enter your card details below. Your card will only be charged{' '}
          <strong>after</strong> your appointment is completed — subject to admin approval.
        </p>

        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
        >
          <CheckoutForm
            businessRecordId={businessRecordId}
            customerId={customerId}
            clientSecret={clientSecret}
          />
        </Elements>
      </div>

      <div className="footer">
        &copy; {new Date().getFullYear()} Zeal Media Solutions. All rights reserved.
      </div>
    </div>
  )
}
