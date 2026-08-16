import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cerrarSesion } from '../lib/auth'

export default function Layout() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAbierto(false)
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [])

  async function salir() {
    setSaliendo(true)
    try {
      await cerrarSesion()
      navigate('/login')
    } finally {
      setSaliendo(false)
    }
  }

  function cerrarMenu() {
    setMenuAbierto(false)
  }

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-inner">
          <span className="marca">AlabaApp</span>
          <button
            type="button"
            className="hamburguesa"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            <span className="hamburguesa-linea" />
            <span className="hamburguesa-linea" />
            <span className="hamburguesa-linea" />
          </button>
          <nav className={`nav ${menuAbierto ? 'abierto' : ''}`}>
            <NavLink to="/" end onClick={cerrarMenu}>
              Mi disponibilidad
            </NavLink>
            <NavLink to="/programacion" onClick={cerrarMenu}>
              Programación
            </NavLink>
            {esAdmin && (
              <NavLink to="/admin" onClick={cerrarMenu}>
                Usuarios
              </NavLink>
            )}
            <div className="navbar-usuario">
              <span className="chip">{perfil?.nombre ?? '…'}</span>
              {esAdmin && <span className="chip chip-admin">Admin</span>}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void salir()}
                disabled={saliendo}
              >
                {saliendo ? 'Saliendo…' : 'Salir'}
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
      <footer className="footer">
        <p className="login-creditos">AlabaApp © 2026 · Desarrollado por <b>Jojhan Torres</b></p>
      </footer>
    </div>
  )
}
