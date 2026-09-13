import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { DIAS_SEMANA } from '../lib/planificador'
import { inicioSemana, toDateString, fechaDeDia, formatFechaLarga } from '../lib/dias'
import {
  obtenerRoles,
  obtenerRolesDePerfil,
  obtenerVotosSemana,
  votarDia,
  obtenerDiasConfig,
  obtenerProgramacionSemana,
  type DiaConfig,
} from '../lib/api'
import { leerCacheDisponibilidad, esCacheDispFresca, guardarCacheDisponibilidad, leerCacheGlobal } from '../lib/cache'
import type { Rol } from '../types'

interface DiaVista {
  nombre: string
  fecha: string // YYYY-MM-DD
}

export default function Disponibilidad() {
  const { perfil } = useAuth()
  const { semana, cambiarSemana } = useSemana({ claveCache: 'prog_semana_disp', offsetDias: 7 })
  const [votos, setVotos] = useState<Set<string>>(new Set())
  const [roles, setRoles] = useState<Rol[]>([])
  const [misRoles, setMisRoles] = useState<number[]>([])
  const [dias, setDias] = useState<DiaVista[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function cargar(opts: { force?: boolean } = {}) {
    if (!perfil) {
      setCargando(false)
      return
    }
    const semanaStr = toDateString(semana)
    const userId = perfil.id
    const cached = leerCacheDisponibilidad(userId, semanaStr)
    const fresca = esCacheDispFresca(userId, semanaStr)

    if (cached && !opts.force) {
      setVotos(new Set(cached.votos))
      setDias(cached.dias)
      setMisRoles(cached.misRoles)
      const g = leerCacheGlobal()
      if (g) setRoles(g.roles)
      setCargando(false)
      if (!navigator.onLine) {
        if (!fresca) setError('Sin conexión. Mostrando tu disponibilidad en caché (puede estar desactualizada).')
        return
      }
      // Aunque esté fresca, revalidar en background para que cambios desde otro dispositivo se vean tras refrescar
    } else {
      setCargando(true)
      if (!navigator.onLine) {
        if (cached) {
          setVotos(new Set(cached.votos))
          setDias(cached.dias)
          setMisRoles(cached.misRoles)
          setError('Sin conexión. Mostrando tu disponibilidad en caché.')
        } else {
          setError('Sin conexión y sin datos en caché para esta semana.')
        }
        setCargando(false)
        return
      }
    }

    setError('')
    try {
      // Reusar caché global para roles si está fresca (solo lectura aquí, no sobrescribir sin perfiles)
      const global = !opts.force ? leerCacheGlobal() : null
      let rolesData: Rol[]
      let rolesPerfil: number[]
      let diasConfig: DiaConfig[]
      let prog: { dia_semana: string; fecha: string }[]
      let propios: Set<string>

      if (global) {
        rolesData = global.roles
        const [{ propios: p }, rp, dc, pr] = await Promise.all([
          obtenerVotosSemana(semanaStr),
          obtenerRolesDePerfil(perfil.id),
          obtenerDiasConfig(semanaStr).catch(() => [] as DiaConfig[]),
          obtenerProgramacionSemana(semanaStr).catch(() => [] as { dia_semana: string; fecha: string }[]),
        ])
        propios = p
        rolesPerfil = rp
        diasConfig = dc
        prog = pr
      } else {
        const [{ propios: p }, rd, rp, dc, pr] = await Promise.all([
          obtenerVotosSemana(semanaStr),
          obtenerRoles(),
          obtenerRolesDePerfil(perfil.id),
          obtenerDiasConfig(semanaStr).catch(() => [] as DiaConfig[]),
          obtenerProgramacionSemana(semanaStr).catch(() => [] as { dia_semana: string; fecha: string }[]),
        ])
        propios = p
        rolesData = rd
        rolesPerfil = rp
        diasConfig = dc
        prog = pr
        // No sobrescribir cache global sin perfiles completos; lo dejará Programacion para no corromper.
      }

      setVotos(propios)
      setRoles(rolesData!)
      setMisRoles(rolesPerfil!)

      let diasFinal: { nombre: string; fecha: string }[]
      if (diasConfig.length > 0) {
        diasFinal = diasConfig.map((d) => ({ nombre: d.dia_semana, fecha: d.fecha }))
      } else if (prog.length > 0) {
        const mapa = new Map<string, string>()
        for (const f of prog) if (!mapa.has(f.dia_semana)) mapa.set(f.dia_semana, f.fecha)
        diasFinal = Array.from(mapa.entries()).map(([nombre, fecha]) => ({ nombre, fecha }))
        diasFinal.sort((a, b) => a.fecha.localeCompare(b.fecha))
      } else {
        diasFinal = DIAS_SEMANA.map((nombre) => ({
          nombre,
          fecha: toDateString(fechaDeDia(semana, nombre as typeof DIAS_SEMANA[number])),
        }))
      }
      setDias(diasFinal)

      // Guardar caché por usuario (solo tu disponibilidad)
      guardarCacheDisponibilidad(userId, semanaStr, {
        votos: [...propios],
        dias: diasFinal,
        misRoles: rolesPerfil!,
      })
    } catch {
      // Si falla fetch pero había cache stale, mantenerlo; si no, mostrar error
      if (!cached) setError('No se pudieron cargar los datos. Verifica tu conexión.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana, perfil])

  async function alternar(dia: string) {
    setGuardando(dia)
    setError('')
    const activo = votos.has(dia)
    const semanaStr = toDateString(semana)
    const userId = perfil?.id
    try {
      await votarDia(semanaStr, dia, !activo)
      setVotos((prev) => {
        const nuevo = new Set(prev)
        if (activo) nuevo.delete(dia)
        else nuevo.add(dia)
        // Actualizar caché por usuario (solo tu disponibilidad) para no reconsultar
        if (userId) {
          guardarCacheDisponibilidad(userId, semanaStr, {
            votos: [...nuevo],
            dias,
            misRoles,
          })
        }
        return nuevo
      })
    } catch {
      setError('No se pudo guardar tu voto. Intenta de nuevo.')
      // Invalidar caché por usuario si falló, para no dejar dato optimista
      if (userId) {
        try {
          const c = leerCacheDisponibilidad(userId, semanaStr)
          if (c) guardarCacheDisponibilidad(userId, semanaStr, { votos: [...votos], dias, misRoles })
        } catch {
          /* ignorar */
        }
      }
    } finally {
      setGuardando(null)
    }
  }

  if (!perfil) {
    return (
      <div className="pagina">
        <h2>Mi disponibilidad</h2>
        <p className="aviso">No se pudo cargar tu perfil. Verifica tu conexión a internet e intenta de nuevo.</p>
      </div>
    )
  }

  if (cargando && !roles.length) {
    return <div className="centrado">Cargando…</div>
  }

  return (
    <div className="pagina">
      <h2>Mi disponibilidad</h2>
      <p className="subtitulo">
        Marca los días en los que estarás disponible para servir <strong>la siguiente semana</strong>. Tu disponibilidad se
        toma en cuenta para la programación automática.
        {misRoles.length > 0 && (
          <>
            {' '}
            Tus roles: <strong>{roles.filter((r) => misRoles.includes(r.id)).map((r) => r.nombre).join(', ')}</strong>.
          </>
        )}
      </p>

      <SemanaSelector semana={semana} onChange={cambiarSemana} />

      {error && <p className="error">{error}</p>}

      {dias.length === 0 ? (
        <p className="aviso">No hay días habilitados para esta semana. El administrador aún no ha configurado la programación.</p>
      ) : (
        <div className="grid-dias">
          {dias.map(({ nombre, fecha }) => {
            const activo = votos.has(nombre)
            const fechaObj = new Date(fecha + 'T12:00:00')
            const pasado = fechaObj.getTime() < inicioSemana(new Date()).getTime() && !activo
            // Si es semana pasada deshabilitar, pero permitir ver lo votado
            const esPasado = new Date(fecha + 'T00:00:00').getTime() < inicioSemana(new Date()).getTime()
            return (
              <button
                key={nombre}
                type="button"
                className={`card dia-card ${activo ? 'seleccionado' : ''}`}
                onClick={() => void alternar(nombre)}
                disabled={guardando !== null || esPasado}
              >
                <span className="dia-nombre">{nombre}</span>
                <span className="dia-fecha">{formatFechaLarga(fechaObj)}</span>
                <span className={`chip ${activo ? 'chip-ok' : ''}`}>
                  {esPasado && !activo ? 'Semana pasada' : activo ? 'Disponible' : guardando === nombre ? 'Guardando…' : 'No disponible'}
                  {pasado ? '' : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!roles.length && (
        <p className="aviso">Aún no tienes roles asignados. Un administrador debe asignarte un rol para poder ser programado.</p>
      )}
    </div>
  )
}
