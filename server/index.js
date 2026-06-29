import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createSetupIntent }    from './routes/createSetupIntent.js'
import { savePaymentMethod }    from './routes/savePaymentMethod.js'
import { createBusiness }       from './routes/createBusiness.js'
import { getBusiness }          from './routes/getBusiness.js'
import { createChargeRequest }  from './routes/createChargeRequest.js'
import { getChargeRequest }     from './routes/getChargeRequest.js'
import { approveCharge }        from './routes/approveCharge.js'
import { rejectCharge }         from './routes/rejectCharge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API routes
app.get('/api/create-setup-intent',      createSetupIntent)
app.post('/api/save-payment-method',     savePaymentMethod)
app.post('/api/create-business',         createBusiness)
app.post('/api/create-charge-request',   createChargeRequest)
app.get('/api/charge-request/:token',    getChargeRequest)
app.post('/api/approve-charge',          approveCharge)
app.post('/api/reject-charge',           rejectCharge)

// Serve built React app in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
