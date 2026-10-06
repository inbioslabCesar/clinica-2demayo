import { getCachedAgendaSlotMinutes } from "../config/config";

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

function resolveAgendaStepMinutes(stepMinutes) {
  const configured = Number(getCachedAgendaSlotMinutes() || 30);
  const requested = Number(stepMinutes || 0);
  const source = Number.isFinite(requested) && requested > 0 && requested !== 30
    ? requested
    : configured;
  return Math.max(5, Math.min(120, Math.round(source)));
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

function hmToMinutes(hm) {
  const norm = normalizeHourHm(hm);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHm(total) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Number(total) || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function extractCartSchedule(item) {
  const medicoId = Number(item?.medicoId || item?.medico_id || item?.consultaMedicoId || 0);
  const fecha = normalizeDateYmd(item?.fechaProgramada || item?.fecha_programada || item?.consultaFecha || "");
  const hora = normalizeHourHm(item?.horaProgramada || item?.hora_programada || item?.consultaHora || "");
  if (medicoId <= 0 || !fecha || !hora) return null;
  return { medicoId, fecha, hora };
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

function isAgendableType(value) {
  const t = normalizeServiceType(value);
  return t === "consulta" || t === "ecografia" || t === "rayosx" || t === "procedimiento" || t === "operacion";
}

function expandCartSchedules(item, stepMinutes = 30) {
  const slot = extractCartSchedule(item);
  if (!slot) return [];

  const step = resolveAgendaStepMinutes(stepMinutes);
  const baseMinute = hmToMinutes(slot.hora);
  if (baseMinute === null) return [slot];

  const serviceType = normalizeServiceType(item?.serviceType || item?.servicio_tipo || "");
  const componentes = Array.isArray(item?.componentes) ? item.componentes : [];
  const componentesAgendables = componentes.filter((comp) => isAgendableType(comp?.servicio_tipo || comp?.source_type || comp?.serviceType || ""));
  const componentesMismoMedico = componentesAgendables.filter((comp) => Number(comp?.medico_id || comp?.medicoId || 0) === slot.medicoId);

  const listaBase = (serviceType === "paquete" || serviceType === "perfil")
    ? (componentesMismoMedico.length > 0 ? componentesMismoMedico : componentesAgendables)
    : componentesMismoMedico;
  const expectedSlots = Math.max(1, listaBase.length || 1);

  const minutes = new Set([baseMinute]);
  for (const comp of listaBase) {
    const fechaComp = normalizeDateYmd(comp?.fecha_programada || comp?.fechaProgramada || slot.fecha);
    if (fechaComp !== slot.fecha) continue;
    const horaComp = normalizeHourHm(comp?.hora_programada || comp?.horaProgramada || "");
    const minComp = hmToMinutes(horaComp);
    if (minComp !== null) minutes.add(minComp);
  }

  if (minutes.size < expectedSlots) {
    for (let i = 0; i < expectedSlots; i += 1) {
      minutes.add(baseMinute + (i * step));
    }
  }

  return Array.from(minutes)
    .sort((a, b) => a - b)
    .map((min) => ({
      medicoId: slot.medicoId,
      fecha: slot.fecha,
      hora: minutesToHm(min),
    }));
}

export function getNextSuggestedHoraVisible({ horaActual, horaSugerida, stepMinutes = 30 } = {}) {
  const current = normalizeHourHm(horaActual);
  const suggested = normalizeHourHm(horaSugerida);
  const step = resolveAgendaStepMinutes(stepMinutes);

  if (!suggested) {
    const base = hmToMinutes(current);
    if (base === null) return "";
    return minutesToHm(base + step);
  }

  if (!current || current !== suggested) return suggested;
  const currentMinutes = hmToMinutes(current);
  if (currentMinutes === null) return suggested;
  return minutesToHm(currentMinutes + step);
}

export function suggestNextHorarioFromCart(cartItems, { medicoId, fechaBase, stepMinutes = 30 } = {}) {
  const medico = Number(medicoId || 0);
  if (medico <= 0) return null;

  const slots = [];
  for (const item of Array.isArray(cartItems) ? cartItems : []) {
    const expandedSlots = expandCartSchedules(item, stepMinutes);
    for (const slot of expandedSlots) {
      if (slot.medicoId !== medico) continue;
      const m = hmToMinutes(slot.hora);
      if (m === null) continue;
      slots.push({ fecha: slot.fecha, minutos: m });
    }
  }

  if (slots.length === 0) return null;

  const fechaSolicitada = normalizeDateYmd(fechaBase || "");
  let fechaObjetivo = fechaSolicitada;

  const slotsFechaSolicitada = fechaSolicitada
    ? slots.filter((it) => it.fecha === fechaSolicitada)
    : [];

  let slotsObjetivo = slotsFechaSolicitada;
  if (slotsObjetivo.length === 0) {
    // Si no hay coincidencia exacta por fecha, usar la última fecha ya programada
    // para ese médico en carrito y proponer el siguiente turno allí.
    const ultimaFecha = slots
      .map((it) => it.fecha)
      .sort((a, b) => a.localeCompare(b))
      .slice(-1)[0];
    fechaObjetivo = ultimaFecha || fechaSolicitada;
    slotsObjetivo = slots.filter((it) => it.fecha === fechaObjetivo);
  }

  if (slotsObjetivo.length === 0 || !fechaObjetivo) return null;

  const mins = slotsObjetivo.map((it) => it.minutos).sort((a, b) => a - b);
  const nextMinutes = mins[mins.length - 1] + resolveAgendaStepMinutes(stepMinutes);
  return {
    fecha: fechaObjetivo,
    hora: minutesToHm(nextMinutes),
  };
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
