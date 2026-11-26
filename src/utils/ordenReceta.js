// Orden de los medicamentos de la receta: el orden en que el médico los elige es el orden en que quedan, de arriba hacia abajo.

/** Agrega al final, sin tocar lo que ya estaba: lo primero que se eligió queda arriba. */
export function agregarAlFinal(lista, nuevos) {
  return [...(Array.isArray(lista) ? lista : []), ...(Array.isArray(nuevos) ? nuevos : [])];
}

/** Mueve el elemento `indice` una posición (delta -1 sube, +1 baja). Fuera de rango no cambia nada. */
export function moverItem(lista, indice, delta) {
  const base = Array.isArray(lista) ? lista : [];
  const destino = indice + delta;
  if (indice < 0 || indice >= base.length || destino < 0 || destino >= base.length) return base;
  const copia = [...base];
  const [item] = copia.splice(indice, 1);
  copia.splice(destino, 0, item);
  return copia;
}

/** Marca o desmarca una sugerencia conservando el orden de los clics (una clave no se repite). */
export function alternarSeleccion(orden, clave, marcado) {
  const base = Array.isArray(orden) ? orden : [];
  const sinClave = base.filter((k) => k !== clave);
  return marcado ? [...sinClave, clave] : sinClave;
}

/** Items elegidos en el orden de los clics; una misma clave sin item (ya no listada) se descarta. */
export function itemsEnOrdenDeSeleccion(orden, itemsPorClave) {
  const mapa = itemsPorClave instanceof Map ? itemsPorClave : new Map();
  return (Array.isArray(orden) ? orden : []).map((k) => mapa.get(k)).filter(Boolean);
}
