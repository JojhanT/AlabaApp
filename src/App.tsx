import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Disponibilidad from './pages/Disponibilidad'
import Programacion from './pages/Programacion'
import AdminUsuarios from './pages/AdminUsuarios'
import Votos from './pages/Votos'
import type { ReactNode } from 'react'

function RutaProtegida({ children }: { children: ReactNode }) {
  const { cargando, sesion } = useAuth()
  if (cargando) return <div className="centrado">Cargando…</div>
  if (!sesion) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RutaAdmin({ children }: { children: ReactNode }) {
  const { cargando, esAdmin } = useAuth()
  if (cargando) return <div className="centrado">Cargando…</div>
  if (!esAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function RutaLogin() {
  const { cargando, sesion } = useAuth()
  if (cargando) return <div className="centrado">Cargando…</div>
  if (sesion) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<RutaLogin />} />
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <RutaProtegida>
                  <Disponibilidad />
                </RutaProtegida>
              }
            />
            <Route
              path="/programacion"
              element={
                <RutaProtegida>
                  <Programacion />
                </RutaProtegida>
              }
            />
            <Route
              path="/admin"
              element={
                <RutaAdmin>
                  <AdminUsuarios />
                </RutaAdmin>
              }
            />
            <Route
              path="/votos"
              element={
                <RutaAdmin>
                  <Votos />
                </RutaAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
