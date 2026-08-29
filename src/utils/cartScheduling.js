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

export function getNextSuggestedHoraVisible({ horaActual, horaSugerida, stepMinutes = 30 } = {}) {
  const current = normalizeHourHm(horaActual);
  const suggested = normalizeHourHm(horaSugerida);
  const step = Math.max(5, Number(stepMinutes) || 30);

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
  const fecha = normalizeDateYmd(fechaBase || "");
  if (medico <= 0 || !fecha) return null;

  const mins = [];
  for (const item of Array.isArray(cartItems) ? cartItems : []) {
    const slot = extractCartSchedule(item);
    if (!slot) continue;
    if (slot.medicoId !== medico) continue;
    if (slot.fecha !== fecha) continue;
    const m = hmToMinutes(slot.hora);
    if (m !== null) mins.push(m);
  }

  if (mins.length === 0) return null;

  mins.sort((a, b) => a - b);
  const nextMinutes = mins[mins.length - 1] + Math.max(5, Number(stepMinutes) || 30);
  return {
    fecha,
    hora: minutesToHm(nextMinutes),
  };
}
