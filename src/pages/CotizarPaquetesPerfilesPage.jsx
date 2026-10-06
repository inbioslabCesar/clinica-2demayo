import { authFetch } from "../utils/apiClient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL, fetchConfigSingleton, getCachedAgendaProgramacionModo, getCachedAgendaSlotMinutes } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";
import { buildAgendaGuardEntriesFromDetalles, detectarCruceConCarrito, validarAgendaAntesDeCotizar } from "../utils/agendaGuardCotizacion";
import { getReferenceHorarioFromCart, suggestNextHorarioFromCart } from "../utils/cartScheduling";
import useAgendaAvailabilityByTargets from "../hooks/useAgendaAvailabilityByTargets";

const SERVICE_TYPE_LABELS = {
  consulta: "Consulta",
  ecografia: "Ecografia",
  rayosx: "Rayos X",
  procedimiento: "Procedimiento",
  operacion: "Operacion",
  laboratorio: "Laboratorio",
  farmacia: "Farmacia",
};

const COMPONENT_FILTER_OPTIONS = [
  { value: "consulta", label: "Incluye Consulta" },
  { value: "ecografia", label: "Incluye Ecografia" },
  { value: "rayosx", label: "Incluye Rayos X" },
  { value: "procedimiento", label: "Incluye Procedimiento" },
  { value: "operacion", label: "Incluye Operacion" },
  { value: "laboratorio", label: "Incluye Laboratorio" },
  { value: "farmacia", label: "Incluye Farmacia" },
];

const LIST_INITIAL_VISIBLE = 12;
const LIST_LOAD_STEP = 12;
const PRESENTIAL_AGENDABLE_TYPES = new Set(["consulta", "ecografia", "rayosx", "procedimiento", "operacion"]);

function resolveAgendaStepMinutes(stepMinutes) {
  const configured = Number(getCachedAgendaSlotMinutes() || 30);
  const requested = Number(stepMinutes || 0);
  const source = Number.isFinite(requested) && requested > 0 && requested !== 30
    ? requested
    : configured;
  return Math.max(5, Math.min(120, Math.round(source)));
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
  const norm = normalizeHourHm(hm);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHm(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

function normalizeServiceType(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "procedimiento";
  if (base === "rayos_x" || base === "rayos x" || base === "rx") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  return base;
}

function isPresentialAgendableType(value) {
  return PRESENTIAL_AGENDABLE_TYPES.has(normalizeServiceType(value));
}

function collectOccupiedSlotsFromDetails(details, occupiedPatient, occupiedDoctor, parentFecha = "", parentHora = "") {
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || typeof detail !== "object") continue;
    const tipo = normalizeServiceType(detail?.servicio_tipo || detail?.source_type || detail?.serviceType || "");
    const fecha = normalizeDateYmd(detail?.fecha_programada || detail?.fechaProgramada || detail?.fecha || parentFecha || "");
    const hora = normalizeHourHm(detail?.hora_programada || detail?.horaProgramada || detail?.hora || parentHora || "");
    const medicoId = Number(detail?.medico_id || detail?.medicoId || detail?.consultaMedicoId || 0);

    if (isPresentialAgendableType(tipo) && fecha && hora) {
      occupiedPatient.add(`${fecha}|${hora}`);
      if (medicoId > 0) {
        occupiedDoctor.add(`${medicoId}|${fecha}|${hora}`);
      }
    }

    const componentes = Array.isArray(detail?.componentes) ? detail.componentes : [];
    if (componentes.length > 0) {
      const componentesAgendables = componentes
        .map((comp) => {
          const tipoComp = normalizeServiceType(comp?.servicio_tipo || comp?.source_type || comp?.serviceType || "");
          if (!isPresentialAgendableType(tipoComp)) return null;
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
          const fechaSeq = addDaysYmd(baseFecha, dayShift);
          const horaSeq = minutesToHm(minuteOfDay);
          occupiedPatient.add(`${fechaSeq}|${horaSeq}`);
          if (Number(comp?.medicoId || 0) > 0) {
            occupiedDoctor.add(`${Number(comp.medicoId)}|${fechaSeq}|${horaSeq}`);
          }
        }
        continue;
      }

      collectOccupiedSlotsFromDetails(componentes, occupiedPatient, occupiedDoctor, fecha, hora);
    }
  }
}

function findNextFreeSlot({ fechaBase, minuteBase, medicoId, occupiedPatient, occupiedDoctor, stepMinutes = 30 }) {
  let fecha = normalizeDateYmd(fechaBase);
  let minute = Number.isFinite(minuteBase) ? minuteBase : 8 * 60;
  const step = resolveAgendaStepMinutes(stepMinutes);

  for (let guard = 0; guard < 300; guard += 1) {
    if (!fecha) return null;

    if (minute > 23 * 60 + 30) {
      fecha = addDaysYmd(fecha, 1);
      minute = 0;
      continue;
    }

    const hora = minutesToHm(minute);
    const patientKey = `${fecha}|${hora}`;
    const doctorKey = `${Number(medicoId || 0)}|${fecha}|${hora}`;
    const patientBusy = occupiedPatient.has(patientKey);
    const doctorBusy = Number(medicoId || 0) > 0 ? occupiedDoctor.has(doctorKey) : false;

    if (!patientBusy && !doctorBusy) {
      return { fecha, hora, minute };
    }

    minute += step;
  }

  return null;
}

function secuenciarComponentesPaquete({
  componentes,
  fechaBase,
  horaBase,
  occupiedPatient,
  occupiedDoctor,
  stepMinutes = 30,
}) {
  const cloned = Array.isArray(componentes) ? componentes.map((c) => ({ ...c })) : [];
  const step = resolveAgendaStepMinutes(stepMinutes);
  const priority = { consulta: 10, ecografia: 20, rayosx: 30, procedimiento: 40, operacion: 50, laboratorio: 60, farmacia: 70 };

  const indexed = cloned
    .map((comp, idx) => ({ comp, idx }))
    .filter(({ comp }) => isPresentialAgendableType(comp?.servicio_tipo || comp?.source_type))
    .sort((a, b) => {
      const pa = Number(priority[normalizeServiceType(a.comp?.servicio_tipo || a.comp?.source_type)] || 999);
      const pb = Number(priority[normalizeServiceType(b.comp?.servicio_tipo || b.comp?.source_type)] || 999);
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    });

  let cursorFecha = normalizeDateYmd(fechaBase);
  let cursorMinute = hmToMinutes(horaBase);
  if (!cursorFecha) return { componentes: cloned, startFecha: "", startHora: "" };
  if (cursorMinute === null) cursorMinute = 8 * 60;

  let firstSlot = null;
  for (const item of indexed) {
    const medicoId = Number(item?.comp?.medico_id || 0);
    const slot = findNextFreeSlot({
      fechaBase: cursorFecha,
      minuteBase: cursorMinute,
      medicoId,
      occupiedPatient,
      occupiedDoctor,
      stepMinutes: step,
    });
    if (!slot) continue;

    cloned[item.idx] = {
      ...cloned[item.idx],
      fecha_programada: slot.fecha,
      hora_programada: slot.hora,
    };
    occupiedPatient.add(`${slot.fecha}|${slot.hora}`);
    if (medicoId > 0) {
      occupiedDoctor.add(`${medicoId}|${slot.fecha}|${slot.hora}`);
    }

    if (!firstSlot) firstSlot = slot;
    cursorFecha = slot.fecha;
    cursorMinute = slot.minute + step;
  }

  return {
    componentes: cloned,
    startFecha: firstSlot?.fecha || normalizeDateYmd(fechaBase),
    startHora: firstSlot?.hora || normalizeHourHm(horaBase),
  };
}

