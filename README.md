# Programación Semanal

Sistema para programar la banda de la semana. Cada usuario vota qué días estará disponible
(Martes, Jueves, Sábado y Domingo) y el sistema genera automáticamente la programación por día,
priorizando a quienes menos veces han sido asignados en cada rol.

- **Frontend:** React + Vite + TypeScript (se despliega gratis en Vercel/Netlify)
- **Base de datos y autenticación:** Supabase (plan gratis)
- **Cron opcional:** GitHub Actions que llama una edge function de Supabase

## Reglas de la programación

- Usuarios: código (cédula), nombre, celular y correo. La contraseña es el mismo código.
- Roles: Cantante, Piano, Guitarra, Batería y Saxofonista (un usuario puede tener varios).
- Por día: **1 piano, 1 batería, 1 cantante líder y hasta 3 apoyos**.
  Guitarra y saxofón: **se asignan todos los disponibles** que votaron ese día.
- Equidad: por cada rol se prioriza a quien tiene **menos asignaciones históricas** en ese rol,
  siempre que haya votado para ese día. Una persona ocupa un solo rol por día.
- Un cantante puede liderar un día y ser apoyo otro día (nunca ambos el mismo día).

> Para cambiar cupos por rol, edita `CUPOS` y `MAX_APOYOS` en
> `src/lib/planificador.ts` y en el motor incrustado de
> `supabase/functions/generar-programacion/index.ts`.

## Configuración

### 1. Crear el proyecto en Supabase

1. Crea un proyecto en https://supabase.com (plan gratuito).
2. Ve a **SQL Editor**, pega el contenido de `supabase/migrations/0001_init.sql` y ejecútalo.
   (Si usas la CLI: `supabase db push`.)
3. Ejecuta también `supabase/migrations/0002_is_activo.sql` (agrega la columna `is_activo`, para
   que los usuarios que se registran queden pendientes de activación).
4. Ve a **Project Settings → API** y copia la `URL` y la `anon key`.

### 2. Configurar el frontend

```bash
npm install
cp .env.example .env   # en Windows:  Copy-Item .env.example .env
```

Edita `.env`:

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-ANON-KEY
```

```bash
npm run dev
```

### 3. Crear el primer administrador

La contraseña es el código (cédula) y el email de acceso se deriva automáticamente como
`CODIGO@iglesia.local`.

**Opción A (recomendada, requiere la edge function):** en Supabase → **Authentication → Users →
Add user**, crea el usuario con email `CODIGO@iglesia.local` y contraseña = código. Luego ejecuta
en SQL Editor:

```sql
insert into public.profiles (id, codigo, nombre, is_admin)
select id, 'CODIGO', 'Nombre del admin', true
from auth.users
where email = 'CODIGO@iglesia.local'
on conflict (id) do nothing;
```

Después, con ese admin ya logueado, en **Usuarios** (menú Admin) se crean los demás integrantes.

**Opción B (sin SQL):** si prefieres, despliega la función `crear-usuario` (ver abajo) y crea el
primer usuario con el formulario de **Usuarios**; luego márcalo como administrador en la misma
pantalla.

### 4. Desplegar las edge functions

Se necesitan para **crear usuarios** (módulo admin) y para el **cron** (opcional).
Hay dos formas:

**Opción A — desde el dashboard (sin instalar nada):**

En el dashboard de Supabase ve a **Edge Functions → Deploy a new function**. Supabase sube
una sola archivo por función, por eso cada función es autónoma:

1. Función `crear-usuario`: pega todo el contenido de
   `supabase/functions/crear-usuario/index.ts`.
2. Función `registrarse`: pega todo el contenido de
   `supabase/functions/registrarse/index.ts`. Crea las cuentas como **inactivas**; un
   administrador las activa desde **Usuarios**.
3. Función `generar-programacion`: pega todo el contenido de
   `supabase/functions/generar-programacion/index.ts` (el motor está incluido en el mismo archivo,
   no depende de `_shared`).

Luego configura los secretos de cada función (Dashboard → **Edge Functions → Secrets**):

- `SUPABASE_SERVICE_ROLE_KEY`: **Project Settings → API → service_role** (nunca lo pongas en el frontend)
- `CRON_SECRET`: una clave larga aleatoria (la usa el cron para autorizar la generación)

**Opción B — con la CLI de Supabase:**

```bash
npm install -g supabase
supabase login
supabase functions deploy crear-usuario
supabase functions deploy generar-programacion
```

> Nota: en la CLI, si prefieres el motor compartido en vez de la copia incrustada, puedes mover
> el motor a `supabase/functions/_shared/planificador.ts` e importarlo desde la función.

### 5. Cron job con GitHub Actions (opcional)

El workflow ya está en `.github/workflows/generar-programacion.yml` y ejecuta la generación
todos los lunes a las 2:00 AM UTC. Para activarlo:

1. Sube el proyecto a GitHub.
2. En el repositorio: **Settings → Secrets and variables → Actions**, agrega:
   - `SUPABASE_URL` (la URL del proyecto)
   - `SUPABASE_ANON_KEY` (la anon key)
   - `CRON_SECRET` (el mismo valor configurado en Supabase)
3. El workflow también se puede ejecutar manualmente desde la pestaña **Actions**.

Para apuntar a otra semana usa `?semana=AAAA-MM-DD` (lunes de la semana). Por defecto genera
la semana actual.

### 6. Desplegar el frontend gratis

**Vercel:** importa el repo → framework `Vite` → agrega las variables `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` → Deploy.

**Netlify:** igual, build `npm run build`, publish `dist`.

## Funcionamiento

- **Login:** código + contraseña (código). Backed por Supabase Auth con email derivado.
- **Registro:** cualquiera puede solicitar acceso desde el login; la cuenta queda **inactiva**
  hasta que un administrador la active desde **Usuarios**.
- **Mi disponibilidad:** votar/no votar cada día de la semana (con navegación entre semanas).
- **Programación:** vista por día y botón **“Generar programación”** (solo admin). El botón
  ejecuta el motor directamente en el navegador; es seguro porque la escritura está protegida
  por RLS (solo admin). También muestra el contador histórico por rol.
- **Usuarios (admin):** crear usuarios, asignar roles y administradores.

## Seguridad

- Row Level Security activo: cada usuario solo vota/edita sus propios votos y su perfil.
- La generación de programación solo la puede escribir un admin (RLS) o la edge function
  (service_role).
- La edge function `crear-usuario` verifica que quien llama sea admin.
- La edge function `registrarse` es pública pero solo crea cuentas **inactivas**; el login y el
  contexto cierran sesión si la cuenta no está activa.
- `service_role` y `CRON_SECRET` nunca se exponen en el frontend.

## Estructura

```
supabase/
  migrations/0001_init.sql        Esquema, RLS y roles
  migrations/0002_is_activo.sql   Columna is_activo (activación de cuentas)
  functions/
    crear-usuario/                Crear usuario (valida admin)
    registrarse/                  Registro público (cuenta inactiva)
    generar-programacion/         Generar por cron (service role, autónoma)
.github/workflows/generar-programacion.yml   Cron de GitHub Actions
src/
  lib/planificador.ts             Motor de programación (frontend, fuente)
  lib/api.ts                      Acceso a datos y generación
  lib/dias.ts                     Utilidades de fechas/semanas
  lib/auth.ts                     Login por código
  context/AuthContext.tsx         Sesión y rol admin
  pages/                          Login, Disponibilidad, Programación, Usuarios
```
