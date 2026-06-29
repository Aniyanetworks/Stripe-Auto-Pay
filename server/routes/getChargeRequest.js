import { chargeRequests } from './createChargeRequest.js'

export async function getChargeRequest(req, res) {
  const { token } = req.params
  const entry     = chargeRequests.get(token)

  if (!entry)                        return res.status(404).json({ error: 'Charge request not found or expired' })
  if (entry.expiresAt < Date.now()) {
    chargeRequests.delete(token)
    return res.status(410).json({ error: 'This charge request has expired' })
  }

  res.json({
    customer_name: entry.customer_name,
    amount:        entry.amount,
    description:   entry.description,
    status:        entry.status,
  })
}
