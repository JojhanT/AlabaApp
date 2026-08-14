import { createClient } from 'jsr:@supabase/supabase-js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

interface Cuerpo {
  codigo?: unknown
  nombre?: unknown
  celular?: unknown
  correo?: unknown
}

// Registro público: crea el usuario como INACTIVO.
// Un administrador debe activarlo para que pueda iniciar sesión.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let cuerpo: Cuerpo
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const codigo = String(cuerpo.codigo ?? '').trim()
  const nombre = String(cuerpo.nombre ?? '').trim()
  const celular = cuerpo.celular ? String(cuerpo.celular).trim() : null
  const correo = cuerpo.correo ? String(cuerpo.correo).trim() : null

  if (!codigo || !nombre) return json({ error: 'Faltan datos: codigo y nombre son obligatorios' }, 400)
  if (codigo.length < 6) {
    return json({ error: 'El código debe tener al menos 6 caracteres (la contraseña es el código)' }, 400)
  }

  const email = `${codigo}@iglesia.local`
  const password = codigo

  const servicio = createClient(supabaseUrl, serviceRoleKey)

  const { data: existente } = await servicio
    .from('profiles')
    .select('codigo')
    .eq('codigo', codigo)
    .maybeSingle()
  if (existente) {
    return json({ error: 'Ya existe un usuario con ese código' }, 400)
  }

  const { data: nuevo, error: errUsuario } = await servicio.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (errUsuario) return json({ error: errUsuario.message }, 400)

  const userId = nuevo.user.id

  const { error: errPerfil } = await servicio.from('profiles').insert({
    id: userId,
    codigo,
    nombre,
    celular,
    correo,
    is_activo: false,
  })
  if (errPerfil) {
    await servicio.auth.admin.deleteUser(userId)
    return json({ error: errPerfil.message }, 400)
  }

  return json({ ok: true, id: userId, pendiente_activacion: true })
})
