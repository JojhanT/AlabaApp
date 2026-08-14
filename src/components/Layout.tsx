import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cerrarSesion } from '../lib/auth'

export default function Layout() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-inner">
          <span className="marca">AlabaApp</span>
          <nav className="nav">
            <NavLink to="/" end>
              Mi disponibilidad
            </NavLink>
            <NavLink to="/programacion">Programación</NavLink>
            {esAdmin && <NavLink to="/admin">Usuarios</NavLink>}
          </nav>
          <div className="navbar-usuario">
            <span className="chip">{perfil?.nombre ?? '…'}</span>
            {esAdmin && <span className="chip chip-admin">Admin</span>}
            <button type="button" className="btn btn-ghost" onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  )
}
