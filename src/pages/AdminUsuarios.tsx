import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { crearUsuario, obtenerPerfiles, obtenerRoles, obtenerRolesDePerfil } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Paginacion from '../components/Paginacion'
import type { Perfil, Rol } from '../types'

const POR_PAGINA = 8

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
    correo: '',
    roles: new Set<number>(),
  })

  const [edicion, setEdicion] = useState<Record<string, { nombre: string; celular: string; correo: string }>>(
    {},
  )

  async function cargar() {
    setError('')
    setMensaje('')
    setRolesError('')
    try {
      const ps = await obtenerPerfiles()
      ps.sort(
        (a, b) => Number(a.is_activo) - Number(b.is_activo) || a.nombre.localeCompare(b.nombre),
      )
      setPerfiles(ps)
      const mapa: Record<string, number[]> = {}
      for (const p of ps) mapa[p.id] = await obtenerRolesDePerfil(p.id)
      setRolesPerfil(mapa)
    } catch (e) {
      setError('Error al cargar usuarios: ' + (e as Error).message)
    }
    try {
      const rs = await obtenerRoles()
      setRoles(rs)
    } catch (e) {
      setRolesError((e as Error).message)
    } finally {
      setCargando(false)
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
        correo: form.correo || null,
        roles: [...form.roles],
      })
      setMensaje(`Usuario ${form.nombre} creado correctamente.`)
      setForm({ codigo: '', nombre: '', celular: '', correo: '', roles: new Set() })
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreando(false)
    }
  }

  async function actualizarRoles(perfilId: string, rolId: number, activo: boolean) {
    setError('')
    setGuardando(perfilId)
    try {
      if (activo) {
        const { error } = await supabase
          .from('profile_roles')
          .insert({ profile_id: perfilId, rol_id: rolId })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('profile_roles')
          .delete()
          .eq('profile_id', perfilId)
          .eq('rol_id', rolId)
        if (error) throw new Error(error.message)
      }
      setRolesPerfil((m) => {
        const actualizado = activo
          ? [...(m[perfilId] ?? []), rolId]
          : (m[perfilId] ?? []).filter((r) => r !== rolId)
        return { ...m, [perfilId]: actualizado }
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(null)
    }
  }

  async function actualizarAdmin(perfilId: string, valor: boolean) {
    setError('')
    setGuardando(perfilId)
    const { error } = await supabase.from('profiles').update({ is_admin: valor }).eq('id', perfilId)
    setGuardando(null)
    if (error) {
      setError(error.message)
      return
    }
    setPerfiles((ps) => ps.map((p) => (p.id === perfilId ? { ...p, is_admin: valor } : p)))
  }

  async function actualizarActivo(perfilId: string, valor: boolean) {
    setError('')
    setGuardando(perfilId)
    const { error } = await supabase
      .from('profiles')
      .update({ is_activo: valor })
      .eq('id', perfilId)
    setGuardando(null)
    if (error) {
      setError(error.message)
      return
    }
    setPerfiles((ps) => ps.map((p) => (p.id === perfilId ? { ...p, is_activo: valor } : p)))
    setMensaje(valor ? 'Cuenta activada.' : 'Cuenta desactivada.')
  }

  async function guardarDatos(perfilId: string) {
    setError('')
    const datos = edicion[perfilId]
    if (!datos) return
    setGuardando(perfilId)
    const { error } = await supabase
      .from('profiles')
      .update({ nombre: datos.nombre, celular: datos.celular || null, correo: datos.correo || null })
      .eq('id', perfilId)
    setGuardando(null)
    if (error) {
      setError(error.message)
      return
    }
    setPerfiles((ps) =>
      ps.map((p) =>
        p.id === perfilId
          ? { ...p, nombre: datos.nombre, celular: datos.celular || null, correo: datos.correo || null }
          : p,
      ),
    )
    setMensaje('Datos actualizados.')
  }

  function abrirEdicion(p: Perfil) {
    setEdicion((e) => ({
      ...e,
      [p.id]: { nombre: p.nombre, celular: p.celular ?? '', correo: p.correo ?? '' },
    }))
    setExpandido((prev) => (prev === p.id ? null : p.id))
  }

  if (cargando) return <div className="centrado">Cargando…</div>

  return (
    <div className="pagina">
      <h2>Usuarios</h2>
      <p className="subtitulo">
        Gestiona a los integrantes de la banda y asigna los roles que cada uno desempeña.
      </p>

      {mensaje && <p className="ok">{mensaje}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h3>Crear usuario</h3>
        <form onSubmit={(e) => void crearUsuarioForm(e)} className="form-crear">
          <div className="grid-form">
            <label className="campo">
              <span>Código (cédula)</span>
              <input
                type="text"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ej: 1023456789"
                required
                minLength={6}
                disabled={creando}
              />
            </label>
            <label className="campo">
              <span>Nombre</span>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre completo"
                required
                disabled={creando}
              />
            </label>
            <label className="campo">
              <span>Celular</span>
              <input
                type="text"
                value={form.celular}
                onChange={(e) => setForm({ ...form, celular: e.target.value })}
                placeholder="Opcional"
                disabled={creando}
              />
            </label>
            <label className="campo">
              <span>Correo</span>
              <input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
                placeholder="Opcional"
                disabled={creando}
              />
            </label>
          </div>
          <strong className="roles-titulo">Roles del nuevo usuario</strong>
          {roles.length === 0 ? (
            <p className="aviso">
              {rolesError
                ? `No se pudieron cargar los roles: ${rolesError}`
                : 'No se encontraron roles. Verifica la tabla "roles" en Supabase y recarga.'}
            </p>
          ) : (
            <div className="roles-check">
              {roles.map((rol) => (
                <label key={rol.id} className="chip chip-tog">
                  <input
                    type="checkbox"
                    checked={form.roles.has(rol.id)}
                    onChange={() => toggleRolFormulario(rol.id)}
                    disabled={creando}
                  />
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
                  onEdicion={setEdicion}
                  onGuardarDatos={() => void guardarDatos(p.id)}
                  onToggleRol={(rolId, activo) => void actualizarRoles(p.id, rolId, activo)}
                  onToggleAdmin={(valor) => void actualizarAdmin(p.id, valor)}
                  onToggleActivo={(valor) => void actualizarActivo(p.id, valor)}
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
  edicion?: { nombre: string; celular: string; correo: string }
  guardando: boolean
  onExpandir: () => void
  onEdicion: (fn: (prev: Record<string, { nombre: string; celular: string; correo: string }>) => Record<string, { nombre: string; celular: string; correo: string }>) => void
  onGuardarDatos: () => void
  onToggleRol: (rolId: number, activo: boolean) => void
  onToggleAdmin: (valor: boolean) => void
  onToggleActivo: (valor: boolean) => void
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
  onEdicion,
  onGuardarDatos,
  onToggleRol,
  onToggleAdmin,
  onToggleActivo,
}: FilaProps) {
  const nombresRoles = roles.filter((r) => rolesDePerfil.includes(r.id)).map((r) => r.nombre)

  function setCampo(campo: 'nombre' | 'celular' | 'correo', valor: string) {
    onEdicion((prev) => {
      const base = prev[perfil.id] ?? {
        nombre: perfil.nombre,
        celular: perfil.celular ?? '',
        correo: perfil.correo ?? '',
      }
      return { ...prev, [perfil.id]: { ...base, [campo]: valor } }
    })
  }

  return (
    <>
      <tr>
        <td>{perfil.codigo}</td>
        <td>{perfil.nombre} {esYo && <span className="badge badge-lider">Tú</span>}</td>
        <td>{nombresRoles.length ? nombresRoles.join(', ') : <span className="muted">Sin rol</span>}</td>
        <td>
          {perfil.is_activo ? (
            <span className="badge badge-ok">Activo</span>
          ) : (
            <span className="badge badge-pendiente">Pendiente</span>
          )}
        </td>
        <td>{perfil.is_admin ? 'Sí' : 'No'}</td>
        <td>
          <button type="button" className="btn btn-ghost" onClick={onExpandir}>
            {expandido ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr className="fila-expandida">
          <td colSpan={6}>
            <div className="editar-usuario">
              <div className="grid-form">
                <label className="campo">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={edicion?.nombre ?? ''}
                    onChange={(e) => setCampo('nombre', e.target.value)}
                    disabled={guardando}
                  />
                </label>
                <label className="campo">
                  <span>Celular</span>
                  <input
                    type="text"
                    value={edicion?.celular ?? ''}
                    onChange={(e) => setCampo('celular', e.target.value)}
                    disabled={guardando}
                  />
                </label>
                <label className="campo">
                  <span>Correo</span>
                  <input
                    type="email"
                    value={edicion?.correo ?? ''}
                    onChange={(e) => setCampo('correo', e.target.value)}
                    disabled={guardando}
                  />
                </label>
              </div>
              <strong className="roles-titulo">Roles</strong>
              {roles.length === 0 ? (
                <p className="aviso">
                  {rolesError
                    ? `No se pudieron cargar los roles: ${rolesError}`
                    : 'No se encontraron roles. Verifica la tabla "roles" en Supabase y recarga.'}
                </p>
              ) : (
                <div className="roles-check">
                  {roles.map((rol) => (
                    <label key={rol.id} className="chip chip-tog">
                      <input
                        type="checkbox"
                        checked={rolesDePerfil.includes(rol.id)}
                        onChange={(e) => onToggleRol(rol.id, e.target.checked)}
                        disabled={guardando}
                      />
                      {rol.nombre}
                    </label>
                  ))}
                </div>
              )}
              <div className="editar-acciones">
                <label className="chip chip-tog">
                  <input
                    type="checkbox"
                    checked={perfil.is_activo}
                    onChange={(e) => onToggleActivo(e.target.checked)}
                    disabled={guardando}
                  />
                  Cuenta activa
                </label>
                <label className="chip chip-tog">
                  <input
                    type="checkbox"
                    checked={perfil.is_admin}
                    onChange={(e) => onToggleAdmin(e.target.checked)}
                    disabled={guardando}
                  />
                  Es administrador
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onGuardarDatos}
                  disabled={guardando}
                >
                  {guardando ? 'Guardando…' : 'Guardar datos'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
