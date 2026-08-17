import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { DIAS_SEMANA, type DiaSemana } from '../lib/planificador'
import { inicioSemana, toDateString, fechaDeDia, formatFechaLarga } from '../lib/dias'
import { obtenerRoles, obtenerRolesDePerfil, obtenerVotosSemana, votarDia } from '../lib/api'
import type { Rol } from '../types'

export default function Disponibilidad() {
  const { perfil } = useAuth()
  const { semana, cambiarSemana } = useSemana()
  const [votos, setVotos] = useState<Set<DiaSemana>>(new Set())
  const [roles, setRoles] = useState<Rol[]>([])
  const [misRoles, setMisRoles] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<DiaSemana | null>(null)
  const [error, setError] = useState('')

  async function cargar() {
    if (!perfil) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError('')
    try {
      const [{ propios }, rolesData, rolesPerfil] = await Promise.all([
        obtenerVotosSemana(toDateString(semana)),
        obtenerRoles(),
        obtenerRolesDePerfil(perfil.id),
      ])
      setVotos(propios)
      setRoles(rolesData)
      setMisRoles(rolesPerfil)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana, perfil])

  async function alternar(dia: DiaSemana) {
    setGuardando(dia)
    setError('')
    const activo = votos.has(dia)
    try {
      await votarDia(toDateString(semana), dia, !activo)
      setVotos((prev) => {
        const nuevo = new Set(prev)
        if (activo) nuevo.delete(dia)
        else nuevo.add(dia)
        return nuevo
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(null)
    }
  }

  if (!perfil) {
    return (
      <div className="pagina">
        <h2>Mi disponibilidad</h2>
        <p className="aviso">
          No se pudo cargar tu perfil. Verifica tu conexión a internet e intenta de nuevo.
        </p>
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
        Marca los días en los que estarás disponible para servir esta semana. Tu disponibilidad se
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

      <div className="grid-dias">
        {DIAS_SEMANA.map((dia) => {
          const activo = votos.has(dia)
          const fecha = fechaDeDia(semana, dia)
          const pasado = fecha.getTime() < inicioSemana(new Date()).getTime()
          return (
            <button
              key={dia}
              type="button"
              className={`card dia-card ${activo ? 'seleccionado' : ''}`}
              onClick={() => void alternar(dia)}
              disabled={guardando !== null || pasado}
            >
              <span className="dia-nombre">{dia}</span>
              <span className="dia-fecha">{formatFechaLarga(fecha)}</span>
              <span className={`chip ${activo ? 'chip-ok' : ''}`}>
                {pasado ? 'Semana pasada' : activo ? 'Disponible' : guardando === dia ? 'Guardando…' : 'No disponible'}
              </span>
            </button>
          )
        })}
      </div>

      {!roles.length && (
        <p className="aviso">
          Aún no tienes roles asignados. Un administrador debe asignarte un rol para poder ser
          programado.
        </p>
      )}
    </div>
  )
}
