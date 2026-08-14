import type { DiaSemana } from './planificador'

const OFFSET_DIA: Record<DiaSemana, number> = { Martes: 1, Jueves: 3, Sabado: 5, Domingo: 6 }

export function inicioSemana(fecha: Date = new Date()): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export function fechaDeDia(semanaInicio: Date, dia: DiaSemana): Date {
  const d = new Date(semanaInicio)
  d.setDate(d.getDate() + OFFSET_DIA[dia])
  return d
}

export function sumarSemanas(fecha: Date, n: number): Date {
  const d = new Date(fecha)
  d.setDate(d.getDate() + n * 7)
  return d
}

export function toDateString(d: Date): string {
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

export function formatFechaLarga(d: Date): string {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatSemana(d: Date): string {
  const fin = new Date(d)
  fin.setDate(fin.getDate() + 6)
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${fin.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
