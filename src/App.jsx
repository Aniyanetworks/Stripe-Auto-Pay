import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import Onboard from './pages/Onboard'
import Success from './pages/Success'
import Approve from './pages/Approve'

// Root route: redirect to /onboard preserving the client_id param if present
function Root() {
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('client_id')
  const to = clientId ? `/onboard?client_id=${encodeURIComponent(clientId)}` : '/onboard'
  return <Navigate to={to} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Root />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/success" element={<Success />} />
        <Route path="/approve" element={<Approve />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
