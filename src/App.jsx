import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Onboard        from './pages/Onboard'
import Pay            from './pages/Pay'
import Success        from './pages/Success'
import Approve        from './pages/Approve'
import Login          from './pages/Login'
import Dashboard      from './pages/Dashboard'
import Reports        from './pages/Reports'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Navigate to="/onboard" replace />} />
        <Route path="/onboard"   element={<Onboard />} />
        <Route path="/pay"       element={<Pay />} />
        <Route path="/success"   element={<Success />} />
        <Route path="/approve"   element={<Approve />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/reports"   element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
