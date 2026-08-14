interface Props {
  pagina: number
  totalPaginas: number
  onCambiar: (pagina: number) => void
}

export default function Paginacion({ pagina, totalPaginas, onCambiar }: Props) {
  if (totalPaginas <= 1) return null
  return (
    <div className="paginacion">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pagina <= 1}
        onClick={() => onCambiar(pagina - 1)}
      >
        Anterior
      </button>
      <span className="pagina-indicador">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pagina >= totalPaginas}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </div>
  )
}
