import { useCallback, useState } from 'react'
import { inicioSemana, sumarSemanas, toDateString } from '../lib/dias'
import { guardarSemanaSeleccionada, leerSemanaSeleccionada } from '../lib/cache'

interface Opciones {
  claveCache?: string
  offsetDias?: number
}

export function useSemana({ claveCache, offsetDias = 0 }: Opciones = {}) {
  const [semana, setSemana] = useState<Date>(() => {
    const guardada = leerSemanaSeleccionada(claveCache)
    if (guardada) {
      const d = new Date(`${guardada}T00:00:00`)
      if (!Number.isNaN(d.getTime())) return d
    }
    return offsetDias ? sumarSemanas(inicioSemana(), Math.ceil(offsetDias / 7)) : inicioSemana()
  })

  const cambiarSemana = useCallback(
    (nueva: Date) => {
      setSemana(nueva)
      guardarSemanaSeleccionada(toDateString(nueva), claveCache)
    },
    [claveCache],
  )

  return { semana, cambiarSemana }
}
