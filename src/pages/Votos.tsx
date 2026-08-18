import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { DIAS_SEMANA, type DiaSemana } from '../lib/planificador'
import { toDateString } from '../lib/dias'
import { obtenerPerfiles, obtenerVotosSemana } from '../lib/api'
import type { Perfil } from '../types'

interface Votante {
  perfil: Perfil
  dias: DiaSemana[]
}

export default function Votos() {
  const { esAdmin } = useAuth()
  const { semana, cambiarSemana } = useSemana()
  const [votantes, setVotantes] = useState<Votante[]>([])
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    async function cargar() {
      setCargando(true)
      try {
        const [perfiles, { porDia }] = await Promise.all([
          obtenerPerfiles(),
          obtenerVotosSemana(toDateString(semana)),
        ])

        const mapa = new Map<string, Votante>()
        for (const p of perfiles) {
          mapa.set(p.id, { perfil: p, dias: [] })
        }
        for (const dia of DIAS_SEMANA) {
          for (const pid of porDia[dia]) {
            mapa.get(pid)?.dias.push(dia)
          }
        }
        const lista = Array.from(mapa.values()).sort((a, b) => {
          if (a.dias.length !== b.dias.length) return b.dias.length - a.dias.length
          return a.perfil.nombre.localeCompare(b.perfil.nombre)
        })
        if (activo) setVotantes(lista)
      } catch {
        /* silencioso */
      } finally {
        if (activo) setCargando(false)
      }
    }
    void cargar()
    return () => { activo = false }
  }, [semana])

  if (!esAdmin) {
    return (
      <div className="pagina">
        <h2>Votos de la semana</h2>
        <p className="aviso">Solo los administradores pueden ver esta información.</p>
      </div>
    )
  }

  const votaron = votantes.filter((v) => v.dias.length > 0)
  const noVotaron = votantes.filter((v) => v.dias.length === 0)

  return (
    <div className="pagina">
      <h2>Votos de la semana</h2>
      <p className="subtitulo">
        Quiénes han marcado su disponibilidad esta semana.
      </p>

      <SemanaSelector semana={semana} onChange={cambiarSemana} />

      {cargando ? (
        <div className="centrado">Cargando…</div>
      ) : (
        <>
          {votaron.length > 0 && (
            <section className="votos-seccion">
              <h3 className="votos-subtitulo">
                Han votado ({votaron.length})
              </h3>
              <div className="votos-grid">
                {votaron.map((v) => (
                  <button
                    key={v.perfil.id}
                    type="button"
                    className={`voto-chip ${expandido === v.perfil.id ? 'expandido' : ''}`}
                    onClick={() => setExpandido(expandido === v.perfil.id ? null : v.perfil.id)}
                  >
                    <span className="voto-puntico" />
                    <span className="voto-nombre">{v.perfil.nombre}</span>
                    <span className="voto-dias-count">{v.dias.length}</span>
                    {expandido === v.perfil.id && (
                      <span className="voto-dias-lista">
                        {v.dias.map((d) => (
                          <span key={d} className="chip chip-ok">{d}</span>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {noVotaron.length > 0 && (
            <section className="votos-seccion">
              <h3 className="votos-subtitulo">
                No han votado ({noVotaron.length})
              </h3>
              <div className="votos-grid">
                {noVotaron.map((v) => (
                  <span key={v.perfil.id} className="voto-chip sin-voto">
                    <span className="voto-puntico puntico-gris" />
                    <span className="voto-nombre">{v.perfil.nombre}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {votantes.length === 0 && (
            <p className="aviso">No hay usuarios registrados aún.</p>
          )}
        </>
      )}
    </div>
  )
}
