import { useCallback, useState } from 'react'
import { inicioSemana, toDateString } from '../lib/dias'
import { guardarSemanaSeleccionada, leerSemanaSeleccionada } from '../lib/cache'

export function useSemana() {
  const [semana, setSemana] = useState<Date>(() => {
    const guardada = leerSemanaSeleccionada()
    if (guardada) {
      const d = new Date(`${guardada}T00:00:00`)
      if (!Number.isNaN(d.getTime())) return d
    }
    return inicioSemana()
  })

  const cambiarSemana = useCallback((nueva: Date) => {
    setSemana(nueva)
    guardarSemanaSeleccionada(toDateString(nueva))
  }, [])

  return { semana, cambiarSemana }
}
