export interface Perfil {
  id: string
  codigo: string
  nombre: string
  celular: string | null
  is_admin: boolean
  is_activo: boolean
  created_at: string
}

export interface Rol {
  id: number
  nombre: string
}

export interface Voto {
  id: string
  profile_id: string
  semana_inicio: string
  dia_semana: string
  created_at: string
}

export interface ProgramacionRow {
  id: string
  semana_inicio: string
  fecha: string
  dia_semana: string
  rol_id: number
  profile_id: string
  created_at: string
}

export interface RepertorioDia {
  semana_inicio: string
  dia_semana: string
  repertorio: string
  updated_by: string | null
  updated_at: string
}
