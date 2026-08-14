import { inicioSemana, sumarSemanas, formatSemana } from '../lib/dias'

interface Props {
  semana: Date
  onChange: (semana: Date) => void
}

export default function SemanaSelector({ semana, onChange }: Props) {
  const actual = inicioSemana()

  return (
    <div className="semana-nav">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange(sumarSemanas(semana, -1))}
        aria-label="Semana anterior"
      >
        ‹ Anterior
      </button>
      <div className="semana-titulo">
        <strong>{formatSemana(semana)}</strong>
        {semana.getTime() === actual.getTime() && <span className="chip chip-info">Semana actual</span>}
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange(sumarSemanas(semana, 1))}
        aria-label="Semana siguiente"
      >
        Siguiente ›
      </button>
    </div>
  )
}
