import { getCachedAgendaSlotMinutes } from "../config/config";

const AGENDABLE_SERVICE_TYPES = new Set([
  "consulta",
  "ecografia",
  "rayosx",
  "procedimiento",
  "operacion",
]);

function normalizeServiceType(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "rayos_x" || raw === "rayos x" || raw === "rx") return "rayosx";
  if (raw === "procedimientos") return "procedimiento";
  if (raw === "operaciones") return "operacion";
  return raw;
}

function normalizeDateYmd(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeHourHm(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hmToMinutes(hm) {
  const normalized = normalizeHourHm(hm);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHm(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const QUOTE_CART_STORAGE_KEY = "quote_cart_v1";

function safeParseJson(rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function buildOccupiedAgendaRowsFromCartItems(items) {
  const out = [];
  const seen = new Set();
  const step = resolveAgendaStepMinutes(30);

  for (const item of Array.isArray(items) ? items : []) {
    const medicoId = Number(item?.medicoId || item?.medico_id || item?.consultaMedicoId || 0);
    const fecha = normalizeDateYmd(item?.fechaProgramada || item?.fecha_programada || item?.consultaFecha || "");
    const hora = normalizeHourHm(item?.horaProgramada || item?.hora_programada || item?.consultaHora || "");
    const baseMin = hmToMinutes(hora);
    if (medicoId <= 0 || !fecha || baseMin === null) continue;

    const serviceType = normalizeServiceType(item?.serviceType || item?.servicio_tipo || "");
    const componentes = Array.isArray(item?.componentes) ? item.componentes : [];
    const componentesAgendables = componentes.filter((comp) => {
      const tipoComp = normalizeServiceType(comp?.servicio_tipo || comp?.source_type || comp?.serviceType || "");
      return AGENDABLE_SERVICE_TYPES.has(tipoComp);
    });

    const componentesMismoMedico = componentesAgendables.filter((comp) => {
      const mid = Number(comp?.medico_id || comp?.medicoId || 0);
      return mid === medicoId;
    });

    const listaBase = (serviceType === "paquete" || serviceType === "perfil")
      ? (componentesMismoMedico.length > 0 ? componentesMismoMedico : componentesAgendables)
      : componentesMismoMedico;
    const expectedSlots = Math.max(1, listaBase.length || 1);

    const minutes = new Set([baseMin]);
    for (const comp of listaBase) {
      const fechaComp = normalizeDateYmd(comp?.fecha_programada || comp?.fechaProgramada || fecha);
      if (fechaComp !== fecha) continue;
      const horaComp = normalizeHourHm(comp?.hora_programada || comp?.horaProgramada || "");
      const minComp = hmToMinutes(horaComp);
      if (minComp !== null) minutes.add(minComp);
    }

    if (minutes.size < expectedSlots) {
      for (let i = 0; i < expectedSlots; i += 1) {
        minutes.add(baseMin + (i * step));
      }
    }

    for (const min of minutes) {
      const horaSlot = minutesToHm(min);
      const key = `${medicoId}|${fecha}|${horaSlot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ medicoId, fecha, hora: horaSlot });
    }
  }

  return out;
}

function getCartEntriesFromSessionStorage() {
  if (typeof window === "undefined" || !window?.sessionStorage) return [];
  const raw = window.sessionStorage.getItem(QUOTE_CART_STORAGE_KEY);
  const parsed = safeParseJson(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return buildOccupiedAgendaRowsFromCartItems(items);
}

function isHourOccupiedInCartSession(entry, hourCandidate, requestedDate) {
  const medicoId = Number(entry?.medicoId || 0);
  const fecha = normalizeDateYmd(requestedDate || entry?.fecha || "");
  const hora = normalizeHourHm(hourCandidate || "");
  if (medicoId <= 0 || !fecha || !hora) return false;

  const cartEntries = getCartEntriesFromSessionStorage();
  return cartEntries.some((row) => (
    Number(row?.medicoId || 0) === medicoId
    && String(row?.fecha || "") === fecha
    && String(row?.hora || "") === hora
  ));
}

function resolveAgendaStepMinutes(stepMinutes) {
  const configured = Number(getCachedAgendaSlotMinutes() || 30);
  const requested = Number(stepMinutes || 0);
  const source = Number.isFinite(requested) && requested > 0 && requested !== 30
    ? requested
    : configured;
  return Math.max(5, Math.min(120, Math.round(source)));
}

function hasActiveState(row) {
  const estado = String(row?.estado || "").toLowerCase().trim();
  return estado !== "cancelada" && estado !== "completada";
}

async function fetchHorasOcupadasDelDia({ authFetch, baseUrl, medicoId, fecha, consultaIdExcluir = 0 }) {
  const qsDisp = new URLSearchParams({
    medico_id: String(medicoId),
    fecha,
  });
  if (Number(consultaIdExcluir) > 0) {
    qsDisp.set("consulta_id", String(Number(consultaIdExcluir)));
  }

  try {
    const resDisp = await authFetch(`${baseUrl}api_horarios_disponibles.php?${qsDisp.toString()}`, {
      credentials: "include",
    });
    const dataDisp = await resDisp.json();
    if (dataDisp?.success && Array.isArray(dataDisp?.horarios_ocupados)) {
      return Array.from(new Set(
        dataDisp.horarios_ocupados
          .map((h) => normalizeHourHm(h))
          .filter(Boolean)
      ));
    }
  } catch {
    // Fallback below.
  }

  // Fallback legacy: consultas activas del dia.
  const qs = new URLSearchParams({
    vista: "disponibilidad",
    medico_id: String(medicoId),
    fecha_desde: fecha,
    fecha_hasta: fecha,
    solo_activas: "1",
    no_cache: "1",
  });
  const res = await authFetch(`${baseUrl}api_consultas.php?${qs.toString()}`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!data?.success) {
    return [];
  }

  const rows = Array.isArray(data.consultas) ? data.consultas : [];
  return rows
    .filter((r) => Number(r?.id || 0) !== Number(consultaIdExcluir || 0))
    .filter(hasActiveState)
    .map((r) => normalizeHourHm(r?.hora))
    .filter(Boolean);
}

async function fetchHorariosDisponiblesPorFecha({ authFetch, baseUrl, medicoId, fecha, consultaIdExcluir = 0 }) {
  const qs = new URLSearchParams({
    medico_id: String(medicoId),
    fecha,
  });
  if (Number(consultaIdExcluir) > 0) {
    qs.set("consulta_id", String(Number(consultaIdExcluir)));
  }

  const res = await authFetch(`${baseUrl}api_horarios_disponibles.php?${qs.toString()}`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!data?.success) {
    return [];
  }

  const rows = Array.isArray(data.horarios_disponibles) ? data.horarios_disponibles : [];
  return rows
    .map((r) => normalizeHourHm(r?.hora || r?.hora_db || ""))
    .filter(Boolean);
}

function addDaysYmd(fechaYmd, daysToAdd) {
  const base = new Date(`${String(fechaYmd || "").trim()}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(daysToAdd || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextUnoccupiedMinuteFrom(startMinute, occupiedSet, stepMinutes) {
  const step = Math.max(5, Number(stepMinutes) || 30);
  let minute = Number.isFinite(startMinute) ? startMinute : null;
  if (minute === null) return null;

  for (let guard = 0; guard < 300; guard += 1) {
    if (minute > (23 * 60 + 59)) return null;
    if (!occupiedSet.has(minute)) return minute;
    minute += step;
  }
  return null;
}

async function fetchBloquesDelDia({ authFetch, baseUrl, medicoId, fecha }) {
  const qs = new URLSearchParams({
    medico_id: String(medicoId),
    fecha_desde: fecha,
    fecha_hasta: fecha,
    no_cache: "1",
  });
  const res = await authFetch(`${baseUrl}api_disponibilidad_medicos.php?${qs.toString()}`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!data?.success) {
    return [];
  }

  return Array.isArray(data.disponibilidad) ? data.disponibilidad : [];
}

function buildSlotMinutesFromBloques(bloques) {
  const step = resolveAgendaStepMinutes(30);
  const slots = [];
  for (const bloque of bloques) {
    const start = hmToMinutes(bloque?.hora_inicio);
    const end = hmToMinutes(bloque?.hora_fin);
    if (start === null || end === null || start >= end) continue;
    for (let t = start; t < end; t += step) {
      slots.push(t);
    }
  }
  return slots.sort((a, b) => a - b);
}

function addDaysYmdSafe(fechaYmd, daysToAdd) {
  const base = new Date(`${String(fechaYmd || "").trim()}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(daysToAdd || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function collectOccupiedSlotsFromDetalles(detalles, patientSet, doctorSet, parentFecha = "", parentHora = "") {
  for (const detalle of Array.isArray(detalles) ? detalles : []) {
    if (!detalle || typeof detalle !== "object") continue;
    const tipo = normalizeServiceType(detalle?.servicio_tipo || detalle?.source_type || detalle?.serviceType || "");
    const fecha = normalizeDateYmd(detalle?.fecha_programada || detalle?.fechaProgramada || detalle?.fecha || parentFecha || "");
    const hora = normalizeHourHm(detalle?.hora_programada || detalle?.horaProgramada || detalle?.hora || parentHora || "");
    const medicoId = Number(detalle?.medico_id || detalle?.medicoId || detalle?.consultaMedicoId || 0);

    if (AGENDABLE_SERVICE_TYPES.has(tipo) && fecha && hora) {
      patientSet.add(`${fecha}|${hora}`);
      if (medicoId > 0) {
        doctorSet.add(`${medicoId}|${fecha}|${hora}`);
      }
    }

    const componentes = Array.isArray(detalle?.componentes) ? detalle.componentes : [];
    if (componentes.length > 0) {
      const componentesAgendables = componentes
        .map((comp) => {
          const tipoComp = normalizeServiceType(comp?.servicio_tipo || comp?.source_type || comp?.serviceType || "");
          if (!AGENDABLE_SERVICE_TYPES.has(tipoComp)) return null;
          const fechaComp = normalizeDateYmd(comp?.fecha_programada || comp?.fechaProgramada || comp?.fecha || fecha || "");
          const horaComp = normalizeHourHm(comp?.hora_programada || comp?.horaProgramada || comp?.hora || hora || "");
          const medicoComp = Number(comp?.medico_id || comp?.medicoId || comp?.consultaMedicoId || 0);
          return { fecha: fechaComp, hora: horaComp, medicoId: medicoComp };
        })
        .filter(Boolean);

      const uniqueSlots = new Set(
        componentesAgendables
          .filter((it) => it.fecha && it.hora)
          .map((it) => `${it.fecha}|${it.hora}`)
      );
      const baseFecha = normalizeDateYmd(fecha || componentesAgendables[0]?.fecha || "");
      const baseHora = normalizeHourHm(hora || componentesAgendables[0]?.hora || "");
      const baseMinute = hmToMinutes(baseHora);

      const needsSequentialInference = componentesAgendables.length > 1
        && uniqueSlots.size <= 1
        && baseFecha
        && baseMinute !== null;

      if (needsSequentialInference) {
        const step = resolveAgendaStepMinutes(30);
        for (let idx = 0; idx < componentesAgendables.length; idx += 1) {
          const comp = componentesAgendables[idx];
          const totalMin = baseMinute + idx * step;
          const dayShift = Math.floor(totalMin / (24 * 60));
          const minuteOfDay = ((totalMin % (24 * 60)) + (24 * 60)) % (24 * 60);
          const fechaSeq = addDaysYmdSafe(baseFecha, dayShift);
          const horaSeq = minutesToHm(minuteOfDay);
          patientSet.add(`${fechaSeq}|${horaSeq}`);
          if (Number(comp?.medicoId || 0) > 0) {
            doctorSet.add(`${Number(comp.medicoId)}|${fechaSeq}|${horaSeq}`);
          }
        }
        continue;
      }

      collectOccupiedSlotsFromDetalles(componentes, patientSet, doctorSet, fecha, hora);
    }
  }
}

function findNextFreePatientSlot({ fechaBase, minuteBase, medicoId, occupiedPatient, occupiedDoctor, stepMinutes = 30 }) {
  let fecha = normalizeDateYmd(fechaBase);
  let minute = Number.isFinite(minuteBase) ? minuteBase : 8 * 60;
  const step = Math.max(5, Number(stepMinutes) || 30);

  for (let guard = 0; guard < 400; guard += 1) {
    if (!fecha) return null;

    if (minute > 23 * 60 + 30) {
      fecha = addDaysYmdSafe(fecha, 1);
      minute = 0;
      continue;
    }

    const hora = minutesToHm(minute);
    const patientBusy = occupiedPatient.has(`${fecha}|${hora}`);
    const doctorBusy = Number(medicoId || 0) > 0
      ? occupiedDoctor.has(`${Number(medicoId || 0)}|${fecha}|${hora}`)
      : false;

    if (!patientBusy && !doctorBusy) {
      return { fecha, hora };
    }

    minute += step;
  }

  return null;
}

async function getAgendaAdvisory({ authFetch, baseUrl, medicoId, fecha, hora, consultaIdExcluir = 0, maxFutureDays = 14 }) {
  const fechaNorm = normalizeDateYmd(fecha);
  const horaNorm = normalizeHourHm(hora);
  if (!fechaNorm || !horaNorm || Number(medicoId) <= 0) {
    return { shouldWarn: false };
  }

  const horasOcupadas = await fetchHorasOcupadasDelDia({
    authFetch,
    baseUrl,
    medicoId: Number(medicoId),
    fecha: fechaNorm,
    consultaIdExcluir: Number(consultaIdExcluir || 0),
  });

  const requestedMin = hmToMinutes(horaNorm);
  const step = resolveAgendaStepMinutes(30);
  const scheduledMinutes = horasOcupadas
    .map((h) => hmToMinutes(h))
    .filter((m) => m !== null)
    .sort((a, b) => a - b);

  const bloques = await fetchBloquesDelDia({
    authFetch,
    baseUrl,
    medicoId: Number(medicoId),
    fecha: fechaNorm,
  });
  const blockSlots = buildSlotMinutesFromBloques(bloques);
  const minRegularMinute = blockSlots.length > 0 ? Math.min(...blockSlots) : null;
  const maxRegularMinute = blockSlots.length > 0 ? Math.max(...blockSlots) : null;
  const hasRegularSchedule = blockSlots.length > 0;
  const hasNoRegularSchedule = !hasRegularSchedule;
  const isOutsideRegular = hasRegularSchedule
    ? !blockSlots.includes(requestedMin)
    : true;

  const hasExact = scheduledMinutes.includes(requestedMin);
  if (!hasExact && !isOutsideRegular) {
    return { shouldWarn: false };
  }

  // Posicion estimada del nuevo evento si se mantiene la hora solicitada.
  // Se calcula por orden cronologico del dia para anticipar impacto en cola.
  const estimatedConsecutivoRequested = scheduledMinutes.filter((m) => m <= requestedMin).length + 1;
  const pendientesAfectados = scheduledMinutes.filter((m) => m > requestedMin).length;

  const occupied = new Set(scheduledMinutes);
  let selectableLaterMinutes = [];
  let availableMinutes = [];
  if (blockSlots.length > 0) {
    selectableLaterMinutes = blockSlots.filter((slot) => slot > requestedMin && !occupied.has(slot));
  }
  if (selectableLaterMinutes.length === 0) {
    const availableHours = await fetchHorariosDisponiblesPorFecha({
      authFetch,
      baseUrl,
      medicoId: Number(medicoId),
      fecha: fechaNorm,
      consultaIdExcluir: Number(consultaIdExcluir || 0),
    });
    availableMinutes = availableHours
      .map((h) => hmToMinutes(h))
      .filter((m) => m !== null)
      .sort((a, b) => a - b);
    selectableLaterMinutes = availableMinutes.filter((m) => m > requestedMin && !occupied.has(m));
  }
  let additionalCandidateMinute = null;
  if (maxRegularMinute !== null) {
    const primerAdicionalRegular = maxRegularMinute + step;
    const inicioBusqueda = isOutsideRegular && requestedMin > maxRegularMinute
      ? requestedMin
      : primerAdicionalRegular;
    additionalCandidateMinute = nextUnoccupiedMinuteFrom(inicioBusqueda, occupied, step);
  } else if (hasNoRegularSchedule) {
    additionalCandidateMinute = nextUnoccupiedMinuteFrom(requestedMin, occupied, step);
  } else if (availableMinutes.length > 0) {
    const ultimoTurnoLibreRegular = Math.max(...availableMinutes);
    additionalCandidateMinute = nextUnoccupiedMinuteFrom(ultimoTurnoLibreRegular + step, occupied, step);
  }
  const allowAdditional = Boolean(
    additionalCandidateMinute !== null
    && (maxRegularMinute === null || additionalCandidateMinute > maxRegularMinute)
    && (minRegularMinute === null || additionalCandidateMinute >= minRegularMinute)
  );

  const nextAvailableDates = [];
  const nextAvailableOptions = [];
  if (selectableLaterMinutes.length === 0) {
    for (let offset = 1; offset <= Math.max(1, Number(maxFutureDays) || 14); offset += 1) {
      const fechaEvaluada = addDaysYmd(fechaNorm, offset);
      if (!fechaEvaluada) continue;
      try {
        const horariosFuturos = await fetchHorariosDisponiblesPorFecha({
          authFetch,
          baseUrl,
          medicoId: Number(medicoId),
          fecha: fechaEvaluada,
          consultaIdExcluir: Number(consultaIdExcluir || 0),
        });
        if (horariosFuturos.length > 0) {
          const primeraHora = normalizeHourHm(horariosFuturos[0] || "");
          nextAvailableDates.push(fechaEvaluada);
          nextAvailableOptions.push({ fecha: fechaEvaluada, hora: primeraHora });
        }
      } catch {
        // Si un dia falla, seguimos con los siguientes.
      }
      if (nextAvailableDates.length >= 3) break;
    }
  }
  const selectableLaterHours = Array.from(new Set(selectableLaterMinutes.map((m) => minutesToHm(m)).filter(Boolean))).slice(0, 8);
  const suggestedMinute = selectableLaterMinutes[0] ?? null;

  return {
    shouldWarn: true,
    warningType: isOutsideRegular ? "outside_regular" : "occupied",
    noRegularSchedule: hasNoRegularSchedule,
    requestedDate: fechaNorm,
    hasExact,
    hasLater: scheduledMinutes.some((m) => m > requestedMin),
    requestedHour: horaNorm,
    suggestedHour: suggestedMinute === null ? "" : minutesToHm(suggestedMinute),
    totalPendientesDia: scheduledMinutes.length,
    estimatedConsecutivoRequested,
    estimatedConsecutivoSuggested: scheduledMinutes.length + 1,
    pendientesAfectados,
    selectableLaterHours,
    additionalCandidateHour: additionalCandidateMinute === null ? "" : minutesToHm(additionalCandidateMinute),
    allowAdditional,
    nextAvailableDates,
    nextAvailableOptions,
  };
}

function collectFromDetail(detalle, acc, parentFecha = "", parentHora = "") {
  const tipo = normalizeServiceType(detalle?.servicio_tipo || detalle?.source_type || detalle?.serviceType || "");
  const medicoId = Number(detalle?.medico_id || detalle?.medicoId || 0);
  const fecha = normalizeDateYmd(detalle?.fecha_programada || detalle?.fechaProgramada || detalle?.fecha || parentFecha || "");
  const hora = normalizeHourHm(detalle?.hora_programada || detalle?.horaProgramada || detalle?.hora || parentHora || "");

  if (AGENDABLE_SERVICE_TYPES.has(tipo) && medicoId > 0 && fecha && hora) {
    acc.push({
      tipo,
      medicoId,
      fecha,
      hora,
    });
  }

  const componentes = Array.isArray(detalle?.componentes) ? detalle.componentes : [];
  for (const comp of componentes) {
    collectFromDetail(comp, acc, fecha, hora);
  }
}

export function buildAgendaGuardEntriesFromDetalles(detalles) {
  const acc = [];
  for (const detalle of Array.isArray(detalles) ? detalles : []) {
    collectFromDetail(detalle, acc);
  }

  const seen = new Set();
  const out = [];
  for (const row of acc) {
    const key = `${row.medicoId}|${row.fecha}|${row.hora}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function secuenciarDetallesPacienteSinCruce({
  detalles,
  cartItems,
  fallbackFecha = "",
  fallbackHora = "",
  stepMinutes = 30,
}) {
  const baseDetalles = Array.isArray(detalles) ? detalles : [];
  if (baseDetalles.length === 0) return [];

  const out = baseDetalles.map((d) => ({ ...d }));
  const occupiedPatient = new Set();
  const occupiedDoctor = new Set();
  collectOccupiedSlotsFromDetalles(cartItems, occupiedPatient, occupiedDoctor);

  const resolverReferenciaProgramacionCarrito = (items) => {
    const lista = Array.isArray(items) ? items : [];
    const extraerSlot = (it) => ({
      fecha: normalizeDateYmd(it?.fechaProgramada || it?.fecha_programada || it?.consultaFecha || ""),
      hora: normalizeHourHm(it?.horaProgramada || it?.hora_programada || it?.consultaHora || ""),
    });

    for (const it of lista) {
      const tipo = normalizeServiceType(it?.serviceType || it?.servicio_tipo || "");
      if (tipo !== "consulta") continue;
      const slot = extraerSlot(it);
      if (slot.fecha && slot.hora) return slot;
    }
    for (const it of lista) {
      const slot = extraerSlot(it);
      if (slot.fecha && slot.hora) return slot;
    }
    return { fecha: "", hora: "" };
  };

  const slotReferencia = resolverReferenciaProgramacionCarrito(cartItems);
  const fallbackFechaNorm = normalizeDateYmd(fallbackFecha);
  const fallbackHoraNorm = normalizeHourHm(fallbackHora);

  for (let i = 0; i < out.length; i += 1) {
    const row = out[i];
    const tipo = normalizeServiceType(row?.servicio_tipo || row?.source_type || row?.serviceType || "");
    if (!AGENDABLE_SERVICE_TYPES.has(tipo)) continue;

    const rowFecha = normalizeDateYmd(row?.fecha_programada || row?.fechaProgramada || row?.fecha || "");
    const rowHora = normalizeHourHm(row?.hora_programada || row?.horaProgramada || row?.hora || "");
    const coincideFallback = rowFecha && rowHora && rowFecha === fallbackFechaNorm && rowHora === fallbackHoraNorm;
    const sinProgramacionPropia = !rowFecha && !rowHora;
    const usarReferenciaCarrito = Boolean(slotReferencia.fecha && slotReferencia.hora) && (coincideFallback || sinProgramacionPropia);

    const fechaBase = usarReferenciaCarrito
      ? slotReferencia.fecha
      : normalizeDateYmd(rowFecha || fallbackFechaNorm || "");
    const horaBase = usarReferenciaCarrito
      ? slotReferencia.hora
      : normalizeHourHm(rowHora || fallbackHoraNorm || "");
    const minuteBase = hmToMinutes(horaBase);
    if (!fechaBase) continue;

    const medicoId = Number(row?.medico_id || row?.medicoId || row?.consultaMedicoId || 0);
    const slot = findNextFreePatientSlot({
      fechaBase,
      minuteBase: minuteBase === null ? 8 * 60 : minuteBase,
      medicoId,
      occupiedPatient,
      occupiedDoctor,
      stepMinutes: resolveAgendaStepMinutes(stepMinutes),
    });
    if (!slot) continue;

    out[i] = {
      ...row,
      fecha_programada: slot.fecha,
      hora_programada: slot.hora,
    };
    occupiedPatient.add(`${slot.fecha}|${slot.hora}`);
    if (medicoId > 0) {
      occupiedDoctor.add(`${medicoId}|${slot.fecha}|${slot.hora}`);
    }
  }

  return out;
}

export function detectarCruceConCarrito({ cartItems, nuevosDetalles }) {
  const existentes = buildAgendaGuardEntriesFromDetalles(Array.isArray(cartItems) ? cartItems : []);
  const nuevos = buildAgendaGuardEntriesFromDetalles(Array.isArray(nuevosDetalles) ? nuevosDetalles : []);
  if (existentes.length === 0 || nuevos.length === 0) {
    return null;
  }

  const existentesMap = new Map();
  for (const row of existentes) {
    const key = `${Number(row.medicoId || 0)}|${String(row.fecha || "")}|${String(row.hora || "")}`;
    if (!key.startsWith("0|")) {
      existentesMap.set(key, row);
    }
  }

  for (const row of nuevos) {
    const key = `${Number(row.medicoId || 0)}|${String(row.fecha || "")}|${String(row.hora || "")}`;
    if (existentesMap.has(key)) {
      return {
        key,
        existente: existentesMap.get(key),
        nuevo: row,
      };
    }
  }

  return null;
}

async function resolverCruceConUsuario({
  Swal,
  advisory,
  entry,
  onApplySuggestion,
  isHourBlocked,
  useCartSessionFilter = true,
  outsideRegularPrompt = null,
}) {
  const requestedDate = advisory?.requestedDate || entry?.fecha || "";
  const requestedHour = advisory?.requestedHour || entry?.hora || "";
  const ocupadoCarritoSesion = useCartSessionFilter
    ? isHourOccupiedInCartSession(entry, requestedHour, requestedDate)
    : false;
  const ocupadoBloqueCustom = typeof isHourBlocked === "function"
    ? Boolean(isHourBlocked(entry, requestedHour, requestedDate))
    : false;
  const stepMinutes = resolveAgendaStepMinutes(30);

  const resolverHoraAdicionalSinCruce = (horaBase) => {
    const start = normalizeHourHm(horaBase || "");
    if (!start) return "";
    const startMin = hmToMinutes(start);
    if (startMin === null) return "";
    let minute = startMin;
    for (let guard = 0; guard < 120; guard += 1) {
      const candidata = minutesToHm(minute);
      const cruzaCarrito = useCartSessionFilter
        ? isHourOccupiedInCartSession(entry, candidata, requestedDate)
        : false;
      const cruzaCustom = typeof isHourBlocked === "function"
        ? Boolean(isHourBlocked(entry, candidata, requestedDate))
        : false;
      if (!cruzaCarrito && !cruzaCustom) {
        return candidata;
      }
      minute += stepMinutes;
      if (minute > (23 * 60 + 59)) break;
    }
    return "";
  };

  if (String(advisory?.warningType || "") === "outside_regular") {
    const horaAdicional = resolverHoraAdicionalSinCruce(advisory?.additionalCandidateHour || "");
    const permitirAdicional = Boolean(advisory?.allowAdditional) && Boolean(horaAdicional);
    const reusedApproval = Boolean(outsideRegularPrompt?.reuseApprovedAdditional) && permitirAdicional;
    const sinHorarioRegular = Boolean(advisory?.noRegularSchedule);

    if (reusedApproval) {
      if (typeof onApplySuggestion === "function") {
        await onApplySuggestion(entry, horaAdicional, advisory.requestedDate, {
          isAdicional: true,
          reason: "outside_regular_group_reuse",
        });
      }
      return { ok: true, horaAplicada: horaAdicional, esAdicional: true };
    }

    const groupCount = Number(outsideRegularPrompt?.groupCount || 1);
    const groupHint = groupCount > 1
      ? ` Este ajuste aplica para ${groupCount} servicio(s) con el mismo horario.`
      : "";

    const confirmOutside = await Swal.fire({
      icon: "question",
      title: "Fuera de horario regular",
      text: permitirAdicional
        ? (sinHorarioRegular
          ? `El médico no tiene horario regular configurado para ${advisory?.requestedDate || requestedDate}. Si el médico autoriza, puedes registrarlo como adicional a las ${horaAdicional}.${groupHint}`
          : `La hora ${advisory?.requestedHour || requestedHour} está fuera del horario regular del médico para ${advisory?.requestedDate || requestedDate}. Si el médico autoriza, puedes registrarlo como adicional a las ${horaAdicional}.${groupHint}`)
        : (sinHorarioRegular
          ? `El médico no tiene horario regular configurado para ${advisory?.requestedDate || requestedDate}.`
          : `La hora ${advisory?.requestedHour || requestedHour} está fuera del horario regular del médico para ${advisory?.requestedDate || requestedDate}.`),
      showCancelButton: true,
      showDenyButton: true,
      showConfirmButton: permitirAdicional,
      confirmButtonText: "Sí, programar adicional",
      denyButtonText: "No puede, ver sugerencias",
      cancelButtonText: "Cancelar",
      allowOutsideClick: false,
      reverseButtons: true,
    });

    if (confirmOutside.isConfirmed && permitirAdicional) {
      if (typeof onApplySuggestion === "function") {
        await onApplySuggestion(entry, horaAdicional, advisory.requestedDate, {
          isAdicional: true,
          reason: "outside_regular",
        });
      }
      return { ok: true, horaAplicada: horaAdicional, esAdicional: true };
    }
    if (!confirmOutside.isDenied) {
      return { ok: false, code: "user_cancelled" };
    }

    const sugerenciasRegulares = Array.isArray(advisory?.selectableLaterHours) ? advisory.selectableLaterHours : [];
    const sugerenciasFechas = Array.isArray(advisory?.nextAvailableOptions) ? advisory.nextAvailableOptions : [];
    const textoRegulares = sugerenciasRegulares.length > 0
      ? ` Turnos regulares sugeridos del día: ${sugerenciasRegulares.join(", ")}.`
      : "";
    const textoFechas = sugerenciasFechas.length > 0
      ? ` Próximos turnos sugeridos: ${sugerenciasFechas
        .map((s) => `${String(s?.fecha || "").trim()}${String(s?.hora || "").trim() ? ` ${String(s.hora).slice(0, 5)}` : ""}`)
        .join(", ")}.`
      : "";
    await Swal.fire({
      icon: "warning",
      title: "Sin horario regular válido",
      text: `No se programó como adicional.${textoRegulares}${textoFechas} Elige otra hora o fecha.`,
    });
    return { ok: false, code: "outside_regular_without_authorization" };
  }

  const opciones = Array.isArray(advisory?.selectableLaterHours) ? advisory.selectableLaterHours : [];
  const horasUnicas = Array.from(new Set(
    opciones
      .map((h) => normalizeHourHm(h))
      .filter(Boolean)
      .filter((h) => {
        if (useCartSessionFilter && isHourOccupiedInCartSession(entry, h, advisory?.requestedDate)) return false;
        if (typeof isHourBlocked !== "function") return true;
        return !isHourBlocked(entry, h, advisory?.requestedDate);
      })
  ));

  if (horasUnicas.length === 0) {
    const horaAdicional = resolverHoraAdicionalSinCruce(advisory?.additionalCandidateHour || "");
    const decisionAdicional = await Swal.fire({
      icon: "question",
      title: "Sin turnos regulares libres",
      text: horaAdicional
        ? `No hay turnos libres del médico después de ${advisory?.requestedHour || requestedHour} para ${advisory?.requestedDate || requestedDate}. Si el médico autoriza, puedes registrarlo como adicional a las ${horaAdicional}.`
        : `No hay turnos libres del médico después de ${advisory?.requestedHour || requestedHour} para ${advisory?.requestedDate || requestedDate}.`,
      showCancelButton: true,
      showDenyButton: true,
      showConfirmButton: Boolean(horaAdicional),
      confirmButtonText: "Sí, programar adicional",
      denyButtonText: "No puede, ver sugerencias",
      cancelButtonText: "Cancelar",
      allowOutsideClick: false,
      reverseButtons: true,
    });

    if (decisionAdicional.isConfirmed && horaAdicional) {
      if (typeof onApplySuggestion === "function") {
        await onApplySuggestion(entry, horaAdicional, advisory.requestedDate, {
          isAdicional: true,
          reason: "sin_turno_regular_libre",
        });
      }
      return { ok: true, horaAplicada: horaAdicional, esAdicional: true };
    }
    if (!decisionAdicional.isDenied) {
      return { ok: false, code: "user_cancelled" };
    }

    const sugerencias = Array.isArray(advisory?.nextAvailableOptions) ? advisory.nextAvailableOptions : [];
    const textoSugerencias = sugerencias.length > 0
      ? ` Próximos turnos sugeridos: ${sugerencias
        .map((s) => `${String(s?.fecha || "").trim()}${String(s?.hora || "").trim() ? ` ${String(s.hora).slice(0, 5)}` : ""}`)
        .join(", ")}.`
      : "";
    await Swal.fire({
      icon: "warning",
      title: "Sin horarios disponibles",
      text: `No se programó como adicional.${textoSugerencias} Elige otra fecha u hora manual distinta.`,
    });
    return { ok: false, code: "no_available_suggested_hours" };
  }

  const horaSugerida = advisory?.suggestedHour || horasUnicas[0] || "";
  const inputOptions = {};
  for (const hora of horasUnicas) {
    inputOptions[hora] = hora;
  }

  const motivos = ["agenda del medico"];
  if (ocupadoCarritoSesion) {
    motivos.push("carrito de esta sesión");
  }
  if (ocupadoBloqueCustom) {
    motivos.push("bloques reservados del flujo actual");
  }
  const motivoTexto = motivos.join(" + ");

  const resultado = await Swal.fire({
    icon: "warning",
    title: "Horario ocupado",
    html: `La hora solicitada <b>${advisory.requestedHour}</b> para el ${advisory.requestedDate} ya cruza con: <b>${motivoTexto}</b>.<br/><br/>Selecciona una hora libre sugerida para continuar con la cotizacion.`,
    input: "select",
    inputOptions,
    inputValue: horaSugerida || undefined,
    inputPlaceholder: "Selecciona una hora libre",
    showCancelButton: true,
    confirmButtonText: "Aplicar hora sugerida",
    cancelButtonText: "Cancelar cotizacion",
    allowOutsideClick: false,
    allowEscapeKey: true,
    reverseButtons: true,
  });

  if (!resultado.isConfirmed) {
    return { ok: false, code: "user_cancelled" };
  }

  const selectedHour = normalizeHourHm(resultado.value || horaSugerida);
  if (!selectedHour) {
    await Swal.fire({
      icon: "error",
      title: "No se pudo aplicar la hora",
      text: "Selecciona una hora valida para continuar.",
    });
    return { ok: false, code: "invalid_selected_hour" };
  }

  if (typeof onApplySuggestion === "function") {
    await onApplySuggestion(entry, selectedHour, advisory.requestedDate, {
      isAdicional: false,
      reason: "hora_sugerida_regular",
    });
  }

  return { ok: true, horaAplicada: selectedHour };
}

function buildOutsideRegularDecisionKey(entry, advisory) {
  const medicoId = Number(entry?.medicoId || 0);
  const fecha = normalizeDateYmd(advisory?.requestedDate || entry?.fecha || "");
  if (medicoId <= 0 || !fecha) return "";
  return `${medicoId}|${fecha}`;
}

function countOutsideRegularGroup(rows, startIndex, entry, advisory) {
  const medicoId = Number(entry?.medicoId || 0);
  const fecha = normalizeDateYmd(advisory?.requestedDate || entry?.fecha || "");
  if (medicoId <= 0 || !fecha) return 1;

  let total = 0;
  for (let i = Number(startIndex) || 0; i < (Array.isArray(rows) ? rows.length : 0); i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (Number(row?.medicoId || 0) !== medicoId) continue;
    if (normalizeDateYmd(row?.fecha || "") !== fecha) continue;
    total += 1;
  }
  return Math.max(1, total);
}

export async function validarAgendaAntesDeCotizar({
  authFetch,
  baseUrl,
  Swal,
  entries,
  onApplySuggestion,
  isHourBlocked,
  useCartSessionFilter = true,
  maxFutureDays = 14,
}) {
  void maxFutureDays;

  const rows = Array.isArray(entries) ? entries : [];
  if (rows.length === 0) {
    return { ok: true };
  }

  // Regla operativa: la validación de agenda en cotización es obligatoria
  // en cualquier vía (cotizadores por servicio, carrito global y cotizador express).
  // No debe depender de una bandera en BD para evitar desalineaciones entre entornos.

  if (!Swal) {
    console.warn("Agenda inteligente activa, pero no se recibio instancia de Swal.");
    return { ok: true };
  }

  const outsideRegularApproved = new Set();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const entry = rows[rowIndex];
    if (Number(entry?.medicoId || 0) <= 0 || !entry?.fecha || !entry?.hora) {
      continue;
    }

    let intentos = 0;
    while (intentos < 3) {
      intentos += 1;

      const advisory = await getAgendaAdvisory({
        authFetch,
        baseUrl,
        medicoId: Number(entry.medicoId),
        fecha: entry.fecha,
        hora: entry.hora,
        maxFutureDays,
      });

      if (!advisory?.shouldWarn) {
        break;
      }

      const isOutsideRegular = String(advisory?.warningType || "") === "outside_regular";
      const outsideKey = isOutsideRegular ? buildOutsideRegularDecisionKey(entry, advisory) : "";
      const alreadyApproved = Boolean(outsideKey) && outsideRegularApproved.has(outsideKey);
      const outsideRegularPrompt = isOutsideRegular
        ? {
          groupCount: countOutsideRegularGroup(rows, rowIndex, entry, advisory),
          reuseApprovedAdditional: alreadyApproved,
        }
        : null;

      const resolucion = await resolverCruceConUsuario({
        Swal,
        advisory,
        entry,
        onApplySuggestion,
        isHourBlocked,
        useCartSessionFilter,
        outsideRegularPrompt,
      });

      if (!resolucion.ok) {
        return resolucion;
      }

      entry.hora = resolucion.horaAplicada;
      if (isOutsideRegular && resolucion.esAdicional && outsideKey) {
        outsideRegularApproved.add(outsideKey);
      }
      if (resolucion.esAdicional) {
        break;
      }
    }
  }

  return { ok: true };
}
