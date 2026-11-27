// Horarios del calendario de disponibilidad. Los resultados vacíos son SIEMPRE la misma referencia:
// un arreglo nuevo en cada render hacía que los efectos que dependen de él se re-ejecutaran sin fin.
export const SIN_BLOQUES = Object.freeze([]);

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function claveFecha(valor) {
  return String(valor || "").trim().slice(0, 10);
}

/** Bloques por fecha exacta y, si no hay, los recurrentes del día de la semana. */
export function indexarDisponibilidad(disponibilidad) {
  const porFecha = {};
  const recurrentePorDia = {};
  (Array.isArray(disponibilidad) ? disponibilidad : []).forEach((bloque) => {
    const fecha = claveFecha(bloque?.fecha);
    const dia = String(bloque?.dia_semana || "").trim().toLowerCase();
    if (fecha) {
      (porFecha[fecha] ||= []).push(bloque);
    } else if (dia) {
      (recurrentePorDia[dia] ||= []).push(bloque);
    }
  });
  return { porFecha, recurrentePorDia };
}

export function bloquesParaFecha(fechaYMD, indiceDiaSemana, porFecha, recurrentePorDia) {
  const exactos = porFecha?.[fechaYMD];
  if (exactos && exactos.length > 0) return exactos;
  const recurrentes = recurrentePorDia?.[DIAS_SEMANA[indiceDiaSemana]];
  return recurrentes && recurrentes.length > 0 ? recurrentes : SIN_BLOQUES;
}
