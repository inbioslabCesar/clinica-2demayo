function normalizeDateYmd(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeHourHm(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return "";
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

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
