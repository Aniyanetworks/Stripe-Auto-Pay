import { chargeRequests } from './createChargeRequest.js'

async function postSlack(text) {
  const botToken = process.env.SLACK_BOT_TOKEN
  const userId   = process.env.ADMIN_SLACK_USER_ID
  if (!botToken || !userId) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: userId, text }),
  })
}

export async function rejectCharge(req, res) {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token required' })

  const entry = chargeRequests.get(token)
  if (!entry)                        return res.status(404).json({ error: 'Charge request not found or expired' })
  if (entry.expiresAt < Date.now()) {
    chargeRequests.delete(token)
    return res.status(410).json({ error: 'This charge request has expired' })
  }
  if (entry.status !== 'pending')    return res.status(409).json({ error: `Charge already ${entry.status}` })

  entry.status = 'rejected'

  const dollars = (entry.amount / 100).toFixed(2)

  await postSlack(
    `❌ *Charge Rejected*\n` +
    `*Customer:* ${entry.customer_name}\n` +
    `*Amount:* $${dollars}\n` +
    `*Description:* ${entry.description}`
  )

  res.json({ success: true })
}
