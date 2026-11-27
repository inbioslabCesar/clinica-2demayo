// Formulario "Generar consulta" de Seguimiento clínico: mismas reglas que valida el servidor (SeguimientoClinico::validarSolicitud).
// El servidor es quien decide; esto evita viajes inútiles y da mensajes inmediatos.

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 255;
export const MODOS = Object.freeze({ CON_COBRO: "con_cobro", SIN_COBRO: "sin_cobro" });

/** Mensaje de error del formulario o "" si está listo para enviar. */
export function validarGeneracion({ fecha, hora, modo, motivo }, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return "Elige la fecha de la consulta";
  if (hoy && fecha < hoy) return "La fecha ya pasó";
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(hora || ""))) return "Elige una hora libre de tu agenda";
  if (modo !== MODOS.CON_COBRO && modo !== MODOS.SIN_COBRO) return "Elige si la consulta es con cobro o sin cobro";
  if (modo === MODOS.SIN_COBRO) {
    const largo = String(motivo || "").trim().replace(/\s+/g, " ").length;
    if (largo < MOTIVO_MIN) return `Indica el motivo de la exoneración (mínimo ${MOTIVO_MIN} caracteres)`;
    if (largo > MOTIVO_MAX) return `El motivo es demasiado largo (máximo ${MOTIVO_MAX} caracteres)`;
  }
  return "";
}

/** Cuerpo de la solicitud; el motivo solo viaja en sin cobro. */
export function cuerpoGeneracion({ pacienteId, fecha, hora, modo, motivo }, clientRequestId) {
  const cuerpo = { paciente_id: pacienteId, fecha, hora, modo, client_request_id: clientRequestId };
  if (modo === MODOS.SIN_COBRO) cuerpo.motivo = String(motivo || "").trim();
  return cuerpo;
}

/** Identificador de intento: se reutiliza en reintentos y dobles clics para que el servidor no duplique la consulta. */
export function nuevoIdSolicitud() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return `seg-${c.randomUUID()}`;
  return `seg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Texto de confirmación para el médico tras generar. */
export function mensajeResultado(r) {
  if (!r?.consulta_id) return "";
  const cuando = `${String(r.fecha || "").split("-").reverse().join("/")} ${String(r.hora || "").slice(0, 5)}`.trim();
  const base = r.reutilizado ? "Esta consulta ya estaba generada" : "Consulta generada";
  if (r.modo === MODOS.SIN_COBRO) {
    return `${base} para el ${cuando}. Quedó exonerada (sin cobro, sin honorario); recepción la verá con la insignia "exonerada".`;
  }
  return `${base} para el ${cuando}. Quedó pendiente de cobro en Atenciones (cotización #${r.cotizacion_id}); recepción la cobra.`;
}
