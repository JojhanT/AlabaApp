import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toDateString, inicioSemana, sumarSemanas } from '../lib/dias'
import { obtenerProgramacionSemana, obtenerRoles, obtenerVotosSemana } from '../lib/api'
import {
  tienePermiso,
  pedirPermisoNotificaciones,
  notificarProgramacionGenerada,
  leerUltimaProgNotificada,
  guardarUltimaProgNotificada,
  debeRecordarViernes,
  yaSeRecordoHoy,
  marcarRecordatorioHoy,
  notificarRecordatorioViernes,
} from '../lib/notificaciones'

function hashAsignaciones(asigs: { dia_semana: string; rol_id: number }[]): string {
  return asigs
    .map((a) => `${a.dia_semana}:${a.rol_id}`)
    .sort()
    .join('|')
}

// ── Notificación cuando se genera programación para el usuario actual ──
export function useNotificacionProgramacion() {
  const { perfil } = useAuth()
  const timeoutRef = useRef<number | null>(null)
  const pendientesRef = useRef<{ dia_semana: string; rol_id: number; fecha: string }[]>([])

  useEffect(() => {
    if (!perfil) return
    let canal: ReturnType<typeof supabase.channel> | null = null
    let activo = true

    async function verificarProgActual(semanaStr: string) {
      try {
        const prog = await obtenerProgramacionSemana(semanaStr)
        const mias = prog.filter((r) => r.profile_id === perfil!.id).map((r) => ({ dia_semana: r.dia_semana, rol_id: r.rol_id, fecha: r.fecha }))
        const hash = hashAsignaciones(mias)
        const ultimo = leerUltimaProgNotificada(semanaStr)
        if (ultimo !== null && ultimo === hash) return
        if (prog.length === 0) return
        // Solo notificar si hay asignación para el usuario o si es la primera vez que se genera esa semana
        // Para no spamear en semanas viejas, solo notificar si la semana es actual o siguiente
        const actual = toDateString(inicioSemana())
        const siguiente = toDateString(sumarSemanas(inicioSemana(), 1))
        if (semanaStr !== actual && semanaStr !== siguiente) return
        // Evitar notificar al generar vacía la primera vez sin asignaciones previas
        const roles = await obtenerRoles().catch(() => [])
        await notificarProgramacionGenerada(mias, roles)
        guardarUltimaProgNotificada(semanaStr, hash)
      } catch {
        /* ignorar */
      }
    }

    // Verificación inicial por polling (por si Realtime no está habilitado)
    const semanaActual = toDateString(inicioSemana())
    const semanaSiguiente = toDateString(sumarSemanas(inicioSemana(), 1))
    void verificarProgActual(semanaActual)
    void verificarProgActual(semanaSiguiente)

    // Suscripción Realtime para inserts en programaciones
    try {
      canal = supabase
        .channel(`prog-notif-${perfil.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'programaciones' },
          (payload) => {
            const row = payload.new as { profile_id: string; semana_inicio: string; dia_semana: string; rol_id: number; fecha: string }
            if (row.profile_id !== perfil.id) return
            pendientesRef.current.push({ dia_semana: row.dia_semana, rol_id: row.rol_id, fecha: row.fecha })
            if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
            timeoutRef.current = window.setTimeout(async () => {
              if (!activo) return
              const semanaStr = row.semana_inicio
              const mias = pendientesRef.current
              pendientesRef.current = []
              // Verificar hash para deduplicar
              const prog = await obtenerProgramacionSemana(semanaStr).catch(() => [])
              const completas = prog.filter((r) => r.profile_id === perfil.id).map((r) => ({ dia_semana: r.dia_semana, rol_id: r.rol_id, fecha: r.fecha }))
              const hash = hashAsignaciones(completas)
              const ultimo = leerUltimaProgNotificada(semanaStr)
              if (ultimo === hash) return
              const roles = await obtenerRoles().catch(() => [])
              // Usar completas si existen, si no fallback a pendientes
              const paraNotificar = completas.length > 0 ? completas : mias
              await notificarProgramacionGenerada(paraNotificar, roles)
              guardarUltimaProgNotificada(semanaStr, hash)
            }, 2000)
          },
        )
        .subscribe()
    } catch {
      /* Realtime no disponible, seguir solo con polling */
    }

    // Polling cada 2 min por si el canal no dispara
    const intervalo = window.setInterval(() => {
      void verificarProgActual(semanaActual)
      void verificarProgActual(semanaSiguiente)
    }, 120000)

    return () => {
      activo = false
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      window.clearInterval(intervalo)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [perfil])
}

// ── Recordatorio viernes 23:59 si no votó ──────────────────
export function useRecordatorioViernes() {
  const { perfil } = useAuth()

  useEffect(() => {
    if (!perfil) return
    let intervalo: number | null = null

    async function chequear() {
      try {
        if (!debeRecordarViernes()) return
        if (yaSeRecordoHoy()) return
        // Pedir permiso si aún no está concedido (no spamear si denegado)
        if (!tienePermiso()) {
          // No pedir automáticamente en background; solo si el usuario ya dio permiso antes
          return
        }
        const siguienteSemana = toDateString(sumarSemanas(inicioSemana(), 1))
        const { propios } = await obtenerVotosSemana(siguienteSemana).catch(() => ({ propios: new Set<string>() }) as never)
        if (propios.size === 0) {
          await notificarRecordatorioViernes()
          marcarRecordatorioHoy()
        } else {
          // Ya votó, marcar para no volver a preguntar hoy
          marcarRecordatorioHoy()
        }
      } catch {
        /* ignorar */
      }
    }

    // Chequear al montar y cada 30 min
    void chequear()
    intervalo = window.setInterval(() => void chequear(), 30 * 60 * 1000)

    // También chequear cuando la pestaña vuelve a estar visible
    const onVisible = () => {
      if (document.visibilityState === 'visible') void chequear()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (intervalo) window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [perfil])
}

// ── Notificaciones personalizadas del admin ──────────────────
export function useNotificacionPersonalizada() {
  const { perfil } = useAuth()
  useEffect(() => {
    if (!perfil) return
    let canal: ReturnType<typeof supabase.channel> | null = null
    try {
      canal = supabase
        .channel(`notif-custom-${perfil.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, async (payload) => {
          const row = payload.new as { titulo: string; cuerpo: string; destinatarios: string[] | null }
          const dest = row.destinatarios
          if (dest !== null && !dest.includes(perfil.id)) return
          const { mostrarNotificacion } = await import('../lib/notificaciones')
          await mostrarNotificacion(row.titulo, row.cuerpo, `custom-${payload.commit_timestamp ?? Date.now()}`)
        })
        .subscribe()
    } catch {
      /* ignorar si Realtime no disponible */
    }
    return () => {
      if (canal) void supabase.removeChannel(canal)
    }
  }, [perfil])
}

// ── Hook combinado para pedir permiso una vez ──────────────
export function usePedirPermisoNotificaciones() {
  useEffect(() => {
    // Pedir permiso de forma diferida (no intrusiva) solo si es default
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const t = window.setTimeout(() => {
      void pedirPermisoNotificaciones()
    }, 4000)
    return () => window.clearTimeout(t)
  }, [])
}
