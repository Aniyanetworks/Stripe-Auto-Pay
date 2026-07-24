import Stripe from 'stripe'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { name, business_name, email, phone, address } = JSON.parse(event.body || '{}')

    if (!name?.trim() || !email?.trim())
      return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required' }) }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    const customer = await stripe.customers.create({
      name:    name.trim(),
      email:   email.trim().toLowerCase(),
      phone:   phone?.trim() || undefined,
      address: address?.trim() ? { line1: address.trim(), country: 'US' } : undefined,
      metadata: {
        business_name: business_name?.trim() || '',
        source:        'onboard-form',
      },
    })

    console.log(`[create-customer] created ${customer.id} for ${email}`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, customer_id: customer.id }),
    }
  } catch (err) {
    console.error('[create-customer]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
