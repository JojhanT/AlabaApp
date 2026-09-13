import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cerrarSesion } from '../lib/auth'
import { pedirPermisoNotificaciones } from '../lib/notificaciones'

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function Layout() {
  const { perfil, esAdmin } = useAuth()
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [permiso, setPermiso] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const [bannerNotifDismiss, setBannerNotifDismiss] = useState(() => {
    try {
      return localStorage.getItem('notif_banner_dismissed') === '1'
    } catch {
      return false
    }
  })
  const online = useOnline()

  async function activarNotis() {
    const ok = await pedirPermisoNotificaciones()
    setPermiso(Notification.permission)
    if (ok) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          // Intentar mostrar una de prueba vía SW o directa
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready
            await (reg as unknown as { showNotification: (t: string, o: unknown) => Promise<void> }).showNotification('Notificaciones activadas', {
              body: 'Recibirás avisos de programación y recordatorios de votación.',
              icon: '/favicon-192.png',
            } as unknown as NotificationOptions)
          } else {
            new Notification('Notificaciones activadas', { body: 'Recibirás avisos de programación y recordatorios.' })
          }
        }
      } catch {
        /* ignorar */
      }
    }
  }

  function dismissBanner() {
    setBannerNotifDismiss(true)
    try {
      localStorage.setItem('notif_banner_dismissed', '1')
    } catch {
      /* ignorar */
    }
  }

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
      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          <span className="offline-dot" />
          Sin internet — mostrando <strong>programación local</strong> (puede estar desactualizada). Tus cambios se guardarán al reconectar.
        </div>
      )}
      {typeof Notification !== 'undefined' && permiso === 'default' && !bannerNotifDismiss && (
        <div className="notif-banner" role="status" aria-live="polite">
          <span className="notif-banner-text">🔔 Activa las notificaciones para recibir tu programación y el recordatorio del viernes si aún no votaste</span>
          <div className="notif-banner-acciones">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void activarNotis()}>
              Activar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissBanner}>
              Ahora no
            </button>
          </div>
        </div>
      )}
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
              <NavLink to="/votos" onClick={cerrarMenu}>
                Votos
              </NavLink>
            )}
            {esAdmin && (
              <NavLink to="/admin/notificaciones" onClick={cerrarMenu}>
                Notificar
              </NavLink>
            )}
            {esAdmin && (
              <NavLink to="/admin" onClick={cerrarMenu}>
                Usuarios
              </NavLink>
            )}
            <div className="navbar-usuario">
              <span className="chip">{perfil?.nombre ?? '…'}</span>
              {esAdmin && <span className="chip chip-admin">Admin</span>}
              {typeof Notification !== 'undefined' && permiso !== 'granted' && (
                <button type="button" className="notif-bell" onClick={() => void activarNotis()} title="Activar notificaciones" aria-label="Activar notificaciones">
                  🔔
                </button>
              )}
              {typeof Notification !== 'undefined' && permiso === 'granted' && (
                <span className="notif-bell notif-bell-activa" title="Notificaciones activadas" aria-label="Notificaciones activadas">
                  🔔
                </span>
              )}
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
