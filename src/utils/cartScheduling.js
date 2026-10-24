import { normalizeDateYmd, normalizeHourHm } from "./dateTime";

function extractCartScheduleAny(item) {
  const fecha = normalizeDateYmd(item?.fechaProgramada || item?.fecha_programada || item?.consultaFecha || "");
  const hora = normalizeHourHm(item?.horaProgramada || item?.hora_programada || item?.consultaHora || "");
  if (!fecha || !hora) return null;
  return { fecha, hora };
}

function normalizeServiceType(value) {
  const base = String(value || "").toLowerCase().trim();
  if (base === "rayos x" || base === "rayos_x") return "rayosx";
  if (base === "procedimientos") return "procedimiento";
  if (base === "operaciones") return "operacion";
  return base;
}

export function getNextSuggestedHoraVisible({ horaActual, horaSugerida } = {}) {
  const current = normalizeHourHm(horaActual);
  const suggested = normalizeHourHm(horaSugerida);
  return suggested || current || "";
}

export function suggestNextHorarioFromCart(cartItems) {
  return getReferenceHorarioFromCart(cartItems);
}

export function getReferenceHorarioFromCart(cartItems) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  for (const item of items) {
    const serviceType = normalizeServiceType(item?.serviceType || item?.servicio_tipo || "");
    const tipoConsulta = String(item?.consultaTipoConsulta || "").toLowerCase();
    if (serviceType !== "consulta" || tipoConsulta !== "programada") continue;
    const slot = extractCartScheduleAny(item);
    if (slot) return slot;
  }

  for (const item of items) {
    const slot = extractCartScheduleAny(item);
    if (slot) return slot;
  }

  return null;
}
