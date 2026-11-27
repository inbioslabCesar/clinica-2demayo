const ID_NUMERICO = (v) => Number(v || 0);

const TEMPORAL_POR_DEFECTO = { nombre: "Particular", apellido: "", dni: "" };

/**
 * Destino del botón «Volver» de los módulos de servicio (laboratorio, farmacia, rayos X, ecografía,
 * procedimientos, operaciones, paquetes y perfiles). Una sola regla para todos:
 *  - cotización en edición  -> vuelve a servicios conservando cotización y modo (origen: Atenciones)
 *  - cobro en edición       -> vuelve al consumo del paciente
 *  - cotización nueva       -> vuelve al selector de servicios con el paciente (o el particular)
 */
export function destinoVolverServicio({ pacienteId, pacienteTemporal, cotizacionId, cobroId, modo } = {}) {
  const pid = ID_NUMERICO(pacienteId);
  const cotId = ID_NUMERICO(cotizacionId);
  const cobId = ID_NUMERICO(cobroId);

  if (cotId > 0 && cobId <= 0) {
    const modoNorm = String(modo || "editar").toLowerCase() === "adenda" ? "adenda" : "editar";
    return {
      etiqueta: "Volver a Servicios",
      ariaLabel: "Volver al selector de servicios",
      to: `/seleccionar-servicio?paciente_id=${pid}&cotizacion_id=${cotId}&modo=${modoNorm}&back_to=/cotizaciones`,
      options: { state: { pacienteId: pid, cotizacionId: cotId, backTo: "/cotizaciones", modo: modoNorm } },
    };
  }

  if (cobId > 0 || cotId > 0) {
    return {
      etiqueta: "Volver a Consumo del paciente",
      ariaLabel: "Volver al consumo del paciente",
      to: pid > 0 ? `/consumo-paciente/${pid}${cobId > 0 ? `?cobro_id=${cobId}` : ""}` : "/pacientes",
      options: undefined,
    };
  }

  return {
    etiqueta: "Volver",
    ariaLabel: "Volver al selector de servicios",
    to: "/seleccionar-servicio",
    options: {
      state: pid <= 0
        ? { pacienteId: 0, pacienteTemporal: pacienteTemporal || TEMPORAL_POR_DEFECTO }
        : { pacienteId: pid, ...(pacienteTemporal ? { pacienteTemporal } : {}) },
    },
  };
}
