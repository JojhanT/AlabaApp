import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import {
  crearUsuario,
  obtenerPerfiles,
  obtenerRoles,
  obtenerMapaRoles,
  crearRol,
  actualizarRol,
  eliminarRol,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Paginacion from '../components/Paginacion'
import { leerCacheUsuarios, guardarCacheUsuarios, invalidarCacheUsuarios, leerCacheGlobal, guardarCacheGlobal, invalidarCacheGlobal } from '../lib/cache'
import type { Perfil, Rol } from '../types'

const POR_PAGINA = 8

type EdicionPendiente = {
  nombre: string
  celular: string
  roles: Set<number>
  is_admin: boolean
  is_activo: boolean
}

export default function AdminUsuarios() {
  const { perfil: yo } = useAuth()
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [rolesPerfil, setRolesPerfil] = useState<Record<string, number[]>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [rolesError, setRolesError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)

  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    celular: '',
    roles: new Set<number>(),
  })

  const [edicion, setEdicion] = useState<Record<string, EdicionPendiente>>({})
  // Roles CRUD (compacto, colapsable)
  const [showRoles, setShowRoles] = useState(false)
  const [nuevoRol, setNuevoRol] = useState('')
  const [editRolId, setEditRolId] = useState<number | null>(null)
  const [editRolNombre, setEditRolNombre] = useState('')
  const [rolAccion, setRolAccion] = useState<string | null>(null)

  async function cargar(opts: { force?: boolean } = {}) {
    setError('')
    setMensaje('')
    setRolesError('')
    const cached = !opts.force ? leerCacheUsuarios() : null
    if (cached && !opts.force) {
      setPerfiles(cached.perfiles)
      setRoles(cached.roles)
      setRolesPerfil(cached.rolesPerfil)
      setCargando(false)
      if (navigator.onLine) {
        // revalidar en background aunque fresca
      } else {
        return
      }
    } else {
      setCargando(true)
      if (!navigator.onLine) {
        if (cached) {
          setPerfiles(cached.perfiles)
          setRoles(cached.roles)
          setRolesPerfil(cached.rolesPerfil)
          setCargando(false)
          return
        }
        setError('Sin conexión y sin cache de usuarios.')
        setCargando(false)
        return
      }
    }

    try {
      // Intentar reusar global para roles si existe
      const global = leerCacheGlobal()
      let ps: Perfil[]
      let rs: Rol[]
      let mapa: Record<string, number[]>
      if (global && !opts.force) {
        ps = global.perfiles
        // obtener roles y mapa en paralelo
        const [r, m] = await Promise.all([obtenerRoles(), obtenerMapaRoles()])
        rs = r
        mapa = m
      } else {
        const [p, r, m] = await Promise.all([obtenerPerfiles(), obtenerRoles(), obtenerMapaRoles()])
        ps = p
        rs = r
        mapa = m
        // Actualizar global para otros módulos
        guardarCacheGlobal(ps, rs)
      }
      ps.sort((a, b) => Number(a.is_activo) - Number(b.is_activo) || a.nombre.localeCompare(b.nombre))
      setPerfiles(ps)
      setRoles(rs)
      setRolesPerfil(mapa)
      guardarCacheUsuarios({ perfiles: ps, roles: rs, rolesPerfil: mapa })
    } catch {
      if (!cached) setError('No se pudieron cargar los usuarios. Verifica tu conexión.')
    } finally {
      setCargando(false)
    }
    try {
      if (!cached) {
        const rs = await obtenerRoles()
        setRoles(rs)
      }
    } catch {
      setRolesError('No se pudieron cargar los roles.')
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  useEffect(() => {
    const total = Math.max(1, Math.ceil(perfiles.length / POR_PAGINA))
    setPagina((p) => Math.min(p, total))
  }, [perfiles])

  const inicio = (pagina - 1) * POR_PAGINA
  const perfilesPagina = perfiles.slice(inicio, inicio + POR_PAGINA)
  const totalPaginas = Math.max(1, Math.ceil(perfiles.length / POR_PAGINA))

  const toggleRolFormulario = useCallback((rolId: number) => {
    setForm((f) => {
      const rolesNuevos = new Set(f.roles)
      if (rolesNuevos.has(rolId)) rolesNuevos.delete(rolId)
      else rolesNuevos.add(rolId)
      return { ...f, roles: rolesNuevos }
    })
  }, [])

  async function crearUsuarioForm(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMensaje('')
    setCreando(true)
    try {
      await crearUsuario({
        codigo: form.codigo,
        nombre: form.nombre,
        celular: form.celular || null,
        roles: [...form.roles],
      })
      setMensaje(`Usuario ${form.nombre} creado correctamente.`)
      setForm({ codigo: '', nombre: '', celular: '', roles: new Set() })
      invalidarCacheUsuarios()
      invalidarCacheGlobal()
      await cargar({ force: true })
    } catch {
      setError('No se pudo crear el usuario. Verifica que el código no esté en uso.')
    } finally {
      setCreando(false)
    }
  }

  // ── Roles CRUD ──────────────────────────────────────────────
  async function handleCrearRol() {
    if (!nuevoRol.trim()) return
    setRolAccion('crear')
    setError('')
    try {
      await crearRol(nuevoRol.trim())
      setNuevoRol('')
      setMensaje('Rol creado.')
      invalidarCacheUsuarios()
      invalidarCacheGlobal()
      await cargar({ force: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRolAccion(null)
    }
  }
  async function handleActualizarRol() {
    if (editRolId === null || !editRolNombre.trim()) return
    setRolAccion(String(editRolId))
    try {
      await actualizarRol(editRolId, editRolNombre.trim())
      setEditRolId(null)
      setEditRolNombre('')
      setMensaje('Rol actualizado.')
      invalidarCacheUsuarios()
      invalidarCacheGlobal()
      await cargar({ force: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRolAccion(null)
    }
  }
  async function handleEliminarRol(id: number) {
    if (!window.confirm('¿Eliminar este rol? Se quitará de todos los usuarios que lo tengan.')) return
    setRolAccion(String(id))
    try {
      await eliminarRol(id)
      setMensaje('Rol eliminado.')
      invalidarCacheUsuarios()
      invalidarCacheGlobal()
      await cargar({ force: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRolAccion(null)
    }
  }

  // ── Edición pendiente (no envía al hacer check) ────────────
  function abrirEdicion(p: Perfil) {
    const isOpen = expandido === p.id
    if (isOpen) {
      setExpandido(null)
      return
    }
    const rolesActuales = rolesPerfil[p.id] ?? []
    setEdicion((e) => ({
      ...e,
      [p.id]: {
        nombre: p.nombre,
        celular: p.celular ?? '',
        roles: new Set(rolesActuales),
        is_admin: p.is_admin,
        is_activo: p.is_activo,
      },
    }))
    setExpandido(p.id)
  }

  function toggleRolPendiente(perfilId: string, rolId: number) {
    setEdicion((prev) => {
      const cur = prev[perfilId]
      if (!cur) return prev
      const ns = new Set(cur.roles)
      if (ns.has(rolId)) ns.delete(rolId)
      else ns.add(rolId)
      return { ...prev, [perfilId]: { ...cur, roles: ns } }
    })
  }

  async function guardarUsuario(perfilId: string) {
    const pend = edicion[perfilId]
    if (!pend) return
    const original = perfiles.find((p) => p.id === perfilId)
    if (!original) return
    setError('')
    setMensaje('')
    setGuardando(perfilId)
    try {
      // 1) profiles: nombre, celular, is_admin, is_activo (un solo update)
      const cambiosPerfil: Partial<Record<string, unknown>> = {}
      if (pend.nombre.trim() !== original.nombre) cambiosPerfil.nombre = pend.nombre.trim()
      if ((pend.celular ?? '') !== (original.celular ?? '')) cambiosPerfil.celular = pend.celular || null
      if (pend.is_admin !== original.is_admin) cambiosPerfil.is_admin = pend.is_admin
      if (pend.is_activo !== original.is_activo) cambiosPerfil.is_activo = pend.is_activo
      if (Object.keys(cambiosPerfil).length > 0) {
        const { error } = await supabase.from('profiles').update(cambiosPerfil).eq('id', perfilId)
        if (error) throw new Error(error.message)
      }

      // 2) roles: diff
      const actuales = new Set(rolesPerfil[perfilId] ?? [])
      const deseados = pend.roles
      const aAgregar = [...deseados].filter((r) => !actuales.has(r))
      const aQuitar = [...actuales].filter((r) => !deseados.has(r))
      for (const rolId of aAgregar) {
        const { error } = await supabase.from('profile_roles').insert({ profile_id: perfilId, rol_id: rolId })
        if (error) throw new Error(error.message)
      }
      for (const rolId of aQuitar) {
        const { error } = await supabase.from('profile_roles').delete().eq('profile_id', perfilId).eq('rol_id', rolId)
        if (error) throw new Error(error.message)
      }

      // Actualizar local
      setPerfiles((ps) =>
        ps.map((p) => (p.id === perfilId ? { ...p, nombre: pend.nombre.trim(), celular: pend.celular || null, is_admin: pend.is_admin, is_activo: pend.is_activo } : p)),
      )
      setRolesPerfil((m) => ({ ...m, [perfilId]: [...deseados] }))
      setMensaje('Cambios guardados.')
      setExpandido(null)
      invalidarCacheUsuarios()
      invalidarCacheGlobal()
    } catch {
      setError('No se pudieron guardar los cambios.')
    } finally {
      setGuardando(null)
    }
  }

  if (cargando) return <div className="centrado">Cargando…</div>

  return (
    <div className="pagina">
      <h2>Usuarios</h2>
      <p className="subtitulo">Gestiona a los integrantes de la banda y asigna los roles que cada uno desempeña.</p>

      {mensaje && <p className="ok">{mensaje}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h3>Crear usuario</h3>
        <form onSubmit={(e) => void crearUsuarioForm(e)} className="form-crear">
          <div className="grid-form">
            <label className="campo">
              <span>Código (cédula)</span>
              <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: 1023456789" required minLength={6} disabled={creando} />
            </label>
            <label className="campo">
              <span>Nombre</span>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" required disabled={creando} />
            </label>
            <label className="campo">
              <span>Celular</span>
              <input type="text" value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} placeholder="Opcional" disabled={creando} />
            </label>
          </div>
          <strong className="roles-titulo">Roles del nuevo usuario</strong>
          {roles.length === 0 ? (
            <p className="aviso">{rolesError ? 'No se pudieron cargar los roles. Verifica tu conexión.' : 'No se encontraron roles. Intenta recargar la página.'}</p>
          ) : (
            <div className="roles-check">
              {roles.map((rol) => (
                <label key={rol.id} className="chip chip-tog">
                  <input type="checkbox" checked={form.roles.has(rol.id)} onChange={() => toggleRolFormulario(rol.id)} disabled={creando} />
                  {rol.nombre}
                </label>
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={creando}>
            {creando ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Roles <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({roles.length})</span></h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRoles((v) => !v)}>{showRoles ? 'Ocultar' : 'Gestionar'}</button>
        </div>
        {!showRoles ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {roles.map((r) => (
              <span key={r.id} className="chip" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>{r.nombre}</span>
            ))}
            {roles.length === 0 && <span className="muted" style={{ fontSize: '0.85rem' }}>Sin roles</span>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <input className="filtro-input" style={{ flex: 1, minWidth: 140, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} placeholder="Nuevo rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void handleCrearRol())} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleCrearRol()} disabled={rolAccion === 'crear' || !nuevoRol.trim()}>
                {rolAccion === 'crear' ? '…' : '+ Agregar'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {roles.map((r) => (
                <span key={r.id} className="chip" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '0.15rem 0.4rem', fontSize: '0.8rem' }}>
                  {editRolId === r.id ? (
                    <>
                      <input className="filtro-input" style={{ width: 90, padding: '0.15rem 0.3rem', fontSize: '0.8rem' }} value={editRolNombre} onChange={(e) => setEditRolNombre(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && void handleActualizarRol()} />
                      <button type="button" className="btn btn-primary" style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }} onClick={() => void handleActualizarRol()} disabled={rolAccion === String(r.id)}>✓</button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }} onClick={() => { setEditRolId(null); setEditRolNombre('') }}>✕</button>
                    </>
                  ) : (
                    <>
                      {r.nombre}
                      <button type="button" onClick={() => { setEditRolId(r.id); setEditRolNombre(r.nombre) }} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1 }}>✏️</button>
                      <button type="button" onClick={() => void handleEliminarRol(r.id)} disabled={rolAccion === String(r.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1, opacity: 0.7 }}>🗑️</button>
                    </>
                  )}
                </span>
              ))}
            </div>
            {roles.length === 0 && <p className="muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>Sin roles. Crea el primero.</p>}
          </>
        )}
      </section>

      <section className="card">
        <h3>Integrantes ({perfiles.length})</h3>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Roles</th>
                <th>Estado</th>
                <th>Admin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {perfilesPagina.map((p) => (
                <UsuarioFila
                  key={p.id}
                  perfil={p}
                  roles={roles}
                  rolesError={rolesError}
                  rolesDePerfil={rolesPerfil[p.id] ?? []}
                  esYo={yo?.id === p.id}
                  expandido={expandido === p.id}
                  edicion={edicion[p.id]}
                  guardando={guardando === p.id}
                  onExpandir={() => abrirEdicion(p)}
                  onToggleRol={(rolId) => toggleRolPendiente(p.id, rolId)}
                  onToggleAdmin={(v) => setEdicion((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, is_admin: v } }))}
                  onToggleActivo={(v) => setEdicion((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, is_activo: v } }))}
                  onChangeCampo={(campo, valor) => setEdicion((prev) => ({ ...prev, [p.id]: { ...prev[p.id]!, [campo]: valor } }))}
                  onGuardar={() => void guardarUsuario(p.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} />
      </section>
    </div>
  )
}

interface FilaProps {
  perfil: Perfil
  roles: Rol[]
  rolesError: string
  rolesDePerfil: number[]
  esYo: boolean
  expandido: boolean
  edicion?: EdicionPendiente
  guardando: boolean
  onExpandir: () => void
  onToggleRol: (rolId: number) => void
  onToggleAdmin: (valor: boolean) => void
  onToggleActivo: (valor: boolean) => void
  onChangeCampo: (campo: 'nombre' | 'celular', valor: string) => void
  onGuardar: () => void
}

function UsuarioFila({
  perfil,
  roles,
  rolesError,
  rolesDePerfil,
  esYo,
  expandido,
  edicion,
  guardando,
  onExpandir,
  onToggleRol,
  onToggleAdmin,
  onToggleActivo,
  onChangeCampo,
  onGuardar,
}: FilaProps) {
  const rolesParaFila = expandido && edicion ? [...edicion.roles] : rolesDePerfil
  const nombresRoles = roles.filter((r) => rolesParaFila.includes(r.id)).map((r) => r.nombre)

  return (
    <>
      <tr>
        <td>{perfil.codigo}</td>
        <td>
          {perfil.nombre} {esYo && <span className="badge badge-lider">Tú</span>}
        </td>
        <td>{nombresRoles.length ? nombresRoles.join(', ') : <span className="muted">Sin rol</span>}</td>
        <td>{expandido && edicion ? (edicion.is_activo ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-pendiente">Pendiente</span>) : perfil.is_activo ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-pendiente">Pendiente</span>}</td>
        <td>{expandido && edicion ? (edicion.is_admin ? 'Sí' : 'No') : perfil.is_admin ? 'Sí' : 'No'}</td>
        <td>
          <button type="button" className="btn btn-ghost" onClick={onExpandir}>
            {expandido ? 'Cerrar' : 'Modificar'}
          </button>
        </td>
      </tr>
      {expandido && edicion && (
        <tr className="fila-expandida">
          <td colSpan={6}>
            <div className="editar-usuario">
              <div className="grid-form">
                <label className="campo">
                  <span>Nombre</span>
                  <input type="text" value={edicion.nombre} onChange={(e) => onChangeCampo('nombre', e.target.value)} disabled={guardando} />
                </label>
                <label className="campo">
                  <span>Celular</span>
                  <input type="text" value={edicion.celular} onChange={(e) => onChangeCampo('celular', e.target.value)} disabled={guardando} />
                </label>
              </div>
              <strong className="roles-titulo">Roles (se guardan al presionar Modificar)</strong>
              {roles.length === 0 ? (
                <p className="aviso">{rolesError ? 'No se pudieron cargar los roles. Verifica tu conexión.' : 'No se encontraron roles. Intenta recargar la página.'}</p>
              ) : (
                <div className="roles-check">
                  {roles.map((rol) => (
                    <label key={rol.id} className="chip chip-tog">
                      <input type="checkbox" checked={edicion.roles.has(rol.id)} onChange={() => onToggleRol(rol.id)} disabled={guardando} />
                      {rol.nombre}
                    </label>
                  ))}
                </div>
              )}
              <div className="editar-acciones">
                <label className="chip chip-tog">
                  <input type="checkbox" checked={edicion.is_activo} onChange={(e) => onToggleActivo(e.target.checked)} disabled={guardando} />
                  Cuenta activa
                </label>
                <label className="chip chip-tog">
                  <input type="checkbox" checked={edicion.is_admin} onChange={(e) => onToggleAdmin(e.target.checked)} disabled={guardando} />
                  Es administrador
                </label>
                <button type="button" className="btn btn-secondary" onClick={onGuardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
              <p className="muted" style={{ fontSize: '0.8rem' }}>Los cambios de roles y estado solo se envían al presionar “Guardar cambios”.</p>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
