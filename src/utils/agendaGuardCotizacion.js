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

function buildFallbackLaterSlots(startMinute, take = 8) {
  const out = [];
  const base = Number(startMinute || 0);
  for (let i = 0; i < take; i += 1) {
    out.push(base + i * 30);
  }
  return out;
}

async function getAgendaAdvisory({ authFetch, baseUrl, medicoId, fecha, hora, consultaIdExcluir = 0 }) {
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

  if (horasOcupadas.length === 0) {
    return { shouldWarn: false };
  }

  const requestedMin = hmToMinutes(horaNorm);
  const scheduledMinutes = horasOcupadas
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
  const occupied = new Set(scheduledMinutes);
  if (blockSlots.length > 0) {
    const freeAfterTail = blockSlots.find((slot) => slot > lastMinute && !occupied.has(slot));
    if (typeof freeAfterTail === "number") {
      suggestedMinute = freeAfterTail;
    }
  }

  let selectableLaterMinutes = [];
  if (blockSlots.length > 0) {
    selectableLaterMinutes = blockSlots.filter((slot) => slot >= suggestedMinute && !occupied.has(slot));
  }
  if (selectableLaterMinutes.length === 0) {
    selectableLaterMinutes = buildFallbackLaterSlots(suggestedMinute, 8);
  }
  const selectableLaterHours = Array.from(new Set(selectableLaterMinutes.map((m) => minutesToHm(m)).filter(Boolean))).slice(0, 8);

  return {
    shouldWarn: true,
    requestedDate: fechaNorm,
    hasExact,
    hasLater,
    requestedHour: horaNorm,
    suggestedHour: minutesToHm(suggestedMinute),
    totalPendientesDia: scheduledMinutes.length,
    estimatedConsecutivoRequested,
    estimatedConsecutivoSuggested: scheduledMinutes.length + 1,
    pendientesAfectados,
    selectableLaterHours,
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
  maxFutureDays = 14,
}) {
  const lista = Array.isArray(entries) ? entries : [];
  for (const entry of lista) {
    const advisory = await getAgendaAdvisory({
      authFetch,
      baseUrl,
      medicoId: Number(entry?.medicoId || 0),
      fecha: entry?.fecha,
      hora: entry?.hora,
      consultaIdExcluir: Number(entry?.consultaIdExcluir || 0),
    });

    if (!advisory?.shouldWarn) {
      continue;
    }

    const texto = advisory.hasExact
      ? `El medico ya tiene una atencion en ${advisory.requestedHour}.\nPendientes del dia: ${advisory.totalPendientesDia}.\nConsecutivo estimado si registras ahora: N° ${advisory.estimatedConsecutivoRequested}.\nPendientes que podrian reordenarse: ${advisory.pendientesAfectados}.\nHora sugerida para no afectar el orden: ${advisory.suggestedHour} (N° ${advisory.estimatedConsecutivoSuggested}).`
      : `El medico ya tiene pacientes asignados despues de ${advisory.requestedHour}.\nPendientes del dia: ${advisory.totalPendientesDia}.\nConsecutivo estimado si registras ahora: N° ${advisory.estimatedConsecutivoRequested}.\nPendientes que podrian reordenarse: ${advisory.pendientesAfectados}.\nHora sugerida para no afectar el orden: ${advisory.suggestedHour} (N° ${advisory.estimatedConsecutivoSuggested}).`;
    const opciones = Array.isArray(advisory.selectableLaterHours)
      ? advisory.selectableLaterHours.filter(Boolean)
      : [];

    const opcionesFechaHora = [];
    const fechaBase = String(advisory.requestedDate || entry?.fecha || "").trim();
    for (const horaSugerida of opciones) {
      opcionesFechaHora.push({ fecha: fechaBase, hora: horaSugerida });
    }

    if (fechaBase) {
      const futurosLimite = Math.max(0, Number(maxFutureDays || 0));
      for (let dayOffset = 1; dayOffset <= futurosLimite && opcionesFechaHora.length < 8; dayOffset += 1) {
        const fechaCandidata = addDaysYmd(fechaBase, dayOffset);
        if (!fechaCandidata) continue;

        let horasDisponibles = [];
        try {
          horasDisponibles = await fetchHorariosDisponiblesPorFecha({
            authFetch,
            baseUrl,
            medicoId: Number(entry?.medicoId || 0),
            fecha: fechaCandidata,
            consultaIdExcluir: Number(entry?.consultaIdExcluir || 0),
          });
        } catch {
          horasDisponibles = [];
        }

        const horasRecortadas = Array.from(new Set(horasDisponibles)).slice(0, 2);
        for (const h of horasRecortadas) {
          if (opcionesFechaHora.length >= 8) break;
          opcionesFechaHora.push({ fecha: fechaCandidata, hora: h });
        }
      }
    }

    if (opcionesFechaHora.length > 0) {
      const optionsMap = {};
      opcionesFechaHora.forEach(({ fecha, hora }) => {
        const value = `${fecha}|${hora}`;
        const mismaFecha = fecha === fechaBase;
        optionsMap[value] = mismaFecha ? `Usar ${hora}` : `Usar ${fecha} ${hora}`;
      });

      const sugeridaValue = `${fechaBase}|${advisory.suggestedHour}`;
      const tieneSugerida = Boolean(optionsMap[sugeridaValue]);
      const primerValor = Object.keys(optionsMap)[0] || "";

      const result = await Swal.fire({
        icon: "warning",
        title: "Agenda del medico con conflicto",
        text: `${texto}\nTambien puedes elegir un horario en dias posteriores.`,
        input: "select",
        inputOptions: optionsMap,
        inputValue: tieneSugerida ? sugeridaValue : primerValor,
        inputPlaceholder: "Selecciona un horario sugerido",
        showCancelButton: true,
        confirmButtonText: "Usar hora elegida",
        cancelButtonText: "Cancelar",
        preConfirm: (value) => {
          if (!value) {
            Swal.showValidationMessage("Selecciona una hora para continuar");
            return false;
          }
          return value;
        },
      });

      if (result?.isConfirmed && result?.value) {
        const [fechaElegida = fechaBase, horaElegida = ""] = String(result.value).split("|");
        if (typeof onApplySuggestion === "function") {
          onApplySuggestion(entry, String(horaElegida || ""), String(fechaElegida || fechaBase));
        }
        entry.fecha = String(fechaElegida || fechaBase);
        entry.hora = String(horaElegida || entry?.hora || "");
        continue;
      }

      return { ok: false, cancelled: true };
    }

    const result = await Swal.fire({
      icon: "warning",
      title: "Agenda del medico con conflicto",
      text: advisory.suggestedHour
        ? `${texto}\nDebes usar un horario sugerido para mantener el orden del consecutivo.`
        : `${texto}\nNo hay sugerencias disponibles en este momento. Reprograma a otra fecha u hora.`,
      showCancelButton: true,
      showConfirmButton: Boolean(advisory.suggestedHour),
      confirmButtonText: advisory.suggestedHour ? `Usar ${advisory.suggestedHour}` : "Usar sugerencia",
      cancelButtonText: "Cancelar",
    });

    if (result?.isConfirmed && advisory.suggestedHour) {
      if (typeof onApplySuggestion === "function") {
        onApplySuggestion(entry, advisory.suggestedHour);
      }
      continue;
    }

    return { ok: false, cancelled: true };
  }

  return { ok: true };
}
