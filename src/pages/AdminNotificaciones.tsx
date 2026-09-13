import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { toDateString } from '../lib/dias'
import { obtenerPerfiles, obtenerRoles, obtenerProgramacionSemana, obtenerMapaRoles } from '../lib/api'
import type { Perfil, Rol } from '../types'

type Modo = 'todos' | 'rol' | 'dia' | 'personas'

const MENSAJE_VOTACION_DEMO = `¡Hola! 🙏 Tu disponibilidad es clave para armar una programación justa y sin repeticiones. Marca tus días para la siguiente semana en menos de 10 segundos y asegura tu lugar. ¡Si votas, el sistema te prioriza! ¿Te animas?`

export default function AdminNotificaciones() {
  const { perfil } = useAuth()
  const { semana, cambiarSemana } = useSemana()
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [modo, setModo] = useState<Modo>('todos')
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [rolesSel, setRolesSel] = useState<number[]>([])
  const [personasSel, setPersonasSel] = useState<Set<string>>(new Set())
  const [filtroPersona, setFiltroPersona] = useState('')
  const [progDias, setProgDias] = useState<{ dia: string; fecha: string; count: number }[]>([])
  const [diaSel, setDiaSel] = useState<string>('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    void (async () => {
      const [ps, rs] = await Promise.all([obtenerPerfiles(), obtenerRoles()])
      setPerfiles(ps.filter((p) => p.is_activo))
      setRoles(rs)
    })()
  }, [])

  // Cargar días programados para la semana seleccionada (para modo "dia")
  useEffect(() => {
    if (modo !== 'dia') return
    void (async () => {
      const prog = await obtenerProgramacionSemana(toDateString(semana)).catch(() => [])
      const mapa = new Map<string, { fecha: string; ids: Set<string> }>()
      for (const r of prog) {
        const cur = mapa.get(r.dia_semana) ?? { fecha: r.fecha, ids: new Set<string>() }
        cur.ids.add(r.profile_id)
        mapa.set(r.dia_semana, cur)
      }
      const lista = Array.from(mapa.entries()).map(([dia, v]) => ({ dia, fecha: v.fecha, count: v.ids.size }))
      lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
      setProgDias(lista)
      if (lista.length && !diaSel) setDiaSel(lista[0].dia)
      if (lista.length === 0) setDiaSel('')
    })()
  }, [semana, modo, diaSel])

  const destinatariosCalculados = useMemo(() => {
    if (modo === 'todos') return null
    if (modo === 'personas') return Array.from(personasSel)
    if (modo === 'rol') {
      if (rolesSel.length === 0) return []
      // se resuelve async al enviar, aquí solo preview: contar
      return null // se calcula al enviar
    }
    if (modo === 'dia') {
      return null // se calcula al enviar
    }
    return []
  }, [modo, personasSel, rolesSel])

  const previewCount = useMemo(() => {
    if (modo === 'todos') return perfiles.length
    if (modo === 'personas') return personasSel.size
    if (modo === 'dia') {
      const d = progDias.find((x) => x.dia === diaSel)
      return d?.count ?? 0
    }
    if (modo === 'rol') {
      // estimación: no precisa sin mapa, contar luego
      return rolesSel.length > 0 ? -1 : 0
    }
    return 0
  }, [modo, perfiles.length, personasSel.size, progDias, diaSel, rolesSel])

  async function resolverDestinatarios(): Promise<string[] | null> {
    if (modo === 'todos') return null
    if (modo === 'personas') return Array.from(personasSel)
    if (modo === 'rol') {
      if (rolesSel.length === 0) return []
      const mapa = await obtenerMapaRoles()
      const ids = perfiles.filter((p) => (mapa[p.id] ?? []).some((r) => rolesSel.includes(r))).map((p) => p.id)
      return ids
    }
    if (modo === 'dia') {
      if (!diaSel) return []
      const prog = await obtenerProgramacionSemana(toDateString(semana))
      const ids = [...new Set(prog.filter((r) => r.dia_semana === diaSel).map((r) => r.profile_id))]
      return ids
    }
    return []
  }

  async function enviar() {
    setErr('')
    setMsg('')
    if (!titulo.trim() || !cuerpo.trim()) {
      setErr('Título y mensaje son obligatorios.')
      return
    }
    setEnviando(true)
    try {
      const dest = await resolverDestinatarios()
      if (dest !== null && dest.length === 0) {
        setErr('No hay destinatarios para ese filtro. Elige otro.')
        return
      }
      const { error } = await supabase.from('notificaciones').insert({
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim(),
        creado_por: perfil!.id,
        destinatarios: dest,
        filtros: { modo, rolesSel, diaSel, semana: toDateString(semana) },
      })
      if (error) throw new Error(error.message)
      setMsg(`Enviada a ${dest === null ? 'todos' : dest.length + ' integrantes'} correctamente.`)
      // No limpiamos todo para permitir reenvío rápido
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function usarDemoVotacion() {
    setTitulo('¡Tu voto hace la diferencia! 🗳️')
    setCuerpo(MENSAJE_VOTACION_DEMO)
  }

  const personasFiltradas = perfiles.filter((p) => !filtroPersona || p.nombre.toLowerCase().includes(filtroPersona.toLowerCase()))

  return (
    <div className="pagina">
      <h2>Notificaciones personalizadas</h2>
      <p className="subtitulo">Envía un push a todos, por rol, por día programado o a personas específicas. Solo lo verán los destinatarios.</p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <label className="campo">
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: ¡Nueva programación!" maxLength={60} />
        </label>
        <label className="campo">
          Mensaje
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Escribe el mensaje..."
            rows={4}
            style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--borde)', borderRadius: 8, font: 'inherit' }}
          />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={usarDemoVotacion} style={{ alignSelf: 'flex-start' }}>
          Usar mensaje demo para incitar a votar
        </button>
        <div className="aviso" style={{ fontSize: '0.85rem' }}>
          <strong>Demo votar:</strong> {MENSAJE_VOTACION_DEMO}
        </div>

        <div>
          <p className="roles-titulo" style={{ marginBottom: 6, fontWeight: 600 }}>Destinatarios</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <label className={`chip chip-tog ${modo === 'todos' ? 'chip-info' : ''}`}><input type="radio" checked={modo === 'todos'} onChange={() => setModo('todos')} /> Todos</label>
            <label className={`chip chip-tog ${modo === 'rol' ? 'chip-info' : ''}`}><input type="radio" checked={modo === 'rol'} onChange={() => setModo('rol')} /> Por rol</label>
            <label className={`chip chip-tog ${modo === 'dia' ? 'chip-info' : ''}`}><input type="radio" checked={modo === 'dia'} onChange={() => setModo('dia')} /> Por día programado</label>
            <label className={`chip chip-tog ${modo === 'personas' ? 'chip-info' : ''}`}><input type="radio" checked={modo === 'personas'} onChange={() => setModo('personas')} /> Personas</label>
          </div>

          {modo === 'rol' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {roles.map((r) => (
                <label key={r.id} className={`chip chip-tog ${rolesSel.includes(r.id) ? 'chip-info' : ''}`}>
                  <input
                    type="checkbox"
                    checked={rolesSel.includes(r.id)}
                    onChange={() => setRolesSel((prev) => (prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                  />{' '}
                  {r.nombre}
                </label>
              ))}
              <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>{previewCount === -1 ? 'Se calculará al enviar' : ''}</span>
            </div>
          )}

          {modo === 'dia' && (
            <div style={{ marginTop: 6 }}>
              <SemanaSelector semana={semana} onChange={cambiarSemana} />
              {progDias.length === 0 ? (
                <p className="muted" style={{ marginTop: 6 }}>No hay programación para esa semana. Genera o guarda primero.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {progDias.map((d) => (
                    <label key={d.dia} className={`chip chip-tog ${diaSel === d.dia ? 'chip-info' : ''}`}>
                      <input type="radio" checked={diaSel === d.dia} onChange={() => setDiaSel(d.dia)} /> {d.dia} ({d.count})
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {modo === 'personas' && (
            <div style={{ marginTop: 6 }}>
              <input
                className="filtro-input"
                placeholder="Buscar integrante..."
                value={filtroPersona}
                onChange={(e) => setFiltroPersona(e.target.value)}
              />
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--borde)', borderRadius: 8, padding: 6, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {personasFiltradas.map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={personasSel.has(p.id)}
                      onChange={() => setPersonasSel((prev) => {
                        const n = new Set(prev)
                        if (n.has(p.id)) n.delete(p.id)
                        else n.add(p.id)
                        return n
                      })}
                    />{' '}
                    {p.nombre}
                  </label>
                ))}
                {personasFiltradas.length === 0 && <span className="muted">Sin resultados</span>}
              </div>
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>Seleccionados: {personasSel.size}</p>
            </div>
          )}

          {destinatariosCalculados !== null && <p className="muted" style={{ fontSize: '0.8rem' }}>Destinatarios: {previewCount} persona(s)</p>}
          {modo === 'todos' && <p className="muted" style={{ fontSize: '0.8rem' }}>Se enviará a todos ({perfiles.length})</p>}
        </div>

        <button type="button" className="btn btn-primary" onClick={() => void enviar()} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar notificación'}
        </button>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="error">{err}</p>}
      </div>

      <div className="card">
        <h3>Mensajes demo para incitar a votar</h3>
        <p className="muted" style={{ fontSize: '0.9rem' }}>Copia y usa como plantilla:</p>
        <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 8, padding: 10, marginTop: 6, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
          <strong>¡Tu voto hace la diferencia! 🗳️</strong>
          {'\n'}
          {MENSAJE_VOTACION_DEMO}
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>Tip: Envía viernes 20:00 a quienes aún no votaron (el sistema ya lo hace automático), o úsalo manual cualquier día.</p>
      </div>
    </div>
  )
}