function normalizarPaquetesSecuenciales(detailItems, cartItems, fallbackDate, fallbackTime) {
  const occupiedPatient = new Set();
  const occupiedDoctor = new Set();
  collectOccupiedSlotsFromDetails(cartItems, occupiedPatient, occupiedDoctor);

  const out = [];
  for (const item of Array.isArray(detailItems) ? detailItems : []) {
    const fechaBase = normalizeDateYmd(item?.fechaProgramada || item?.fecha_programada || fallbackDate || "");
    const horaBase = normalizeHourHm(item?.horaProgramada || item?.hora_programada || fallbackTime || "");
    const scheduled = secuenciarComponentesPaquete({
      componentes: item?.componentes,
      fechaBase,
      horaBase,
      occupiedPatient,
      occupiedDoctor,
      stepMinutes: 30,
    });
    out.push({
      ...item,
      componentes: scheduled.componentes,
      fechaProgramada: String(scheduled.startFecha || fechaBase || "").slice(0, 10),
      horaProgramada: String(scheduled.startHora || horaBase || "").slice(0, 5),
    });
  }
  return out;
}

function parsePackageMeta(metaRaw) {
  if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) return metaRaw;
  if (typeof metaRaw === "string" && metaRaw.trim()) {
    try {
      const parsed = JSON.parse(metaRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function buildPackageComponents(pkg, cotizacionId) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const meta = parsePackageMeta(pkg?.meta);
  const montoClinicaFijo = Number(meta?.reparto_campana?.monto_clinica_fijo || 0);
  return items
    .map((it) => {
      const cantidad = Math.max(1, Number(it.cantidad || 1));
      const precio = Number(it.precio_lista_snapshot || 0);
      const subtotalBase = Number(it.subtotal_snapshot || precio * cantidad);
      return {
        source_type: String(it.source_type || "procedimiento"),
        source_id: Number(it.source_id || 0),
        examen_version_id: Number(it.examen_version_id || 0) || null,
        servicio_tipo: normalizeServiceType(it.source_type),
        servicio_id: Number(it.source_id || 0),
        descripcion_snapshot: String(it.descripcion_snapshot || ""),
        descripcion: String(it.descripcion_snapshot || "Item"),
        cantidad,
        precio_lista_snapshot: precio,
        precio_unitario: precio,
        subtotal_snapshot: Number(subtotalBase.toFixed(2)),
        subtotal: Number(subtotalBase.toFixed(2)),
        es_derivado: Boolean(it.es_derivado),
        derivado: Boolean(it.es_derivado),
        laboratorio_referencia: String(it.laboratorio_referencia || ""),
        tipo_derivacion: String(it.tipo_derivacion || ""),
        valor_derivacion: Number(it.valor_derivacion || 0),
        medico_id: Number(it.medico_id || 0) || null,
        honorario_regla: it.honorario_regla || null,
        paquete_monto_clinica_fijo: montoClinicaFijo > 0 ? Number(montoClinicaFijo.toFixed(2)) : null,
        cotizacion_id: Number(cotizacionId || 0) || null,
      };
    })
    .filter((it) => it.servicio_id > 0 || String(it.descripcion || "").trim() !== "");
}

function getPackageServiceBadges(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const seen = new Set();
  const badges = [];

  for (const it of items) {
    const normalized = normalizeServiceType(it?.source_type || it?.servicio_tipo || "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    badges.push(SERVICE_TYPE_LABELS[normalized] || normalized);
  }

  return badges;
}

function getPackageServiceTypes(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const setTypes = new Set();
  for (const it of items) {
    const normalized = normalizeServiceType(it?.source_type || it?.servicio_tipo || "");
    if (normalized) setTypes.add(normalized);
  }
  return Array.from(setTypes);
}

function resolvePaqueteMedicoId(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const medicos = Array.from(
    new Set(
      items
        .map((it) => Number(it?.medico_id || 0))
        .filter((id) => id > 0)
    )
  );
  if (medicos.length !== 1) return 0;
  return medicos[0];
}

function resolvePaqueteMedicoIds(pkg, cotizacionId) {
  const componentes = buildPackageComponents(pkg, cotizacionId);
  return Array.from(new Set(
    componentes
      .map((it) => Number(it?.medico_id || 0))
      .filter((id) => id > 0)
  ));
}

function buildDetalleKey(detalle) {
  const tipo = normalizeServiceType(detalle?.servicio_tipo || detalle?.source_type || "");
  const servicioId = Number(detalle?.servicio_id || detalle?.source_id || 0);
  const examenVersionId = Number(detalle?.examen_version_id || detalle?.version_id || 0);
  const descripcion = String(detalle?.descripcion || detalle?.descripcion_snapshot || "").trim().toLowerCase();
  const cantidad = Number(detalle?.cantidad || 1).toFixed(2);
  const precioUnitario = Number(detalle?.precio_unitario ?? detalle?.precio_lista_snapshot ?? 0).toFixed(2);
  const fechaProgramada = String(detalle?.fecha_programada || "").slice(0, 10);
  const horaProgramada = String(detalle?.hora_programada || "").slice(0, 5);
  return `${tipo}::${servicioId}::${examenVersionId}::${descripcion}::${cantidad}::${precioUnitario}::${fechaProgramada}::${horaProgramada}`;
}

function countPresentialBlocksForPackage(pkg, cotizacionId) {
  const componentes = buildPackageComponents(pkg, cotizacionId);
  const bloques = componentes.filter((it) => isPresentialAgendableType(it?.servicio_tipo || it?.source_type)).length;
  return Math.max(1, bloques);
}

function computeValidStartHours(horasLibres, bloquesRequeridos, stepMinutes = 30) {
  const step = resolveAgendaStepMinutes(stepMinutes);
  const libres = Array.isArray(horasLibres)
    ? horasLibres
      .map((h) => normalizeHourHm(h))
      .filter(Boolean)
    : [];
  const libresSet = new Set(libres);
  const out = [];

  for (const hora of libres) {
    const baseMin = hmToMinutes(hora);
    if (baseMin === null) continue;

    let cumple = true;
    for (let i = 1; i < Math.max(1, Number(bloquesRequeridos || 1)); i += 1) {
      const next = minutesToHm(baseMin + i * step);
      if (!libresSet.has(next)) {
        cumple = false;
        break;
      }
    }
    if (cumple) out.push(hora);
  }

  return Array.from(new Set(out));
}

function normalizeAgendaProgramacionModo(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["strict", "mixed", "free"].includes(mode) ? mode : "mixed";
}

export default function CotizarPaquetesPerfilesPage() {
  const { pacienteId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, addItems, count: cartCount } = useQuoteCart();

  const [paciente, setPaciente] = useState(null);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState("");
  const [componentFilters, setComponentFilters] = useState([]);
  const [componentFilterMode, setComponentFilterMode] = useState("any");
  const [loading, setLoading] = useState(false);
  const [schemaWarning, setSchemaWarning] = useState(null);
  const [medicos, setMedicos] = useState([]);
  const [visibleCount, setVisibleCount] = useState(LIST_INITIAL_VISIBLE);
  const [programacionPorPaquete, setProgramacionPorPaquete] = useState({});
  const [manualProgramacionByPaquete, setManualProgramacionByPaquete] = useState({});
  const [agendaProgramacionModo, setAgendaProgramacionModo] = useState(() => getCachedAgendaProgramacionModo());
  const loadPackagesRef = useRef(null);

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const cotizacionId = Number(sp.get("cotizacion_id") || 0);
  const isEditingCotizacion = cotizacionId > 0 && !sp.get("cobro_id");
  const pacienteTemporal = location.state?.pacienteTemporal || null;
  const esCotizacionInformativa = Number(pacienteId || 0) <= 0;
  const nombrePacienteTemporal = `${String(pacienteTemporal?.nombre || "").trim()} ${String(pacienteTemporal?.apellido || "").trim()}`.trim();
  const dniPacienteTemporal = String(pacienteTemporal?.dni || "").trim();

  const getLimaDate = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${year}-${month}-${day}`;
  };

  const getDefaultTime = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    return `${hour}:${minute}`;
  };

  const getProgramacionPaquete = (paqueteId) => {
    const pid = Number(paqueteId || 0);
    const actual = programacionPorPaquete[pid];
    if (actual?.fecha_programada || actual?.hora_programada) return actual;
    const row = rows.find((r) => Number(r.id) === pid);
    const medicoId = resolvePaqueteMedicoId(row);
    const fechaBase = getLimaDate();
    const sugerida = suggestNextHorarioFromCart(cart?.items, {
      medicoId,
      fechaBase,
      stepMinutes: 30,
    });
    const referencia = getReferenceHorarioFromCart(cart?.items);
    return {
      fecha_programada: String(sugerida?.fecha || referencia?.fecha || fechaBase).slice(0, 10),
      hora_programada: String(sugerida?.hora || referencia?.hora || getDefaultTime()).slice(0, 5),
    };
  };


  useEffect(() => {
    const qParam = String(sp.get("q") || "").trim();
    const matchParam = String(sp.get("match") || "any").toLowerCase();
    const compsRaw = String(sp.get("comp") || "").trim();

    if (qParam) setSearch(qParam);
    if (["any", "all"].includes(matchParam)) setComponentFilterMode(matchParam);
    if (compsRaw) {
      const parsed = compsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => COMPONENT_FILTER_OPTIONS.some((o) => o.value === s));
      if (parsed.length > 0) setComponentFilters(Array.from(new Set(parsed)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    const qValue = String(search || "").trim();
    if (qValue) next.set("q", qValue);
    else next.delete("q");

    if (componentFilterMode && componentFilterMode !== "any") next.set("match", componentFilterMode);
    else next.delete("match");

    if (componentFilters.length > 0) next.set("comp", componentFilters.join(","));
    else next.delete("comp");

    const current = new URLSearchParams(location.search).toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      navigate(`${location.pathname}${upcoming ? `?${upcoming}` : ""}`, { replace: true });
    }
  }, [search, componentFilters, componentFilterMode, location.pathname, location.search, navigate]);

  useEffect(() => {
    authFetch(`${BASE_URL}api_pacientes.php?id=${Number(pacienteId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.paciente) {
          setPaciente(data.paciente);
        }
      })
      .catch(() => {
        setPaciente(null);
      });
  }, [pacienteId]);

  useEffect(() => {
    authFetch(`${BASE_URL}api_medicos.php`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const lista = Array.isArray(data?.medicos) ? data.medicos : (Array.isArray(data) ? data : []);
        setMedicos(lista);
      })
      .catch(() => {
        setMedicos([]);
      });
  }, []);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "activos");
      params.set("include_items", "1");
      params.set("limit", "100");
      if (search.trim()) params.set("q", search.trim());

      const res = await authFetch(`${BASE_URL}api_paquetes_perfiles.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar paquetes/perfiles");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (data?.schema_ready === false) {
        setSchemaWarning({
          message: data?.warning || "Flujo de perfiles no instalado.",
          missingTables: Array.isArray(data?.missing_tables) ? data.missing_tables : [],
          hint: data?.hint || "",
        });
      } else {
        setSchemaWarning(null);
      }
    } catch (e) {
      setSchemaWarning(null);
      Swal.fire("Error", e?.message || "No se pudo cargar paquetes/perfiles", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackagesRef.current = loadPackages;
  });

  useEffect(() => {
    let cancelled = false;
    const applyModeFromPayload = (data) => {
      const mode = normalizeAgendaProgramacionModo(data?.agenda_programacion_modo);
      setAgendaProgramacionModo(mode);
    };

    fetchConfigSingleton().then((result) => {
      if (cancelled) return;
      applyModeFromPayload(result?.data || {});
    });

    const onConfigUpdated = (event) => {
      applyModeFromPayload(event?.detail || {});
    };
    window.addEventListener("clinica-config-updated", onConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("clinica-config-updated", onConfigUpdated);
    };
  }, []);

  useEffect(() => {
    loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reloadIfVisible = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (typeof loadPackagesRef.current === "function") {
        loadPackagesRef.current();
      }
    };

    window.addEventListener("focus", reloadIfVisible);
    document.addEventListener("visibilitychange", reloadIfVisible);
    return () => {
      window.removeEventListener("focus", reloadIfVisible);
      document.removeEventListener("visibilitychange", reloadIfVisible);
    };
  }, []);

  const toggleSelected = (id) => {
    const nid = Number(id);
    setSelected((prev) => (prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]));
    setQuantities((prev) => ({ ...prev, [nid]: Math.max(1, Number(prev[nid] || 1)) }));
  };

  const selectedRows = useMemo(() => {
    return rows.filter((r) => selected.includes(Number(r.id)));
  }, [rows, selected]);

  const selectedAvailabilityTargets = useMemo(() => {
    if (agendaProgramacionModo === "free") return [];
    return selectedRows
      .map((row) => {
        const medicoId = resolvePaqueteMedicoId(row);
        const programacion = programacionPorPaquete[Number(row.id)] || {};
        const fecha = String(programacion?.fecha_programada || "").slice(0, 10);
        const bloques = countPresentialBlocksForPackage(row, cotizacionId);
        if (medicoId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || bloques <= 0) return null;
        return {
          rowId: Number(row.id),
          medicoId,
          fecha,
          bloquesRequeridos: bloques,
          key: `${medicoId}|${fecha}`,
        };
      })
      .filter(Boolean);
  }, [selectedRows, programacionPorPaquete, cotizacionId, agendaProgramacionModo]);

  const selectedAvailabilityTargetsAllDoctors = useMemo(() => {
    if (agendaProgramacionModo === "free") return [];
    return selectedRows.flatMap((row) => {
      const programacion = programacionPorPaquete[Number(row.id)] || {};
      const fecha = String(programacion?.fecha_programada || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
      const medicosIds = resolvePaqueteMedicoIds(row, cotizacionId);
      return medicosIds.map((medicoId) => ({
        rowId: Number(row.id),
        medicoId: Number(medicoId),
        fecha,
        key: `${Number(medicoId)}|${fecha}`,
      }));
    });
  }, [selectedRows, programacionPorPaquete, cotizacionId, agendaProgramacionModo]);

  const { availabilityByPair } = useAgendaAvailabilityByTargets({
    targets: selectedAvailabilityTargetsAllDoctors,
    enabled: agendaProgramacionModo !== "free",
  });

  useEffect(() => {
    setProgramacionPorPaquete((prev) => {
      const occupiedPatient = new Set();
      const occupiedDoctor = new Set();
      collectOccupiedSlotsFromDetails(cart?.items, occupiedPatient, occupiedDoctor);

      const next = {};
      selectedRows.forEach((row) => {
        const current = prev?.[row.id];
        const fechaBase = String(current?.fecha_programada || getLimaDate()).slice(0, 10);
        const horaBase = String(current?.hora_programada || getDefaultTime()).slice(0, 5);
        const components = buildPackageComponents(row, cotizacionId);
        const scheduled = secuenciarComponentesPaquete({
          componentes: components,
          fechaBase,
          horaBase,
          occupiedPatient,
          occupiedDoctor,
          stepMinutes: 30,
        });

        next[row.id] = {
          fecha_programada: String(scheduled.startFecha || fechaBase).slice(0, 10),
          hora_programada: String(scheduled.startHora || horaBase).slice(0, 5),
        };
      });
      return next;
    });
  }, [selectedRows, cart?.items, cotizacionId]);

  useEffect(() => {
    setManualProgramacionByPaquete((prev) => {
      const selectedIds = new Set(selectedRows.map((row) => Number(row.id)));
      const next = {};
      Object.keys(prev || {}).forEach((rawId) => {
        const id = Number(rawId);
        if (selectedIds.has(id)) next[id] = Boolean(prev[rawId]);
      });
      return next;
    });
  }, [selectedRows]);

  useEffect(() => {
    if (agendaProgramacionModo === "free") return;
    if (selectedAvailabilityTargets.length === 0) return;
    const step = resolveAgendaStepMinutes(30);
    setProgramacionPorPaquete((prev) => {
      let changed = false;
      const next = { ...prev };
      selectedAvailabilityTargets.forEach((target) => {
        const avail = availabilityByPair[target.key];
        if (!avail || avail.loading || avail.error) return;
        const iniciosValidos = computeValidStartHours(avail.horasLibres, target.bloquesRequeridos, step);
        if (iniciosValidos.length === 0) return;
        if (manualProgramacionByPaquete[target.rowId]) return;
        const current = String(next[target.rowId]?.hora_programada || "").slice(0, 5);
        if (iniciosValidos.includes(current)) return;
        next[target.rowId] = {
          ...next[target.rowId],
          fecha_programada: target.fecha,
          hora_programada: iniciosValidos[0],
        };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [selectedAvailabilityTargets, availabilityByPair, agendaProgramacionModo, manualProgramacionByPaquete]);

  const toggleComponentFilter = (typeValue) => {
    const val = String(typeValue || "").trim();
    if (!val) return;
    setComponentFilters((prev) => (
      prev.includes(val)
        ? prev.filter((v) => v !== val)
        : [...prev, val]
    ));
  };

  const filteredRows = useMemo(() => {
    if (componentFilters.length === 0) return rows;
    return rows.filter((r) => {
      const types = getPackageServiceTypes(r);
      if (componentFilterMode === "all") {
        return componentFilters.every((f) => types.includes(f));
      }
      return componentFilters.some((f) => types.includes(f));
    });
  }, [rows, componentFilters, componentFilterMode]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  const total = useMemo(() => {
    return selectedRows.reduce((acc, row) => {
      const qty = Math.max(1, Number(quantities[row.id] || 1));
      return acc + Number(row.precio_global_venta || 0) * qty;
    }, 0);
  }, [selectedRows, quantities]);

  const actualizarHoraProgramadaPaquete = (row, horaValue, options = {}) => {
    const rowId = Number(row?.id || 0);
    if (rowId <= 0) return;
    const modo = normalizeAgendaProgramacionModo(agendaProgramacionModo);
    const shouldCheckOccupied = modo !== "free" && !options.skipOccupiedCheck;
    const horaNorm = normalizeHourHm(horaValue);
    const current = getProgramacionPaquete(rowId);
    const fecha = String(current?.fecha_programada || "").slice(0, 10);
    const medicoIds = resolvePaqueteMedicoIds(row, cotizacionId);

    if (shouldCheckOccupied && horaNorm) {
      for (const medicoId of medicoIds) {
        const availabilityKey = `${Number(medicoId)}|${fecha}`;
        const ocupadas = Array.isArray(availabilityByPair?.[availabilityKey]?.horasOcupadas)
          ? availabilityByPair[availabilityKey].horasOcupadas
          : [];
        if (!ocupadas.includes(horaNorm)) continue;
        const medico = medicos.find((m) => Number(m?.id || 0) === Number(medicoId));
        const medicoNombre = medico
          ? `${medico?.nombres || medico?.nombre || ""} ${medico?.apellidos || medico?.apellido || ""}`.trim()
          : `Médico #${medicoId}`;
        Swal.fire("Horario ocupado", `La hora ${horaNorm} ya está ocupada para ${medicoNombre} en ${fecha}. Elige otra hora para evitar choque.`, "warning");
        return;
      }
    }

    setProgramacionPorPaquete((prev) => ({
      ...prev,
      [rowId]: {
        ...getProgramacionPaquete(rowId),
        hora_programada: String(horaValue || "").slice(0, 5),
      },
    }));
  };

  useEffect(() => {
    setVisibleCount(LIST_INITIAL_VISIBLE);
  }, [rows, search, componentFilters, componentFilterMode]);

  const buildSelectedPackageEntries = () => {
    return selectedRows.map((row) => {
      const qty = Math.max(1, Number(quantities[row.id] || 1));
      const price = Number(row.precio_global_venta || 0);
      const programacion = getProgramacionPaquete(row.id);
      const components = buildPackageComponents(row, cotizacionId).map((it) => ({
        ...it,
        cantidad: Number((it.cantidad * qty).toFixed(2)),
        subtotal: Number((it.subtotal * qty).toFixed(2)),
        subtotal_snapshot: Number((it.subtotal_snapshot * qty).toFixed(2)),
        fecha_programada: programacion.fecha_programada,
        hora_programada: programacion.hora_programada,
      }));

      return {
        serviceType: String(row.tipo || "paquete").toLowerCase() === "perfil" ? "perfil" : "paquete",
        serviceId: Number(row.id),
        description: String(row.nombre || "Paquete/Perfil"),
        quantity: qty,
        unitPrice: price,
        source: "paquete",
        packageId: Number(row.id),
        packageCode: String(row.codigo || ""),
        packageType: String(row.tipo || "paquete"),
        componentes: components,
        cotizacionId,
        fechaProgramada: programacion.fecha_programada,
        horaProgramada: programacion.hora_programada,
      };
    });
  };

  const getFechaRefPaquetes = (paquetesSeleccionados) => {
    const fechas = (Array.isArray(paquetesSeleccionados) ? paquetesSeleccionados : [])
      .map((it) => String(it?.fechaProgramada || "").slice(0, 10))
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
      .sort();
    return fechas[0] || getLimaDate();
  };

  const addToCart = async () => {
    if (selectedRows.length === 0) {
      Swal.fire("Atencion", "Selecciona al menos un paquete/perfil.", "info");
      return;
    }

    const existsInCart = (row) => {
      return Array.isArray(cart?.items) && cart.items.some((it) => (
        Number(it?.serviceId || 0) === Number(row.id)
        && ["paquete", "perfil"].includes(String(it?.serviceType || "").toLowerCase())
      ));
    };

    const detailItemsBase = buildSelectedPackageEntries().filter((row) => !existsInCart({ id: row.serviceId }));
    const detailItems = normalizarPaquetesSecuenciales(
      detailItemsBase,
      cart?.items,
      getLimaDate(),
      getDefaultTime()
    );

    if (detailItems.length === 0) {
      Swal.fire("Atencion", "Los paquetes seleccionados ya estan en el carrito.", "info");
      return;
    }

    const detallesPaquete = detailItems.map((it) => ({
      servicio_tipo: it.serviceType,
      servicio_id: it.serviceId,
      descripcion: it.description,
      cantidad: Number(it.quantity || 1),
      precio_unitario: Number(it.unitPrice || 0),
      subtotal: Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
      paquete_id: it.packageId,
      paquete_codigo: it.packageCode,
      paquete_tipo: it.packageType,
      componentes: Array.isArray(it.componentes) ? it.componentes : [],
      fecha_programada: String(it.fechaProgramada || ""),
      hora_programada: String(it.horaProgramada || ""),
      cotizacion_id: Number(it.cotizacionId || 0) || null,
    }));

    const cruceEnCarrito = detectarCruceConCarrito({
      cartItems: cart?.items,
      nuevosDetalles: detallesPaquete,
    });
    if (cruceEnCarrito) {
      const { nuevo } = cruceEnCarrito;
      await Swal.fire(
        "Cruce en carrito",
        `Ya existe un servicio en el carrito para el mismo médico y horario (${nuevo.fecha} ${nuevo.hora}). Ajusta la hora antes de agregar.`,
        "warning"
      );
      return;
    }

    if (normalizeAgendaProgramacionModo(agendaProgramacionModo) !== "free") {
      const agendaEntries = buildAgendaGuardEntriesFromDetalles(detallesPaquete);
      const agendaCheck = await validarAgendaAntesDeCotizar({
        authFetch,
        baseUrl: BASE_URL,
        Swal,
        entries: agendaEntries,
        onApplySuggestion: (entry, nuevaHora, nuevaFecha) => {
          const horaNueva = String(nuevaHora || "").slice(0, 5);
          const fechaNueva = String(nuevaFecha || entry?.fecha || "").slice(0, 10);
          detallesPaquete.forEach((detalle) => {
            const fechaDet = String(detalle?.fecha_programada || "").slice(0, 10);
            const horaDet = String(detalle?.hora_programada || "").slice(0, 5);
            if (fechaDet === entry.fecha && horaDet === entry.hora) {
              detalle.fecha_programada = fechaNueva || fechaDet;
              detalle.hora_programada = horaNueva;
            }

            const componentes = Array.isArray(detalle?.componentes) ? detalle.componentes : [];
            componentes.forEach((comp) => {
              const medicoIdComp = Number(comp?.medico_id || 0);
              const fechaComp = String(comp?.fecha_programada || detalle?.fecha_programada || "").slice(0, 10);
              const horaComp = String(comp?.hora_programada || detalle?.hora_programada || "").slice(0, 5);
              if (medicoIdComp === Number(entry.medicoId) && fechaComp === entry.fecha && horaComp === entry.hora) {
                comp.fecha_programada = fechaNueva || fechaComp;
                comp.hora_programada = horaNueva;
              }
            });
          });
        },
      });
      if (!agendaCheck?.ok) {
        return;
      }
    }

    const detailItemsAjustadosBase = detailItems.map((it, idx) => ({
      ...it,
      fechaProgramada: String(detallesPaquete[idx]?.fecha_programada || it?.fechaProgramada || ""),
      horaProgramada: String(detallesPaquete[idx]?.hora_programada || it?.horaProgramada || ""),
      componentes: Array.isArray(detallesPaquete[idx]?.componentes) ? detallesPaquete[idx].componentes : (Array.isArray(it?.componentes) ? it.componentes : []),
    }));
    const detailItemsAjustados = normalizarPaquetesSecuenciales(
      detailItemsAjustadosBase,
      cart?.items,
      getLimaDate(),
      getDefaultTime()
    );

    addItems({
      patientId: Number(pacienteId),
      patientName: paciente
        ? `${paciente.nombres || paciente.nombre || ""} ${paciente.apellidos || paciente.apellido || ""}`.trim()
        : `Paciente #${pacienteId}`,
      items: detailItemsAjustados,
    });

    Swal.fire("Listo", `Se agregaron ${detailItemsAjustados.length} paquete(s)/perfil(es) al carrito.`, "success");
  };

  const registrarCotizacion = async ({ irACobro = false } = {}) => {
    if (selectedRows.length === 0) {
      Swal.fire("Atencion", "Selecciona al menos un paquete/perfil.", "info");
      return;
    }

    try {
      const paquetesSeleccionadosBase = buildSelectedPackageEntries();
      const paquetesSeleccionados = normalizarPaquetesSecuenciales(
        paquetesSeleccionadosBase,
        cart?.items,
        getLimaDate(),
        getDefaultTime()
      );
      const fechaRef = getFechaRefPaquetes(paquetesSeleccionados);
      const detallesPaquete = paquetesSeleccionados.map((it) => ({
        servicio_tipo: it.serviceType,
        servicio_id: it.serviceId,
        descripcion: it.description,
        cantidad: Number(it.quantity || 1),
        precio_unitario: Number(it.unitPrice || 0),
        subtotal: Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
        paquete_id: it.packageId,
        paquete_codigo: it.packageCode,
        paquete_tipo: it.packageType,
        componentes: Array.isArray(it.componentes) ? it.componentes : [],
        fecha_programada: String(it.fechaProgramada || ""),
        hora_programada: String(it.horaProgramada || ""),
        cotizacion_id: Number(it.cotizacionId || 0) || null,
      }));

      if (normalizeAgendaProgramacionModo(agendaProgramacionModo) !== "free") {
        const agendaEntries = buildAgendaGuardEntriesFromDetalles(detallesPaquete);
        const agendaCheck = await validarAgendaAntesDeCotizar({
          authFetch,
          baseUrl: BASE_URL,
          Swal,
          entries: agendaEntries,
          onApplySuggestion: (entry, nuevaHora, nuevaFecha) => {
            const horaNueva = String(nuevaHora || "").slice(0, 5);
            const fechaNueva = String(nuevaFecha || entry?.fecha || "").slice(0, 10);
            detallesPaquete.forEach((detalle) => {
              const fechaDet = String(detalle?.fecha_programada || "").slice(0, 10);
              const horaDet = String(detalle?.hora_programada || "").slice(0, 5);
              if (fechaDet === entry.fecha && horaDet === entry.hora) {
                detalle.fecha_programada = fechaNueva || fechaDet;
                detalle.hora_programada = horaNueva;
              }

              const componentes = Array.isArray(detalle?.componentes) ? detalle.componentes : [];
              componentes.forEach((comp) => {
                const medicoIdComp = Number(comp?.medico_id || 0);
                const fechaComp = String(comp?.fecha_programada || detalle?.fecha_programada || "").slice(0, 10);
                const horaComp = String(comp?.hora_programada || detalle?.hora_programada || "").slice(0, 5);
                if (medicoIdComp === Number(entry.medicoId) && fechaComp === entry.fecha && horaComp === entry.hora) {
                  comp.fecha_programada = fechaNueva || fechaComp;
                  comp.hora_programada = horaNueva;
                }
              });
            });
          },
        });
        if (!agendaCheck?.ok) {
          return;
        }
      }

      const paquetesRehidratados = paquetesSeleccionados.map((it, idx) => ({
        ...it,
        fechaProgramada: String(detallesPaquete[idx]?.fecha_programada || it?.fechaProgramada || ""),
        horaProgramada: String(detallesPaquete[idx]?.hora_programada || it?.horaProgramada || ""),
        componentes: Array.isArray(detallesPaquete[idx]?.componentes) ? detallesPaquete[idx].componentes : (Array.isArray(it?.componentes) ? it.componentes : []),
      }));
      const paquetesSeleccionadosNormalizados = normalizarPaquetesSecuenciales(
        paquetesRehidratados,
        cart?.items,
        getLimaDate(),
        getDefaultTime()
      );
      const detallesPaqueteNormalizados = paquetesSeleccionadosNormalizados.map((it) => ({
        servicio_tipo: it.serviceType,
        servicio_id: it.serviceId,
        descripcion: it.description,
        cantidad: Number(it.quantity || 1),
        precio_unitario: Number(it.unitPrice || 0),
        subtotal: Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
        paquete_id: it.packageId,
        paquete_codigo: it.packageCode,
        paquete_tipo: it.packageType,
        componentes: Array.isArray(it.componentes) ? it.componentes : [],
        fecha_programada: String(it.fechaProgramada || ""),
        hora_programada: String(it.horaProgramada || ""),
        cotizacion_id: Number(it.cotizacionId || 0) || null,
      }));

      let detallesFinales = detallesPaqueteNormalizados;
      if (isEditingCotizacion && cotizacionId > 0) {
        const resGet = await authFetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`, {
          credentials: "include",
        });
        const dataGet = await resGet.json();
        if (!dataGet?.success || !dataGet?.cotizacion) {
          throw new Error(dataGet?.error || "No se pudo cargar la cotizacion para actualizar");
        }
        const base = Array.isArray(dataGet.cotizacion.detalles) ? dataGet.cotizacion.detalles : [];

        const componentKeys = new Set();
        for (const p of detallesPaqueteNormalizados) {
          const comps = Array.isArray(p?.componentes) ? p.componentes : [];
          for (const c of comps) {
            componentKeys.add(buildDetalleKey(c));
          }
        }

        const baseSinComponentesRepetidos = base.filter((d) => !componentKeys.has(buildDetalleKey(d)));
        detallesFinales = [...baseSinComponentesRepetidos, ...detallesPaqueteNormalizados];
      }

      const totalFinal = detallesFinales.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);
      if (!isEditingCotizacion && detallesFinales.length > 1) {
        const resumenPreview = detallesFinales
          .map((detalle, idx) => {
            const titulo = String(detalle?.descripcion || `Paquete/Perfil ${idx + 1}`);
            const fecha = String(detalle?.fecha_programada || "").slice(0, 10) || "-";
            const hora = String(detalle?.hora_programada || "").slice(0, 5) || "-";
            const totalItem = Number(detalle?.subtotal || 0).toFixed(2);
            return `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9"><b>Atención ${idx + 1}</b>: ${titulo}<br/><span style="color:#475569">Fecha/Hora sugerida: ${fecha} ${hora} · Total: S/ ${totalItem}</span></div>`;
          })
          .join("");
        const confirmSplit = await Swal.fire({
          title: "Previsualización de split",
          html: `<div style="text-align:left;font-size:13px;max-height:280px;overflow:auto">${resumenPreview}</div>`,
          icon: "info",
          showCancelButton: true,
          confirmButtonText: "Registrar separado",
          cancelButtonText: "Cancelar",
        });
        if (!confirmSplit.isConfirmed) {
          return;
        }

        const payloadSplit = {
          accion: "registrar_split",
          paciente_id: Number(pacienteId),
          paciente_nombre: esCotizacionInformativa ? nombrePacienteTemporal : undefined,
          paciente_dni: esCotizacionInformativa ? dniPacienteTemporal : undefined,
          modo_cotizacion: esCotizacionInformativa ? "informativa" : undefined,
          solo_ticket: esCotizacionInformativa ? 1 : undefined,
          observaciones: esCotizacionInformativa
            ? "Cotización informativa separada por paquete/perfil"
            : "Cotizacion separada por paquete/perfil",
          grupos: detallesFinales.map((detalle) => ({
            detalles: [detalle],
            total: Number(Number(detalle?.subtotal || 0).toFixed(2)),
            fecha_ref: String(detalle?.fecha_programada || fechaRef || ""),
          })),
        };
        const resSplit = await authFetch(`${BASE_URL}api_cotizaciones.php`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadSplit),
        });
        const dataSplit = await resSplit.json();
        const cotizacionesSeparadas = Array.isArray(dataSplit?.cotizacion_ids)
          ? dataSplit.cotizacion_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
          : [];
        if (!dataSplit?.success || cotizacionesSeparadas.length === 0) {
          throw new Error(dataSplit?.error || "No se pudo registrar el split de cotizaciones");
        }

        Swal.fire(
          "Listo",
          `Se registraron ${cotizacionesSeparadas.length} cotizaciones separadas por paquete/perfil.`,
          "success"
        ).then(() => {
          if (irACobro && cotizacionesSeparadas.length > 0) {
            const principal = cotizacionesSeparadas[0];
            navigate(`/cobrar-cotizacion/${principal}?ids=${encodeURIComponent(cotizacionesSeparadas.join(","))}`);
            return;
          }
          navigate("/cotizaciones");
        });
        return;
      }

      const payload = isEditingCotizacion && cotizacionId > 0
        ? {
            accion: "editar",
            cotizacion_id: Number(cotizacionId),
            detalles: detallesFinales,
            total: Number(totalFinal.toFixed(2)),
            fecha_ref: fechaRef,
            motivo: "Edicion desde cotizador de Paquetes/Perfiles",
          }
        : {
            paciente_id: Number(pacienteId),
            paciente_nombre: esCotizacionInformativa ? nombrePacienteTemporal : undefined,
            paciente_dni: esCotizacionInformativa ? dniPacienteTemporal : undefined,
            modo_cotizacion: esCotizacionInformativa ? "informativa" : undefined,
            solo_ticket: esCotizacionInformativa ? 1 : undefined,
            detalles: detallesFinales,
            total: Number(totalFinal.toFixed(2)),
            fecha_ref: fechaRef,
            observaciones: esCotizacionInformativa
              ? "Cotización informativa registrada desde cotizador de Paquetes/Perfiles"
              : "Cotizacion registrada desde cotizador de Paquetes/Perfiles",
          };

      const res = await authFetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo registrar la cotizacion");
      }

      const cotizacionDestino = Number(data?.cotizacion_id || cotizacionId || 0);
      Swal.fire("Listo", isEditingCotizacion ? "Cotizacion actualizada." : "Cotizacion registrada.", "success").then(() => {
        if (irACobro && cotizacionDestino > 0) {
          navigate(`/cobrar-cotizacion/${cotizacionDestino}`);
          return;
        }

        if (isEditingCotizacion && cotizacionDestino > 0) {
          navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${cotizacionDestino}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId), cotizacionId: cotizacionDestino, backTo: "/cotizaciones", modo: "editar" },
          });
          return;
        }

        navigate("/cotizaciones");
      });
    } catch (e) {
      Swal.fire("Error", e?.message || "No se pudo registrar la cotizacion", "error");
    }
  };

  return (
    <div className={`max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8 transition-all ${cartCount > 0 ? "xl:mr-[22rem]" : ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📦</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotizador de Paquetes y Perfiles</h2>
          {isEditingCotizacion && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              Editando cotizacion #{cotizacionId}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            if (isEditingCotizacion) {
              navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${cotizacionId}&modo=editar&back_to=/cotizaciones`, {
                state: { pacienteId: Number(pacienteId), cotizacionId, backTo: "/cotizaciones", modo: "editar" },
              });
            } else {
              navigate("/seleccionar-servicio", {
                state: Number(pacienteId || 0) <= 0
                  ? {
                      pacienteId: 0,
                      pacienteTemporal: { nombre: 'Particular', apellido: '', dni: '' },
                    }
                  : { pacienteId: Number(pacienteId) },
              });
            }
          }}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
      </div>

      <div className="mb-4 text-gray-700">
        <b>Paciente:</b> {paciente ? `${paciente.nombre || paciente.nombres || ""} ${paciente.apellido || paciente.apellidos || ""}`.trim() : `ID ${pacienteId}`}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input
          type="text"
          className="border rounded px-3 py-2 md:col-span-2"
          placeholder="Buscar paquete/perfil por nombre o codigo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-2"
          value={componentFilterMode}
          onChange={(e) => setComponentFilterMode(String(e.target.value || "any"))}
        >
          <option value="any">Coincide con cualquiera</option>
          <option value="all">Debe incluir todos</option>
        </select>
        <button
          type="button"
          className="bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700"
          onClick={loadPackages}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-600">Filtro rapido por componente:</span>
        {COMPONENT_FILTER_OPTIONS.map((opt) => {
          const isActive = componentFilters.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleComponentFilter(opt.value)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${isActive ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {opt.label.replace("Incluye ", "")}
            </button>
          );
        })}
        {componentFilters.length > 0 && (
          <button
            type="button"
            onClick={() => setComponentFilters([])}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {schemaWarning && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
          <div className="font-semibold">Esquema de paquetes/perfiles pendiente</div>
          <div>{schemaWarning.message}</div>
          {schemaWarning.missingTables.length > 0 && (
            <div>Tablas faltantes: {schemaWarning.missingTables.join(", ")}</div>
          )}
          {schemaWarning.hint && <div>Sugerencia: {schemaWarning.hint}</div>}
        </div>
      )}

      <div className="flex flex-col gap-8 md:flex-row">
        <div className="w-full flex-1">
          <div className="bg-white rounded-lg shadow border border-gray-200 max-h-[68vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Cargando...</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No hay paquetes/perfiles activos.</div>
            ) : (
              <>
              <div className="px-4 py-2 text-xs text-gray-500 border-b bg-gray-50">
                Mostrando {Math.min(visibleRows.length, filteredRows.length)} de {filteredRows.length} resultado(s)
              </div>
              <ul className="divide-y divide-gray-100">
                {visibleRows.map((row) => {
                  const isChecked = selected.includes(Number(row.id));
                  const qty = Math.max(1, Number(quantities[row.id] || 1));
                  const componentCount = Array.isArray(row.items) ? row.items.length : Number(row.items_total || 0);
                  const badges = getPackageServiceBadges(row);
                  const visibleBadges = badges.slice(0, 3);
                  const hiddenBadges = Math.max(0, badges.length - visibleBadges.length);
                  return (
                    <li key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(row.id)}
                        className="w-5 h-5 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 truncate">{row.nombre}</div>
                        <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                          <span>{row.codigo}</span>
                          <span>| {row.tipo}</span>
                          <span>| {componentCount} item(s)</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {visibleBadges.map((badge) => (
                            <span key={`${row.id}-${badge}`} className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              {badge}
                            </span>
                          ))}
                          {hiddenBadges > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              +{hiddenBadges} mas
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-green-700">S/ {Number(row.precio_global_venta || 0).toFixed(2)}</div>
                      {isChecked && (
                        <input
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) => setQuantities((prev) => ({
                            ...prev,
                            [row.id]: Math.max(1, Number(e.target.value || 1)),
                          }))}
                          className="border rounded-lg px-2 w-16 bg-white"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {visibleCount < filteredRows.length && (
                <div className="p-3 border-t bg-white flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + LIST_LOAD_STEP)}
                    className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Cargar mas
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="w-full md:sticky md:top-8 h-fit md:max-w-xl">
            <h4 className="font-semibold text-gray-700 mb-2">Lista seleccionada</h4>
            <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-[68vh] overflow-y-auto">
              {selectedRows.map((row) => {
                const qty = Math.max(1, Number(quantities[row.id] || 1));
                const subtotal = Number(row.precio_global_venta || 0) * qty;
                const programacion = getProgramacionPaquete(row.id);
                const medicoId = resolvePaqueteMedicoId(row);
                const medicoIdsPaquete = resolvePaqueteMedicoIds(row, cotizacionId);
                const bloquesRequeridos = countPresentialBlocksForPackage(row, cotizacionId);
                const availabilityKey = `${medicoId}|${String(programacion.fecha_programada || "").slice(0, 10)}`;
                const availability = availabilityByPair[availabilityKey] || null;
                const disponibilidadPorMedico = medicoIdsPaquete.map((mid) => {
                  const key = `${Number(mid)}|${String(programacion.fecha_programada || "").slice(0, 10)}`;
                  return {
                    medicoId: Number(mid),
                    availability: availabilityByPair[key] || null,
                  };
                });
                const iniciosValidos = computeValidStartHours(
                  availability?.horasLibres || [],
                  bloquesRequeridos,
                  30
                );
                const modo = normalizeAgendaProgramacionModo(agendaProgramacionModo);
                const isModeFree = modo === "free";
                const isModeMixed = modo === "mixed";
                const isModeStrict = modo === "strict";
                const manualEnabled = Boolean(manualProgramacionByPaquete[row.id]) && isModeMixed;
                const horasOcupadas = Array.isArray(availability?.horasOcupadas) ? availability.horasOcupadas : [];
                return (
                  <li key={`sel-${row.id}`} className="py-2 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900">{row.nombre}</div>
                        <div className="text-xs text-gray-500">{row.codigo} | {row.tipo} | x{qty}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {getPackageServiceBadges(row).map((badge) => (
                            <span key={`sel-${row.id}-${badge}`} className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="font-bold text-green-700 text-right">S/ {subtotal.toFixed(2)}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-gray-600">Fecha programada</span>
                        <input
                          type="date"
                          value={programacion.fecha_programada}
                          onChange={(e) => setProgramacionPorPaquete((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...getProgramacionPaquete(row.id),
                              fecha_programada: e.target.value,
                            },
                          }))}
                          className="border rounded-lg px-2 py-1 bg-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-gray-600">Hora programada</span>
                        {isModeFree ? (
                          <input
                            type="time"
                            value={programacion.hora_programada}
                            onChange={(e) => actualizarHoraProgramadaPaquete(row, e.target.value, { skipOccupiedCheck: true })}
                            className="border rounded-lg px-2 py-1 bg-white"
                          />
                        ) : (iniciosValidos.length > 0 && !manualEnabled) ? (
                          <select
                            value={iniciosValidos.includes(programacion.hora_programada) ? programacion.hora_programada : iniciosValidos[0]}
                            onChange={(e) => setProgramacionPorPaquete((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...getProgramacionPaquete(row.id),
                                hora_programada: String(e.target.value || "").slice(0, 5),
                              },
                            }))}
                            className="border rounded-lg px-2 py-1 bg-white"
                          >
                            {iniciosValidos.map((hora) => (
                              <option key={`${row.id}-${hora}`} value={hora}>{hora}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="time"
                            value={programacion.hora_programada}
                            onChange={(e) => actualizarHoraProgramadaPaquete(row, e.target.value)}
                            className="border rounded-lg px-2 py-1 bg-white"
                            disabled={isModeStrict && iniciosValidos.length === 0}
                          />
                        )}
                      </label>
                    </div>
                    {isModeMixed && medicoId > 0 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setManualProgramacionByPaquete((prev) => ({
                            ...prev,
                            [row.id]: !prev[row.id],
                          }))}
                          className={`text-xs px-3 py-1.5 rounded border ${manualEnabled ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          {manualEnabled ? "Usando hora manual/fuera de horario" : "Permitir hora manual/fuera de horario"}
                        </button>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-600 space-y-1">
                      <div>
                        <span className="font-semibold">Bloques requeridos:</span> {bloquesRequeridos}
                        <span className="text-slate-500"> ({resolveAgendaStepMinutes(30)} min c/u)</span>
                      </div>
                      <div>
                        <span className="font-semibold">Modo agenda:</span>{" "}
                        {isModeStrict ? "Estricto" : isModeFree ? "Libre" : "Mixto"}
                      </div>
                      {medicoId <= 0 && (
                        <div className="text-amber-700">Este paquete tiene múltiples médicos o no define médico único; se muestra disponibilidad por médico.</div>
                      )}
                      {isModeFree && (
                        <div className="text-slate-500">Modo libre activo: se permite seleccionar hora manual sin depender del horario regular del médico.</div>
                      )}
                      {!isModeFree && medicoId > 0 && availability?.loading && (
                        <div className="text-slate-500">Consultando horas libres del médico...</div>
                      )}
                      {!isModeFree && medicoId > 0 && !availability?.loading && availability?.error && (
                        <div className="text-rose-700">No se pudo cargar disponibilidad: {availability.error}</div>
                      )}
                      {!isModeFree && medicoId > 0 && !availability?.loading && !availability?.error && (
                        <>
                          <div>
                            <span className="font-semibold">Horas libres:</span>{" "}
                            {Array.isArray(availability?.horasLibres) && availability.horasLibres.length > 0
                              ? availability.horasLibres.join(", ")
                              : "sin horas libres"}
                          </div>
                          <div>
                            <span className="font-semibold">Horas ocupadas:</span>{" "}
                            {horasOcupadas.length > 0 ? horasOcupadas.join(", ") : "sin horas ocupadas"}
                          </div>
                          <div>
                            <span className="font-semibold">Inicios válidos para este paquete:</span>{" "}
                            {iniciosValidos.length > 0 ? iniciosValidos.join(", ") : "sin bloque regular consecutivo"}
                          </div>
                          {isModeStrict && iniciosValidos.length === 0 && (
                            <div className="text-amber-700">Modo estricto: cambia fecha para encontrar bloque regular consecutivo.</div>
                          )}
                          {isModeMixed && manualEnabled && (
                            <div className="text-amber-700">Hora manual habilitada: si queda fuera de horario regular se marcará como adicional autorizado en la validación.</div>
                          )}
                        </>
                      )}
                      {!isModeFree && medicoId <= 0 && medicoIdsPaquete.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-semibold">Disponibilidad por médico del paquete:</div>
                          {disponibilidadPorMedico.map(({ medicoId: mid, availability: medAvail }) => {
                            const medico = medicos.find((m) => Number(m?.id || 0) === Number(mid));
                            const medicoNombre = medico
                              ? `${medico?.nombres || medico?.nombre || ""} ${medico?.apellidos || medico?.apellido || ""}`.trim()
                              : `Médico #${mid}`;
                            if (medAvail?.loading) {
                              return <div key={`disp-${row.id}-${mid}`} className="text-slate-500">• {medicoNombre}: consultando...</div>;
                            }
                            if (medAvail?.error) {
                              return <div key={`disp-${row.id}-${mid}`} className="text-rose-700">• {medicoNombre}: error de disponibilidad ({medAvail.error})</div>;
                            }
                            const libres = Array.isArray(medAvail?.horasLibres) ? medAvail.horasLibres : [];
                            const ocupadas = Array.isArray(medAvail?.horasOcupadas) ? medAvail.horasOcupadas : [];
                            return (
                              <div key={`disp-${row.id}-${mid}`}>
                                <span className="font-semibold">• {medicoNombre}:</span>{" "}
                                libres {libres.length > 0 ? libres.join(", ") : "sin horas libres"}; ocupadas {ocupadas.length > 0 ? ocupadas.join(", ") : "sin horas ocupadas"}.
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 text-lg font-bold text-right">
              Total: <span className="text-green-600">S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => {
                  setSelected([]);
                  setQuantities({});
                  setProgramacionPorPaquete({});
                }}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
              >
                Limpiar seleccion
              </button>
              <button
                onClick={addToCart}
                className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700"
              >
                Agregar al carrito
              </button>
              <button
                onClick={() => registrarCotizacion()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                {isEditingCotizacion ? "Actualizar cotizacion" : "Registrar cotizacion"}
              </button>
              <button
                onClick={() => registrarCotizacion({ irACobro: true })}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                {isEditingCotizacion ? "Actualizar y cobrar" : "Registrar y cobrar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
