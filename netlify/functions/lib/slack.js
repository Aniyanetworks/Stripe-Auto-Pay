export async function postSlack(text) {
  const botToken = process.env.SLACK_BOT_TOKEN
  const userId   = process.env.ADMIN_SLACK_USER_ID
  if (!botToken || !userId) return
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ channel: userId, text }),
    })
  } catch (_) {}
}
