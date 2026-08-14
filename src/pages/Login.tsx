import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { iniciarSesion } from '../lib/auth'
import { registrarse } from '../lib/api'

export default function Login() {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const [mostrarRegistro, setMostrarRegistro] = useState(false)
  const [registro, setRegistro] = useState({ codigo: '', nombre: '', celular: '', correo: '' })
  const [registrando, setRegistrando] = useState(false)
  const [mensajeRegistro, setMensajeRegistro] = useState('')

  const navigate = useNavigate()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      const { data, error: err } = await iniciarSesion(codigo)
      if (err) {
        setError(
          err.name === 'CuentaInactiva'
            ? err.message
            : 'Código o contraseña incorrectos. Verifica que tu usuario fue registrado y activado.',
        )
        return
      }
      if (data.session) navigate('/', { replace: true })
    } finally {
      setCargando(false)
    }
  }

  async function enviarRegistro(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMensajeRegistro('')
    setRegistrando(true)
    try {
      await registrarse({
        codigo: registro.codigo,
        nombre: registro.nombre,
        celular: registro.celular || null,
        correo: registro.correo || null,
      })
      setMensajeRegistro(
        `Solicitud de ${registro.nombre} recibida. Cuando el administrador active tu cuenta podrás ingresar.`,
      )
      setCodigo(registro.codigo)
      setRegistro({ codigo: '', nombre: '', celular: '', correo: '' })
      setMostrarRegistro(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <div className="login">
      <div className="login-col">
        <div className="card login-card">
          <h1>AlabaApp</h1>
          <p className="subtitulo">
            Bienvenido. Ingresa con tu código de identificación para ver tu disponibilidad y la
            programación de la semana.
          </p>
          <form onSubmit={(e) => void enviar(e)}>
            <label className="campo">
              <span>Código</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Tu código"
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            {mensajeRegistro && <p className="ok">{mensajeRegistro}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={cargando}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setMostrarRegistro((v) => !v)}
          >
            {mostrarRegistro ? 'Cerrar' : '¿No tienes cuenta? Regístrate'}
          </button>
        </div>

        {mostrarRegistro && (
          <div className="card login-card">
            <h3>Solicitar acceso</h3>
            <p className="subtitulo">
              Regístrate con tu código. Un administrador activará tu cuenta antes de que puedas
              ingresar.
            </p>
            <form onSubmit={(e) => void enviarRegistro(e)} className="form-crear">
              <label className="campo">
                <span>Código (cédula)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={registro.codigo}
                  onChange={(e) => setRegistro({ ...registro, codigo: e.target.value })}
                  placeholder="Ej: 1023456789"
                  required
                  minLength={6}
                />
              </label>
              <label className="campo">
                <span>Nombre</span>
                <input
                  type="text"
                  value={registro.nombre}
                  onChange={(e) => setRegistro({ ...registro, nombre: e.target.value })}
                  placeholder="Nombre completo"
                  required
                />
              </label>
              <label className="campo">
                <span>Celular</span>
                <input
                  type="text"
                  value={registro.celular}
                  onChange={(e) => setRegistro({ ...registro, celular: e.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <label className="campo">
                <span>Correo</span>
                <input
                  type="email"
                  value={registro.correo}
                  onChange={(e) => setRegistro({ ...registro, correo: e.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={registrando}>
                {registrando ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
