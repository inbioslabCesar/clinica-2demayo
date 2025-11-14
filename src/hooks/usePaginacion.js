import { useState } from "react";

export function usePaginacion(totalElementos, elementosPorPaginaDefault = 5) {
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina, setElementosPorPagina] = useState(elementosPorPaginaDefault);

  const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
  const indiceInicio = (paginaActual - 1) * elementosPorPagina;
  const indiceFin = indiceInicio + elementosPorPagina;

  const cambiarPagina = (nuevaPagina) => setPaginaActual(nuevaPagina);
  const cambiarElementosPorPagina = (nuevaCantidad) => {
    setElementosPorPagina(nuevaCantidad);
    setPaginaActual(1);
  };

  return {
    paginaActual,
    elementosPorPagina,
    totalPaginas,
    indiceInicio,
    indiceFin,
    cambiarPagina,
    cambiarElementosPorPagina,
    setPaginaActual,
  };
}
