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
  const [mostrarModal, setMostrarModal] = useState(false)
  const [pasoNo, setPasoNo] = useState(false)
  const online = useOnline()

  // Modal anti-no: obliga en pocas palabras a decir que sí
  useEffect(() => {
    if (!perfil) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    // No mostrar si ya se mostró hace poco (anti-spam pero insiste cada 24h)
    try {
      const ultimo = localStorage.getItem('notif_modal_dismissed_at')
      if (ultimo && Date.now() - Number(ultimo) < 24 * 60 * 60 * 1000) return
    } catch {
      /* ignorar */
    }
    const t = window.setTimeout(() => setMostrarModal(true), 1200)
    return () => window.clearTimeout(t)
  }, [perfil, permiso])

  async function activarNotis() {
    const ok = await pedirPermisoNotificaciones()
    setPermiso(Notification.permission)
    if (ok) {
      setMostrarModal(false)
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready
            await (reg as unknown as { showNotification: (t: string, o: unknown) => Promise<void> }).showNotification('Notificaciones activadas ✓', {
              body: 'Recibirás tu programación y el recordatorio del viernes.',
              icon: '/favicon-192.png',
            } as unknown as NotificationOptions)
          } else {
            new Notification('Notificaciones activadas ✓', { body: 'Recibirás tu programación y el recordatorio del viernes.' })
          }
        }
      } catch {
        /* ignorar */
      }
    } else {
      // Si el navegador bloqueó o dijo no, mantener modal con instrucciones
      setPermiso(Notification.permission)
    }
  }

  function dismissModalTemporal() {
    setPasoNo(false)
    setMostrarModal(false)
    try {
      localStorage.setItem('notif_modal_dismissed_at', String(Date.now()))
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
      {mostrarModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Activar notificaciones" onClick={dismissModalTemporal}>
          <div className="modal-notif" onClick={(e) => e.stopPropagation()}>
            {!pasoNo ? (
              <>
                <div className="modal-notif-icon">🔔</div>
                <h3 className="modal-notif-titulo">¡Actívalas en 2 toques!</h3>
                <p className="modal-notif-text">
                  <strong>Es obligatorio para no perderte nada.</strong> Recibirás tu programación y el recordatorio del viernes si no votaste.
                </p>
                <button type="button" className="btn btn-primary btn-block modal-notif-cta" onClick={() => void activarNotis()}>
                  Sí, activar notificaciones
                </button>
                <button type="button" className="modal-notif-no" onClick={() => setPasoNo(true)}>
                  No, prefiero perderme mi programación
                </button>
                <p className="modal-notif-legal">Solo 2 toques. Puedes desactivar cuando quieras.</p>
              </>
            ) : (
              <>
                <div className="modal-notif-icon">⚠️</div>
                <h3 className="modal-notif-titulo">¿Seguro?</h3>
                <p className="modal-notif-text">
                  Sin notificaciones <strong>no te avisaremos</strong> si sales programado o si olvidas votar el viernes.
                </p>
                <button type="button" className="btn btn-primary btn-block modal-notif-cta" onClick={() => void activarNotis()}>
                  Sí, activar ahora
                </button>
                <button type="button" className="modal-notif-no" onClick={dismissModalTemporal}>
                  Sí, me lo pierdo
                </button>
              </>
            )}
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
              <NavLink to="/admin" end onClick={cerrarMenu}>
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
