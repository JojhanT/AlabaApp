import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { iniciarSesion } from '../lib/auth'

export default function Login() {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const navigate = useNavigate()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      const { data, error: err } = await iniciarSesion(codigo)
      if (err) {
        setError('Código o contraseña incorrectos. Verifica que tu usuario fue registrado.')
        return
      }
      if (data.session) navigate('/', { replace: true })
    } finally {
      setCargando(false)
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
            <button type="submit" className="btn btn-primary btn-block" disabled={cargando}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
