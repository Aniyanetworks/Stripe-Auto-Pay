import Logo from '../components/Logo'
import SecureBadge from '../components/SecureBadge'

export default function Success() {
  return (
    <div className="page-wrapper">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Logo />
        </div>

        {/* Success icon */}
        <div className="success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>

        <h1>Card Saved!</h1>
        <p className="subtitle">
          Your payment method has been securely saved.<br />
          You're all set for your upcoming appointment — no payment needed at the time of service.
        </p>

        <hr className="divider" />

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Your card information is stored securely by Stripe and never touches our servers.
          You will be charged <strong>after</strong> your appointment is completed.
        </p>

        <SecureBadge text="Secured by Stripe · PCI DSS Level 1 Compliant" />
      </div>

      <div className="footer">
        Questions?{' '}
        <a href="mailto:info@aniyanetworksolutions.com">
          info@aniyanetworksolutions.com
        </a>
      </div>
    </div>
  )
}
