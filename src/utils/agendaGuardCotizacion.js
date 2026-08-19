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

function hasActiveState(row) {
  const estado = String(row?.estado || "").toLowerCase().trim();
  return estado !== "cancelada" && estado !== "completada";
}

async function fetchConsultasDelDia({ authFetch, baseUrl, medicoId, fecha }) {
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
    .filter(hasActiveState)
    .map((r) => normalizeHourHm(r?.hora))
    .filter(Boolean);
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
  const slots = [];
  for (const bloque of bloques) {
    const start = hmToMinutes(bloque?.hora_inicio);
    const end = hmToMinutes(bloque?.hora_fin);
    if (start === null || end === null || start >= end) continue;
    for (let t = start; t < end; t += 30) {
      slots.push(t);
    }
  }
  return slots.sort((a, b) => a - b);
}

async function getAgendaAdvisory({ authFetch, baseUrl, medicoId, fecha, hora }) {
  const fechaNorm = normalizeDateYmd(fecha);
  const horaNorm = normalizeHourHm(hora);
  if (!fechaNorm || !horaNorm || Number(medicoId) <= 0) {
    return { shouldWarn: false };
  }

  const horasConsultas = await fetchConsultasDelDia({
    authFetch,
    baseUrl,
    medicoId: Number(medicoId),
    fecha: fechaNorm,
  });

  if (horasConsultas.length === 0) {
    return { shouldWarn: false };
  }

  const requestedMin = hmToMinutes(horaNorm);
  const scheduledMinutes = horasConsultas
    .map((h) => hmToMinutes(h))
    .filter((m) => m !== null)
    .sort((a, b) => a - b);

  const hasExact = scheduledMinutes.includes(requestedMin);
  const hasLater = scheduledMinutes.some((m) => m > requestedMin);
  if (!hasExact && !hasLater) {
    return { shouldWarn: false };
  }

  // Posicion estimada del nuevo evento si se mantiene la hora solicitada.
  // Se calcula por orden cronologico del dia para anticipar impacto en cola.
  const estimatedConsecutivoRequested = scheduledMinutes.filter((m) => m <= requestedMin).length + 1;
  const pendientesAfectados = scheduledMinutes.filter((m) => m > requestedMin).length;

  const lastMinute = scheduledMinutes[scheduledMinutes.length - 1];
  let suggestedMinute = lastMinute + 30;

  const bloques = await fetchBloquesDelDia({
    authFetch,
    baseUrl,
    medicoId: Number(medicoId),
    fecha: fechaNorm,
  });

  const blockSlots = buildSlotMinutesFromBloques(bloques);
  if (blockSlots.length > 0) {
    const occupied = new Set(scheduledMinutes);
    const freeAfterTail = blockSlots.find((slot) => slot > lastMinute && !occupied.has(slot));
    if (typeof freeAfterTail === "number") {
      suggestedMinute = freeAfterTail;
    }
  }

  return {
    shouldWarn: true,
    hasExact,
    hasLater,
    requestedHour: horaNorm,
    suggestedHour: minutesToHm(suggestedMinute),
    totalPendientesDia: scheduledMinutes.length,
    estimatedConsecutivoRequested,
    estimatedConsecutivoSuggested: scheduledMinutes.length + 1,
    pendientesAfectados,
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

export async function validarAgendaAntesDeCotizar({
  authFetch,
  baseUrl,
  Swal,
  entries,
  onApplySuggestion,
}) {
  const lista = Array.isArray(entries) ? entries : [];
  for (const entry of lista) {
    const advisory = await getAgendaAdvisory({
      authFetch,
      baseUrl,
      medicoId: Number(entry?.medicoId || 0),
      fecha: entry?.fecha,
      hora: entry?.hora,
    });

    if (!advisory?.shouldWarn) {
      continue;
    }

    const texto = advisory.hasExact
      ? `El medico ya tiene una atencion en ${advisory.requestedHour}.\nPendientes del dia: ${advisory.totalPendientesDia}.\nConsecutivo estimado si registras ahora: N° ${advisory.estimatedConsecutivoRequested}.\nPendientes que podrian reordenarse: ${advisory.pendientesAfectados}.\nHora sugerida para no afectar el orden: ${advisory.suggestedHour} (N° ${advisory.estimatedConsecutivoSuggested}).`
      : `El medico ya tiene pacientes asignados despues de ${advisory.requestedHour}.\nPendientes del dia: ${advisory.totalPendientesDia}.\nConsecutivo estimado si registras ahora: N° ${advisory.estimatedConsecutivoRequested}.\nPendientes que podrian reordenarse: ${advisory.pendientesAfectados}.\nHora sugerida para no afectar el orden: ${advisory.suggestedHour} (N° ${advisory.estimatedConsecutivoSuggested}).`;

    const result = await Swal.fire({
      icon: "warning",
      title: "Agenda del medico con conflicto",
      text: texto,
      showCancelButton: true,
      showDenyButton: Boolean(advisory.suggestedHour),
      confirmButtonText: "Continuar con esta hora",
      denyButtonText: advisory.suggestedHour ? `Usar ${advisory.suggestedHour}` : "Aplicar sugerencia",
      cancelButtonText: "Cancelar",
    });

    if (result?.isDenied && advisory.suggestedHour) {
      if (typeof onApplySuggestion === "function") {
        onApplySuggestion(entry, advisory.suggestedHour);
      }
      continue;
    }

    if (!result?.isConfirmed) {
      return { ok: false, cancelled: true };
    }
  }

  return { ok: true };
}
