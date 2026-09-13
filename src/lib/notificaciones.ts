const LS_ULTIMA_PROG = 'notif_ultima_prog_v2'
const LS_ULTIMO_VIERNES = 'notif_ultimo_viernes_v2'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

export function tienePermiso(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

async function mostrarViaSW(titulo: string, body: string, tag: string, url: string) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      // @ts-ignore
      if (reg?.showNotification) {
        await reg.showNotification(titulo, {
          body,
          icon: '/favicon-192.png',
          badge: '/favicon-192.png',
          tag,
          renotify: false,
          data: { url },
        } as unknown as NotificationOptions)
        return true
      }
    }
  } catch {
    /* fallback */
  }
  return false
}

function navegarA(url: string) {
  try {
    if (window.location.pathname !== url) {
      window.location.hash = ''
      window.location.href = url
    } else {
      window.focus()
    }
  } catch {
    window.location.href = url
  }
}

export async function mostrarNotificacion(titulo: string, body: string, tag = titulo, url: string = '/') {
  if (!tienePermiso()) {
    const ok = await pedirPermisoNotificaciones()
    if (!ok) return
  }
  // Preferir Notification directa para poder manejar onclick -> navegación
  try {
    const n = new Notification(titulo, { body, icon: '/favicon-192.png', tag } as unknown as NotificationOptions)
    n.onclick = () => {
      try {
        window.focus()
        navegarA(url)
        n.close()
      } catch {
        window.location.href = url
      }
    }
    return
  } catch {
    /* fallback a SW si estamos en background o falla */
  }
  await mostrarViaSW(titulo, body, tag, url)
}

// ── Programación generada ──────────────────────────────────
// Guarda hash de última programación notificada para no repetir
export function guardarUltimaProgNotificada(semana: string, hash: string) {
  try {
    const raw = localStorage.getItem(LS_ULTIMA_PROG)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    map[semana] = hash
    localStorage.setItem(LS_ULTIMA_PROG, JSON.stringify(map))
  } catch {
    /* ignorar */
  }
}

export function leerUltimaProgNotificada(semana: string): string | null {
  try {
    const raw = localStorage.getItem(LS_ULTIMA_PROG)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    return map[semana] ?? null
  } catch {
    return null
  }
}

export async function notificarProgramacionGenerada(
  asignaciones: { dia_semana: string; rol_id: number; fecha: string }[],
  roles: { id: number; nombre: string }[],
) {
  if (asignaciones.length === 0) {
    await mostrarNotificacion('Programación generada', 'No saliste programado esta semana. ¡Revisa la app!', 'prog-generada-vacia', '/programacion')
    return
  }
  const porDia: Record<string, string[]> = {}
  for (const a of asignaciones) {
    const nomRol = roles.find((r) => r.id === a.rol_id)?.nombre ?? `Rol ${a.rol_id}`
    porDia[a.dia_semana] ??= []
    porDia[a.dia_semana].push(nomRol)
  }
  const partes = Object.entries(porDia).map(([dia, roles]) => `${dia} (${roles.join(', ')})`)
  const body = `Saliste en: ${partes.join(' · ')}`
  await mostrarNotificacion('¡Nueva programación generada!', body, 'prog-generada', '/programacion')
}

// ── Recordatorio viernes ───────────────────────────────────
export function debeRecordarViernes(): boolean {
  const ahora = new Date()
  const dia = ahora.getDay() // 0 dom, 5 vie
  const hora = ahora.getHours()
  // Viernes 20:00 en adelante o sábado 00:00 (12 de la noche del viernes)
  const esViernesNoche = dia === 5 && hora >= 20
  const esSabadoMadrugada = dia === 6 && hora === 0
  return esViernesNoche || esSabadoMadrugada
}

export function yaSeRecordoHoy(): boolean {
  try {
    const ultimo = localStorage.getItem(LS_ULTIMO_VIERNES)
    return ultimo === hoyISO()
  } catch {
    return false
  }
}

export function marcarRecordatorioHoy() {
  try {
    localStorage.setItem(LS_ULTIMO_VIERNES, hoyISO())
  } catch {
    /* ignorar */
  }
}

export async function notificarRecordatorioViernes() {
  await mostrarNotificacion(
    '¿Ya votaste tu disponibilidad?',
    'Aún no has votado para la siguiente semana. Entra a AlabaApp y marca tus días antes del domingo.',
    'recordatorio-viernes',
    '/',
  )
}
