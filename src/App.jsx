import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import Onboard        from './pages/Onboard'
import Success        from './pages/Success'
import Approve        from './pages/Approve'
import Login          from './pages/Login'
import Dashboard      from './pages/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'

function Root() {
  const [searchParams] = useSearchParams()
  const locationId = searchParams.get('location_id')
  const to = locationId ? `/onboard?location_id=${encodeURIComponent(locationId)}` : '/onboard'
  return <Navigate to={to} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Root />} />
        <Route path="/onboard"   element={<Onboard />} />
        <Route path="/success"   element={<Success />} />
        <Route path="/approve"   element={<Approve />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
