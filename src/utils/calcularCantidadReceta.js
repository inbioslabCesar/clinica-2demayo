export function calcularCantidadTotalReceta(medicamento) {
  // Si ya tiene cantidad_total calculada, usarla
  if (medicamento.cantidad_total) {
    return medicamento.cantidad_total;
  }

  // Si no tiene datos para calcular, retornar null
  if (!medicamento.frecuencia_tipo || !medicamento.duracion_valor) {
    return null;
  }

  // Si es según necesidad, no calcular
  if (medicamento.frecuencia_tipo === "segun_necesidad") {
    return null;
  }

  // Calcular dosis por día
  let dosisPorDia = 0;
  if (medicamento.frecuencia_tipo === "intervalo_horas" && medicamento.frecuencia_valor) {
    dosisPorDia = 24 / medicamento.frecuencia_valor;
  } else if (medicamento.frecuencia_tipo === "veces_dia" && medicamento.frecuencia_valor) {
    dosisPorDia = medicamento.frecuencia_valor;
  } else if (medicamento.frecuencia_tipo === "horarios_fijos" && Array.isArray(medicamento.frecuencia_horas) && medicamento.frecuencia_horas.length > 0) {
    dosisPorDia = medicamento.frecuencia_horas.length;
  }

  if (dosisPorDia <= 0) return null;

  // Calcular días totales
  let diasTotales = medicamento.duracion_valor || 0;
  if (medicamento.duracion_unidad === "semanas") {
    diasTotales = (medicamento.duracion_valor || 0) * 7;
  }

  if (diasTotales <= 0) return null;

  return Math.round(dosisPorDia * diasTotales);
}
