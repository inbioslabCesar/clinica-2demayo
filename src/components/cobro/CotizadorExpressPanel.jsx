import { useEffect, useMemo, useState, useRef } from "react";
import Swal from "sweetalert2";
import { authFetch } from "../../utils/apiClient";
import { useQuoteCart } from "../../context/QuoteCartContext";
import { BASE_URL, getCachedAgendaSlotMinutes } from "../../config/config";
import { aplicarExclusionConsultaDelCarrito, detectarCruceConCarrito, secuenciarDetallesPacienteSinCruce, validarAgendaAntesDeCotizar } from "../../utils/agendaGuardCotizacion";
import { getReferenceHorarioFromCart } from "../../utils/cartScheduling";

function getLimaDate() {
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
}

function getLimaTime() {
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
}

function normalizeServiceType(value) {
  const base = String(value || "").toLowerCase().trim();
  if (base === "procedimientos") return "procedimiento";
  if (base === "rayos x" || base === "rayos_x") return "rayosx";
  return base || "otros";
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

function buildPackageComponents(pkg) {
  const items = Array.isArray(pkg?.items) ? pkg.items : [];
  const meta = parsePackageMeta(pkg?.meta);
  const montoClinicaFijo = Number(meta?.reparto_campana?.monto_clinica_fijo || 0);

  return items
    .map((it) => {
      const sourceType = normalizeServiceType(it?.source_type || it?.servicio_tipo || "procedimiento");
      const sourceId = Number(it?.source_id || it?.servicio_id || 0);
      const cantidad = Math.max(1, Number(it?.cantidad || 1));
      const precio = Number(it?.precio_lista_snapshot || it?.precio_unitario || 0);
      const subtotalBase = Number(it?.subtotal_snapshot || (precio * cantidad));
      return {
        source_type: sourceType,
        source_id: sourceId,
        examen_version_id: Number(it?.examen_version_id || 0) || null,
        servicio_tipo: sourceType,
        servicio_id: sourceId,
        descripcion_snapshot: String(it?.descripcion_snapshot || it?.descripcion || "Item"),
        descripcion: String(it?.descripcion_snapshot || it?.descripcion || "Item"),
        cantidad,
        precio_lista_snapshot: precio,
        precio_unitario: precio,
        subtotal_snapshot: Number(subtotalBase.toFixed(2)),
        subtotal: Number(subtotalBase.toFixed(2)),
        es_derivado: Boolean(it?.es_derivado),
        derivado: Boolean(it?.es_derivado),
        laboratorio_referencia: String(it?.laboratorio_referencia || ""),
        tipo_derivacion: String(it?.tipo_derivacion || ""),
        valor_derivacion: Number(it?.valor_derivacion || 0),
        medico_id: Number(it?.medico_id || 0) || null,
        honorario_regla: it?.honorario_regla || null,
        paquete_monto_clinica_fijo: montoClinicaFijo > 0 ? Number(montoClinicaFijo.toFixed(2)) : null,
      };
    })
    .filter((it) => it.servicio_id > 0 || String(it.descripcion || "").trim() !== "");
}

function normalizeHourHm(value) {
  const txt = String(value || "").trim();
  const match = txt.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeDateYmd(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2]}-${slash[1]}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function horaToMinutes(hm) {
  const v = normalizeHourHm(hm);
  if (!v) return Number.POSITIVE_INFINITY;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

function resolveAgendaStepMinutes() {
  const configured = Number(getCachedAgendaSlotMinutes() || 30);
  return Math.max(5, Math.min(120, Math.round(configured)));
}

function addDaysYmd(ymd, days) {
  const base = new Date(`${String(ymd || "").trim()}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(days || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function collectOccupiedHoursFromCart(cartItems, medicoId, fechaYmd) {
  const medico = Number(medicoId || 0);
  const fecha = normalizeDateYmd(fechaYmd);
  if (medico <= 0 || !fecha) return [];

  const horas = new Set();
  const items = Array.isArray(cartItems) ? cartItems : [];

  for (const item of items) {
    const medicoItem = Number(item?.medicoId || item?.consultaMedicoId || item?.medico_id || 0);
    const fechaItem = normalizeDateYmd(item?.fechaProgramada || item?.consultaFecha || item?.fecha_programada || "");
    const horaItem = normalizeHourHm(item?.horaProgramada || item?.consultaHora || item?.hora_programada || "");
    if (medicoItem === medico && fechaItem === fecha && horaItem) {
      horas.add(horaItem);
    }

    const componentes = Array.isArray(item?.componentes) ? item.componentes : [];
    for (const comp of componentes) {
      const medicoComp = Number(comp?.medico_id || comp?.medicoId || 0);
      const fechaComp = normalizeDateYmd(comp?.fecha_programada || comp?.fechaProgramada || fechaItem || "");
      const horaComp = normalizeHourHm(comp?.hora_programada || comp?.horaProgramada || horaItem || "");
      if (medicoComp === medico && fechaComp === fecha && horaComp) {
        horas.add(horaComp);
      }
    }
  }

  return Array.from(horas).sort((a, b) => horaToMinutes(a) - horaToMinutes(b));
}

function pickDefaultFreeHour({ horasLibres, cartItems, fechaYmd }) {
  const libres = Array.isArray(horasLibres)
    ? horasLibres.map((h) => normalizeHourHm(h)).filter(Boolean).sort((a, b) => horaToMinutes(a) - horaToMinutes(b))
    : [];
  if (libres.length === 0) return "";

  const referencia = getReferenceHorarioFromCart(cartItems);
  const fecha = normalizeDateYmd(fechaYmd);
  const horaReferencia = referencia?.fecha === fecha ? normalizeHourHm(referencia?.hora) : "";
  return horaReferencia && libres.includes(horaReferencia) ? horaReferencia : libres[0];
}

export default function CotizadorExpressPanel() {
  const { addItems, setPatient, cart } = useQuoteCart();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [medRows, setMedRows] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [query, setQuery] = useState("");
  const [fechaAgenda, setFechaAgenda] = useState(getLimaDate());
  const [identityMode, setIdentityMode] = useState("sin_datos");
  const [identityText, setIdentityText] = useState("");
  const [identityResolved, setIdentityResolved] = useState({
    patientId: 0,
    patientName: "Particular",
    dni: "",
    origen: "anonimo",
    historia: "",
  });
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [identityStatus, setIdentityStatus] = useState({
    type: "idle", // idle | checking | local | reniec | timeout | not_found | error
    message: "",
  });
  const identityTimerRef = useRef(null);
  const identityAbortRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      authFetch("api_tarifas.php", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ success: false })),
      authFetch("api_examenes_laboratorio.php?modo=cotizador", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ success: false })),
      authFetch("api_paquetes_perfiles.php?accion=activos&limit=80&include_items=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([tarifasData, examenesData, paquetesData]) => {
        if (!active) return;

        const tarifas = Array.isArray(tarifasData?.tarifas) ? tarifasData.tarifas : [];
        const examenes = Array.isArray(examenesData?.examenes) ? examenesData.examenes : [];
        const paquetes = Array.isArray(paquetesData?.rows) ? paquetesData.rows : [];

        const serviciosTarifas = tarifas
          .filter((t) => Number(t?.activo || 0) === 1)
          .map((t) => ({
            key: `tarifa-${t.id}`,
            source: "tarifas",
            serviceType: normalizeServiceType(t.servicio_tipo),
            serviceId: Number(t.id || 0),
            description: String(t.descripcion || "Servicio"),
            unitPrice: Number(t.precio_particular || 0),
            medicoId: Number(t.medico_id || 0),
            medicoNombre: [t.medico_nombre, t.medico_apellido].filter(Boolean).join(" ").trim(),
            medicoEspecialidad: String(t.medico_especialidad || "").trim(),
          }));

        const serviciosLab = examenes.map((e) => ({
          key: `lab-${e.id}`,
          source: "laboratorio",
          serviceType: "laboratorio",
          serviceId: Number(e.id || 0),
          description: String(e.nombre || "Examen de laboratorio"),
          unitPrice: Number(e.precio_publico || 0),
          medicoId: 0,
          medicoNombre: "",
          medicoEspecialidad: "",
        }));

        const serviciosPaquetes = paquetes.map((p) => {
          const componentes = buildPackageComponents(p);
          const medicos = Array.from(new Set(componentes.map((c) => Number(c?.medico_id || 0)).filter((id) => id > 0)));
          const medicoUnico = medicos.length === 1 ? medicos[0] : 0;
          return {
            key: `pkg-${p.id}`,
            source: "paquete",
            serviceType: String(p?.tipo || "paquete").toLowerCase() === "perfil" ? "perfil" : "paquete",
            serviceId: Number(p?.id || 0),
            description: String(p?.nombre || "Paquete/Perfil"),
            unitPrice: Number(p?.precio_global_venta || 0),
            medicoId: medicoUnico,
            medicoNombre: "",
            medicoEspecialidad: "",
            packageId: Number(p?.id || 0),
            packageCode: String(p?.codigo || ""),
            packageType: String(p?.tipo || "paquete"),
            componentes,
          };
        });

        setRows([...serviciosTarifas, ...serviciosLab, ...serviciosPaquetes]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const q = String(query || "").trim();
    if (q.length < 2) {
      setMedRows([]);
      setLoadingMeds(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setLoadingMeds(true);
      try {
        const res = await authFetch(`api_medicamentos.php?busqueda=${encodeURIComponent(q)}&limite=40`, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;

        const meds = Array.isArray(data) ? data : [];
        const next = meds
          .filter((m) => String(m?.estado || "activo").toLowerCase() === "activo")
          .map((m) => {
            const precioCompra = Number(m?.precio_compra || 0);
            const margen = Number(m?.margen_ganancia || 0);
            const precioVenta = Number((precioCompra * (1 + margen / 100)).toFixed(2));
            return {
              key: `med-${m.id}`,
              source: "farmacia",
              serviceType: "farmacia",
              serviceId: Number(m.id || 0),
              description: String(m.nombre || "Medicamento"),
              unitPrice: precioVenta,
              medicoId: 0,
              medicoNombre: "",
              medicoEspecialidad: "",
            };
          });
        setMedRows(next);
      } catch {
        if (!active) return;
        setMedRows([]);
      } finally {
        if (active) setLoadingMeds(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = String(query || "").toLowerCase().trim();
    const combinedRows = medRows.length > 0 ? [...rows, ...medRows] : rows;
    if (!q) return combinedRows.slice(0, 120);
    return combinedRows
      .filter((r) => {
        const txt = `${r.description} ${r.serviceType} ${r.medicoNombre} ${r.medicoEspecialidad} ${r.packageCode || ""}`.toLowerCase();
        return txt.includes(q);
      })
      .slice(0, 120);
  }, [query, rows, medRows]);

  const resolverIdentidad = async (textOverride, isManual = false) => {
    const rawValue = typeof textOverride === "string" ? textOverride : identityText;
    const value = String(rawValue || "").trim();

    if (identityMode === "sin_datos" || value === "") {
      setIdentityResolved({ patientId: 0, patientName: "Particular", dni: "", origen: "anonimo", historia: "" });
      setIdentityStatus({ type: "idle", message: "" });
      return;
    }

    if (identityMode === "dni") {
      const dniSanitizado = value.replace(/\D/g, "").slice(0, 8);
      if (dniSanitizado.length !== 8) {
        if (isManual) {
          Swal.fire({
            icon: "warning",
            title: "DNI incompleto",
            text: "Ingresa los 8 dígitos del DNI para consultar en RENIEC.",
          });
        }
        return;
      }

      clearTimeout(identityTimerRef.current);
      identityAbortRef.current?.abort();

      const controller = new AbortController();
      identityAbortRef.current = controller;
      setCheckingIdentity(true);
      setIdentityStatus({
        type: "checking",
        message: "Consultando RENIEC / Base local...",
      });

      const slowTimer = setTimeout(() => {
        setIdentityStatus((prev) => {
          if (prev.type === "checking") {
            return {
              ...prev,
              message: "Consultando RENIEC (red lenta, esperando respuesta...)",
            };
          }
          return prev;
        });
      }, 2200);

      try {
        const res = await authFetch("api_pacientes_buscar.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ tipo: "dni", valor: dniSanitizado }),
        });
        clearTimeout(slowTimer);

        const data = await res.json().catch(() => null);

        if (!data) {
          setIdentityStatus({
            type: "error",
            message: "No se pudo conectar con el servidor para verificar el DNI.",
          });
          return;
        }

        // Caso 1: Paciente existe en base de datos local
        if (data?.success && Array.isArray(data?.pacientes) && data.pacientes.length > 0) {
          const p = data.pacientes[0];
          const patientName = `${String(p?.nombre || "").trim()} ${String(p?.apellido || "").trim()}`.trim();
          setIdentityResolved({
            patientId: Number(p?.id || 0),
            patientName: patientName || "Paciente",
            dni: String(p?.dni || dniSanitizado).trim(),
            origen: "local",
            historia: String(p?.historia_clinica || "").trim(),
          });
          setIdentityStatus({
            type: "local",
            message: `Paciente registrado: ${patientName} (HC: ${p?.historia_clinica || "-"})`,
          });
          return;
        }

        // Caso 2: Datos encontrados en RENIEC
        const sugerencia = data?.fuente === "externa" && data?.sugerencia_externa
          ? data.sugerencia_externa
          : null;

        if (sugerencia) {
          const nom = String(sugerencia?.nombre || sugerencia?.nombres || "").trim();
          const ape = String(sugerencia?.apellido || "").trim() ||
            [sugerencia?.apellido_paterno, sugerencia?.apellido_materno].filter(Boolean).join(" ").trim();
          const patientName = `${nom} ${ape}`.trim();

          setIdentityResolved({
            patientId: 0,
            patientName: patientName || "Particular",
            dni: String(sugerencia?.dni || dniSanitizado).trim(),
            origen: "externa",
            historia: "",
          });
          setIdentityStatus({
            type: "reniec",
            message: `RENIEC: ${patientName} (datos obtenidos para cotizar)`,
          });
          return;
        }

        // Caso 3: Red lenta / timeout
        if (data?.red_lenta || data?.timeout) {
          setIdentityResolved({
            patientId: 0,
            patientName: "Particular",
            dni: dniSanitizado,
            origen: "temporal",
            historia: "",
          });
          setIdentityStatus({
            type: "timeout",
            message: "Tiempo de espera agotado al consultar RENIEC (red lenta).",
          });
          return;
        }

        // Caso 4: DNI no encontrado
        if (data?.not_found) {
          setIdentityResolved({
            patientId: 0,
            patientName: "Particular",
            dni: dniSanitizado,
            origen: "temporal",
            historia: "",
          });
          setIdentityStatus({
            type: "not_found",
            message: "DNI no encontrado en RENIEC ni base local. Se cotiza como Particular.",
          });
          return;
        }

        // Caso 5: Error o servicio no disponible
        const detalle = String(data?.detalle_externo || data?.error || "").trim();
        setIdentityResolved({
          patientId: 0,
          patientName: "Particular",
          dni: dniSanitizado,
          origen: "temporal",
          historia: "",
        });
        setIdentityStatus({
          type: "error",
          message: detalle ? `Aviso: ${detalle}` : "No se pudo consultar RENIEC. Puedes reintentar o cotizar como Particular.",
        });
      } catch (err) {
        clearTimeout(slowTimer);
        if (err?.name === "AbortError") return;
        setIdentityResolved({
          patientId: 0,
          patientName: "Particular",
          dni: dniSanitizado,
          origen: "temporal",
          historia: "",
        });
        setIdentityStatus({
          type: "error",
          message: "Error de red al consultar RENIEC. Verifica tu conexión y reintenta.",
        });
      } finally {
        setCheckingIdentity(false);
      }
      return;
    }

    // Modo Nombre referencial
    setCheckingIdentity(true);
    setIdentityStatus({ type: "checking", message: "Buscando coincidencias..." });
    try {
      const res = await authFetch("api_pacientes_buscar.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "nombre", valor: value }),
      });
      const data = await res.json().catch(() => null);

      if (data?.success && Array.isArray(data?.pacientes) && data.pacientes.length > 0) {
        const p = data.pacientes[0];
        const patientName = `${String(p?.nombre || "").trim()} ${String(p?.apellido || "").trim()}`.trim();
        setIdentityResolved({
          patientId: Number(p?.id || 0),
          patientName: patientName || "Paciente",
          dni: String(p?.dni || "").trim(),
          origen: "local",
          historia: String(p?.historia_clinica || "").trim(),
        });
        setIdentityStatus({
          type: "local",
          message: `Paciente registrado: ${patientName} (HC: ${p?.historia_clinica || "-"})`,
        });
      } else {
        setIdentityResolved({
          patientId: 0,
          patientName: value || "Particular",
          dni: "",
          origen: "temporal",
          historia: "",
        });
        setIdentityStatus({
          type: "idle",
          message: `Referencia: ${value} (Particular)`,
        });
      }
    } catch {
      setIdentityResolved({
        patientId: 0,
        patientName: value || "Particular",
        dni: "",
        origen: "temporal",
        historia: "",
      });
      setIdentityStatus({ type: "idle", message: "" });
    } finally {
      setCheckingIdentity(false);
    }
  };

  const handleIdentityChange = (e) => {
    const raw = e.target.value;
    if (identityMode === "dni") {
      const clean = raw.replace(/\D/g, "").slice(0, 8);
      setIdentityText(clean);
      clearTimeout(identityTimerRef.current);
      if (clean.length < 8) {
        setIdentityStatus({ type: "idle", message: "" });
        setIdentityResolved({ patientId: 0, patientName: "Particular", dni: clean, origen: "temporal", historia: "" });
      } else if (clean.length === 8) {
        identityTimerRef.current = setTimeout(() => {
          resolverIdentidad(clean, false);
        }, 450);
      }
    } else {
      setIdentityText(raw);
    }
  };

  const handleIdentityModeChange = (e) => {
    const nextMode = e.target.value;
    setIdentityMode(nextMode);
    setIdentityText("");
    setIdentityStatus({ type: "idle", message: "" });
    clearTimeout(identityTimerRef.current);
    identityAbortRef.current?.abort();

    if (nextMode === "sin_datos") {
      setIdentityResolved({ patientId: 0, patientName: "Particular", dni: "", origen: "anonimo", historia: "" });
    } else {
      setIdentityResolved({ patientId: 0, patientName: "Particular", dni: "", origen: "temporal", historia: "" });
    }
  };

  const seleccionarHorario = async (row) => {
    const medicoId = Number(row?.medicoId || 0);
    if (medicoId <= 0) return;
    const esConsulta = String(row?.serviceType || "").toLowerCase() === "consulta";
    const etiquetaServicio = esConsulta ? "consulta" : "servicio";

    const fetchDisponibilidad = async (fecha) => {
      const res = await authFetch(`api_horarios_disponibles.php?medico_id=${medicoId}&fecha=${encodeURIComponent(fecha)}`);
      const data = await res.json();
      const horasOcupadasCarrito = collectOccupiedHoursFromCart(cart?.items, medicoId, fecha);
      const ocupadasCarritoSet = new Set(horasOcupadasCarrito);
      const referencia = getReferenceHorarioFromCart(cart?.items);
      const horaAncla = referencia?.fecha === fecha ? normalizeHourHm(referencia?.hora) : "";
      const horasLibres = (Array.isArray(data?.horarios_disponibles) ? data.horarios_disponibles : [])
        .map((h) => normalizeHourHm(h?.hora || h?.hora_db || ""))
        .filter((h) => !ocupadasCarritoSet.has(h) || h === horaAncla)
        .filter(Boolean)
        .sort((a, b) => horaToMinutes(a) - horaToMinutes(b));
      const horasOcupadas = (Array.isArray(data?.horarios_ocupados) ? data.horarios_ocupados : [])
        .map((h) => normalizeHourHm(h))
        .filter(Boolean)
        .sort((a, b) => horaToMinutes(a) - horaToMinutes(b));

      const horasOcupadasTotales = Array.from(new Set([...horasOcupadas, ...horasOcupadasCarrito]))
        .sort((a, b) => horaToMinutes(a) - horaToMinutes(b));
      return { horasLibres, horasOcupadas: horasOcupadasTotales };
    };

    try {
      const hoy = getLimaDate();
      const referenciaCarrito = getReferenceHorarioFromCart(cart?.items);
      let fechaSeleccionada = normalizeDateYmd(referenciaCarrito?.fecha || fechaAgenda || hoy);

      const picked = await Swal.fire({
        title: `Elegir fecha y horario de ${etiquetaServicio}`,
        html: `
          <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
            <div><b>Servicio:</b> ${String(row?.description || "Consulta")}</div>
            <div><b>Médico:</b> ${String(row?.medicoNombre || "Médico")}</div>
            <div><b>Fecha:</b></div>
            <input id="swal-fecha-programada" type="date" class="swal2-input" style="margin:0;width:100%;" min="${hoy}" value="${fechaSeleccionada}" />
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="swal2-styled" data-quick-days="0" style="padding:4px 8px;font-size:11px;">Hoy</button>
              <button type="button" class="swal2-styled" data-quick-days="1" style="padding:4px 8px;font-size:11px;">Mañana</button>
              <button type="button" class="swal2-styled" data-quick-days="2" style="padding:4px 8px;font-size:11px;">+2 días</button>
              <button type="button" class="swal2-styled" data-quick-days="7" style="padding:4px 8px;font-size:11px;">+7 días</button>
            </div>
            <div id="swal-horas-libres-label"><b>Horas libres:</b></div>
            <select id="swal-hora-programada" class="swal2-input" style="margin:0;width:100%;">
              <option value="">Cargando...</option>
            </select>
            <div id="swal-manual-wrap" style="display:none;">
              <div><b>Hora referencial manual:</b></div>
              <input id="swal-hora-manual" type="time" class="swal2-input" style="margin:0;width:100%;" value="09:00" />
              <input id="swal-hora-context" type="hidden" value="manual-fallback" />
              <div id="swal-hora-manual-msg" style="margin-top:4px;color:#92400e;font-size:12px;">Sin horas libres en esta fecha. Se registrará como reserva sin turno para permitir agenda futura.</div>
            </div>
            <div id="swal-horas-ocupadas" style="line-height:1.3;"></div>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Agregar con horario",
        cancelButtonText: "Cancelar",
        didOpen: async () => {
          const fechaInput = document.getElementById("swal-fecha-programada");
          const select = document.getElementById("swal-hora-programada");
          const manualWrap = document.getElementById("swal-manual-wrap");
          const manualHoraInput = document.getElementById("swal-hora-manual");
          const manualContextInput = document.getElementById("swal-hora-context");
          const manualMsg = document.getElementById("swal-hora-manual-msg");
          const libresLabel = document.getElementById("swal-horas-libres-label");
          const ocupadasWrap = document.getElementById("swal-horas-ocupadas");
          const quickButtons = Array.from(document.querySelectorAll("button[data-quick-days]"));
          const confirmButton = Swal.getConfirmButton();

          const renderDisponibilidad = async (fecha) => {
            const fechaNorm = String(fecha || "").slice(0, 10);
            fechaSeleccionada = fechaNorm;
            if (fechaInput) fechaInput.value = fechaNorm;

            if (confirmButton) confirmButton.disabled = true;
            if (select) {
              select.innerHTML = "<option value=\"\">Cargando...</option>";
              select.disabled = true;
            }
            if (libresLabel) libresLabel.innerHTML = "<b>Horas libres:</b> consultando...";
            if (ocupadasWrap) ocupadasWrap.innerHTML = "";

            try {
              const { horasLibres, horasOcupadas } = await fetchDisponibilidad(fechaNorm);
              if (libresLabel) {
                libresLabel.innerHTML = `<b>Horas libres (${horasLibres.length}):</b>`;
              }

              if (select) {
                if (horasLibres.length === 0) {
                  select.innerHTML = "<option value=\"\">Sin horas libres para esta fecha</option>";
                  select.disabled = true;
                  if (manualWrap) manualWrap.style.display = "block";
                  if (manualContextInput) manualContextInput.value = "manual-fallback";
                  if (manualMsg) manualMsg.innerHTML = "Sin horas libres en esta fecha. Se registrará como reserva sin turno para permitir agenda futura.";
                  if (manualHoraInput && !normalizeHourHm(manualHoraInput.value || "")) {
                    manualHoraInput.value = "09:00";
                  }
                } else {
                  select.innerHTML = horasLibres.map((h) => `<option value="${h}">${h}</option>`).join("");
                  const sugerida = pickDefaultFreeHour({
                    horasLibres,
                    cartItems: cart?.items,
                    fechaYmd: fechaNorm,
                  });
                  select.value = sugerida || horasLibres[0];
                  select.disabled = false;
                  if (manualWrap) manualWrap.style.display = "none";
                  if (manualContextInput) manualContextInput.value = "regular";
                }
              }

              if (ocupadasWrap) {
                const ocupadasTexto = horasOcupadas.length > 0 ? horasOcupadas.join(" · ") : "Sin horas programadas";
                ocupadasWrap.innerHTML = `<b>Horas programadas/ocupadas (${horasOcupadas.length}):</b> ${ocupadasTexto}`;
              }

              if (confirmButton) confirmButton.disabled = false;
            } catch {
              if (libresLabel) libresLabel.innerHTML = "<b>Horas libres:</b> no disponible";
              if (select) {
                select.innerHTML = "<option value=\"\">No se pudo cargar disponibilidad</option>";
                select.disabled = true;
              }
              if (manualWrap) manualWrap.style.display = "block";
              if (ocupadasWrap) ocupadasWrap.innerHTML = "<b>Horas programadas/ocupadas:</b> no disponible";
              if (confirmButton) confirmButton.disabled = false;
            }
          };

          fechaInput?.addEventListener("change", () => {
            const next = String(fechaInput.value || "").slice(0, 10);
            if (!next) return;
            renderDisponibilidad(next);
          });

          quickButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
              const days = Number(btn.getAttribute("data-quick-days") || 0);
              const next = addDaysYmd(hoy, days);
              if (!next) return;
              renderDisponibilidad(next);
            });
          });

          await renderDisponibilidad(fechaSeleccionada);
        },
        preConfirm: () => {
          const fecha = String(document.getElementById("swal-fecha-programada")?.value || "").slice(0, 10);
          const horaLibre = normalizeHourHm(document.getElementById("swal-hora-programada")?.value || "");
          const horaManual = normalizeHourHm(document.getElementById("swal-hora-manual")?.value || "");
          const hora = horaLibre || horaManual;
          const reservaSinTurno = !horaLibre;
          if (!fecha) {
            Swal.showValidationMessage("Selecciona una fecha válida");
            return false;
          }
          if (!hora) {
            Swal.showValidationMessage("Selecciona un horario válido o ingresa una hora manual");
            return false;
          }
          return { fecha, hora, reservaSinTurno };
        },
      });

      if (!picked.isConfirmed || !picked.value?.hora || !picked.value?.fecha) {
        return;
      }

      await agregarItem(row, {
        horaProgramada: picked.value.hora,
        fechaProgramada: picked.value.fecha,
        consultaTipoConsulta: picked.value.reservaSinTurno ? "reservada_sin_turno" : "programada",
        adicionalAutorizado: false,
      });
    } catch {
      await Swal.fire("Atención", "No se pudo consultar la disponibilidad del médico.", "warning");
    }
  };

  const agregarItem = async (row, opts = {}) => {
    let patientId = Number(identityResolved?.patientId || 0);
    let patientName = String(identityResolved?.patientName || "Particular").trim() || "Particular";
    let patientDni = String(identityResolved?.dni || "").trim();
    const hasMedico = Number(row?.medicoId || 0) > 0;
    const esConsulta = String(row?.serviceType || "").toLowerCase() === "consulta";

    // Todo servicio con médico debe elegir un horario explícito para evitar
    // que quede con la hora de creación de la cotización por defecto.
    if (hasMedico && !normalizeHourHm(opts?.horaProgramada || "")) {
      seleccionarHorario(row);
      return;
    }

    const fechaProgramada = hasMedico ? normalizeDateYmd(opts?.fechaProgramada || fechaAgenda || "") : "";
    const horaProgramada = hasMedico
      ? normalizeHourHm(opts?.horaProgramada || "") || ""
      : "";
    let fechaProgramadaFinal = fechaProgramada;
    let horaProgramadaFinal = horaProgramada;
    let adicionalAutorizadoFinal = Boolean(opts?.adicionalAutorizado);

    if (hasMedico) {
      const detalleSecuenciado = secuenciarDetallesPacienteSinCruce({
        detalles: [{
          servicio_tipo: String(row?.serviceType || ""),
          medico_id: Number(row?.medicoId || 0),
          fecha_programada: fechaProgramadaFinal,
          hora_programada: horaProgramadaFinal,
        }],
        cartItems: cart?.items,
        fallbackFecha: fechaProgramadaFinal || fechaAgenda || getLimaDate(),
        fallbackHora: horaProgramadaFinal || getLimaTime(),
        stepMinutes: resolveAgendaStepMinutes(),
      })[0];

      const fechaSec = String(detalleSecuenciado?.fecha_programada || "").slice(0, 10);
      const horaSec = normalizeHourHm(detalleSecuenciado?.hora_programada || "");
      if (fechaSec) fechaProgramadaFinal = fechaSec;
      if (horaSec) horaProgramadaFinal = horaSec;
    }

    const cartHasItems = Array.isArray(cart?.items) && cart.items.length > 0;
    const cartPatientId = Number(cart?.patientId || 0);

    // Si el usuario opera en modo "Sin datos" pero ya existe un paciente en carrito,
    // heredar ese contexto para mantener continuidad operativa.
    if (cartHasItems && patientId <= 0 && cartPatientId > 0) {
      patientId = cartPatientId;
      patientName = String(cart?.patientName || patientName || "Paciente").trim() || "Paciente";
      patientDni = String(cart?.patientDni || patientDni || "").trim();
    }

    if (cartHasItems && cartPatientId > 0 && patientId > 0 && cartPatientId !== patientId) {
      Swal.fire("Carrito en uso", "El carrito ya tiene otro paciente/contexto. Vacía el carrito o conserva el mismo paciente.", "info");
      return;
    }

    if (patientId > 0) {
      setPatient(patientId, patientName, patientDni);
    } else {
      setPatient(0, patientName, patientDni);
    }

    const cruceEnCarrito = detectarCruceConCarrito({
      cartItems: cart?.items,
      nuevosDetalles: [{
        servicio_tipo: String(row?.serviceType || ""),
        medico_id: Number(row?.medicoId || 0),
        fecha_programada: fechaProgramadaFinal,
        hora_programada: horaProgramadaFinal,
      }],
    });
    if (cruceEnCarrito) {
      await Swal.fire(
        "Cruce en carrito",
        `Ya existe un servicio en el carrito para el mismo médico y horario (${fechaProgramadaFinal} ${horaProgramadaFinal}). Ajusta la hora antes de agregar.`,
        "warning"
      );
      return;
    }

    if (hasMedico && fechaProgramadaFinal && horaProgramadaFinal) {
      const agendaCheck = await validarAgendaAntesDeCotizar({
        authFetch,
        baseUrl: BASE_URL,
        Swal,
        entries: aplicarExclusionConsultaDelCarrito([{
          tipo: String(row?.serviceType || ""),
          medicoId: Number(row?.medicoId || 0),
          fecha: fechaProgramadaFinal,
          hora: horaProgramadaFinal,
        }], cart?.items),
        onApplySuggestion: (_entry, nuevaHora, nuevaFecha, meta = {}) => {
          fechaProgramadaFinal = String(nuevaFecha || fechaProgramadaFinal || "").slice(0, 10);
          horaProgramadaFinal = String(nuevaHora || horaProgramadaFinal || "").slice(0, 5);
          if (meta?.isAdicional) {
            adicionalAutorizadoFinal = true;
          }
        },
        isHourBlocked: (entry, hourCandidate, fechaCandidate) => {
          const medicoEntry = Number(entry?.medicoId || 0);
          const fechaEntry = String(fechaCandidate || entry?.fecha || "").slice(0, 10);
          const horaEntry = normalizeHourHm(hourCandidate || "");
          if (medicoEntry <= 0 || !fechaEntry || !horaEntry) return false;
          const referencia = getReferenceHorarioFromCart(cart?.items);
          if (referencia?.fecha === fechaEntry && normalizeHourHm(referencia?.hora) === horaEntry) {
            return false;
          }
          const ocupadasCarrito = collectOccupiedHoursFromCart(cart?.items, medicoEntry, fechaEntry);
          return ocupadasCarrito.includes(horaEntry);
        },
      });
      if (!agendaCheck?.ok) {
        return;
      }

      const cruceRevalidado = detectarCruceConCarrito({
        cartItems: cart?.items,
        nuevosDetalles: [{
          servicio_tipo: String(row?.serviceType || ""),
          medico_id: Number(row?.medicoId || 0),
          fecha_programada: fechaProgramadaFinal,
          hora_programada: horaProgramadaFinal,
        }],
      });
      if (cruceRevalidado) {
        await Swal.fire(
          "Horario ya tomado",
          `La hora ${horaProgramadaFinal} ya está ocupada en el carrito para ese médico. Selecciona otra hora.`,
          "warning"
        );
        return;
      }
    }

    addItems({
      patientId,
      patientName,
      patientDni,
      items: [
        {
          serviceType: row.serviceType,
          serviceId: row.serviceId,
          description: adicionalAutorizadoFinal && !/adicional autorizado/i.test(String(row.description || ""))
            ? `${String(row.description || "").trim()} · Adicional autorizado`
            : row.description,
          unitPrice: row.unitPrice,
          quantity: 1,
          source: row.source,
          medicoId: Number(row.medicoId || 0),
          medicoNombre: String(row.medicoNombre || "").trim(),
          fechaProgramada: fechaProgramadaFinal,
          horaProgramada: horaProgramadaFinal,
          consultaMedicoId: row.serviceType === "consulta" ? Number(row.medicoId || 0) : null,
          consultaFecha: row.serviceType === "consulta" && row.medicoId ? fechaProgramadaFinal : "",
          consultaHora: row.serviceType === "consulta" && row.medicoId ? horaProgramadaFinal : "",
          consultaTipoConsulta: row.serviceType === "consulta"
            ? String(opts?.consultaTipoConsulta || "programada")
            : "",
          observacionProgramacion: adicionalAutorizadoFinal ? "Adicional autorizado por recepción" : "",
          adicionalAutorizado: adicionalAutorizadoFinal,
          packageId: Number(row.packageId || 0) || null,
          packageCode: String(row.packageCode || ""),
          packageType: String(row.packageType || ""),
          componentes: Array.isArray(row.componentes) ? row.componentes : [],
          cotizacionId: Number(row.cotizacionId || 0) || null,
        },
      ],
    });

    if (hasMedico && esConsulta) {
      Swal.fire("Consulta programada", `Se agregó ${row.description} para ${fechaProgramadaFinal} ${horaProgramadaFinal}.`, "success");
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-emerald-900">Cotizador Express (precio primero)</h3>
        <div className="text-xs text-emerald-700">Cotiza sin registro obligatorio al inicio</div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_auto]">
        <select
          value={identityMode}
          onChange={handleIdentityModeChange}
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm bg-white font-medium text-emerald-950"
        >
          <option value="sin_datos">Sin datos del paciente</option>
          <option value="dni">DNI</option>
          <option value="nombre">Nombre referencial</option>
        </select>

        <div className="relative">
          <input
            type="text"
            value={identityText}
            onChange={handleIdentityChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                resolverIdentidad(identityText, true);
              }
            }}
            placeholder={identityMode === "dni" ? "DNI del paciente (8 dígitos)" : "Nombre referencial"}
            disabled={identityMode === "sin_datos"}
            maxLength={identityMode === "dni" ? 8 : 100}
            inputMode={identityMode === "dni" ? "numeric" : "text"}
            className="w-full rounded-lg border border-emerald-200 px-3 py-2 pr-9 text-sm disabled:bg-gray-100 font-medium"
          />
          {checkingIdentity && (
            <div className="absolute right-2.5 top-2.5 flex items-center pointer-events-none" title="Consultando...">
              <svg className="animate-spin h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => resolverIdentidad(identityText, true)}
          disabled={checkingIdentity || (identityMode === "dni" && identityText.length !== 8)}
          className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
        >
          {checkingIdentity ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Buscando...</span>
            </>
          ) : identityMode === "dni" ? (
            <>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Buscar RENIEC</span>
            </>
          ) : (
            "Aplicar"
          )}
        </button>
      </div>

      {identityStatus.message && (
        <div
          className={`mt-2 rounded-lg p-2 text-xs flex items-center justify-between gap-2 shadow-sm ${
            identityStatus.type === "local"
              ? "bg-emerald-100 border border-emerald-300 text-emerald-900"
              : identityStatus.type === "reniec"
              ? "bg-blue-50 border border-blue-300 text-blue-900"
              : identityStatus.type === "checking"
              ? "bg-sky-50 border border-sky-300 text-sky-900"
              : identityStatus.type === "timeout" || identityStatus.type === "error"
              ? "bg-amber-50 border border-amber-300 text-amber-900"
              : "bg-slate-100 border border-slate-300 text-slate-800"
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {identityStatus.type === "checking" && (
              <svg className="animate-spin h-3.5 w-3.5 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {identityStatus.type === "local" && <span className="text-emerald-700 font-bold shrink-0">✓</span>}
            {identityStatus.type === "reniec" && <span className="text-blue-700 font-bold shrink-0">✓</span>}
            {(identityStatus.type === "timeout" || identityStatus.type === "error") && (
              <span className="text-amber-700 font-bold shrink-0">⚠️</span>
            )}
            <span className="font-medium truncate">{identityStatus.message}</span>
          </div>

          {(identityStatus.type === "timeout" || identityStatus.type === "error") && (
            <button
              type="button"
              onClick={() => resolverIdentidad(identityText, true)}
              disabled={checkingIdentity}
              className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700 shadow-sm shrink-0 inline-flex items-center gap-1"
            >
              <span>🔄</span> Reintentar
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
        <span>Contexto:</span>
        <b className="text-slate-900">{identityResolved.patientName}</b>
        {identityResolved.dni && (
          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-slate-800">
            DNI: {identityResolved.dni}
          </span>
        )}
        {identityResolved.origen === "local" ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
            Registrado en clínica {identityResolved.historia ? `(HC: ${identityResolved.historia})` : ""}
          </span>
        ) : identityResolved.origen === "externa" ? (
          <span className="rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
            Validado con RENIEC
          </span>
        ) : identityResolved.origen === "anonimo" ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            Sin datos / Anónimo
          </span>
        ) : (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
            Particular / Temporal
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar consulta, medico, ecografia, laboratorio, medicamento..."
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={fechaAgenda}
          onChange={(e) => setFechaAgenda(e.target.value)}
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm"
          title="Fecha para sugerir disponibilidad médica"
        />
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-emerald-100 bg-white">
        {loading ? (
          <div className="p-3 text-sm text-slate-500">Cargando servicios...</div>
        ) : loadingMeds ? (
          <div className="p-3 text-sm text-slate-500">Buscando medicamentos...</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-slate-500">Sin resultados</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const hasMedico = Number(row.medicoId || 0) > 0;
              return (
                <li key={row.key} className="p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{row.description}</div>
                      <div className="text-xs text-slate-500">
                        {row.serviceType}
                        {hasMedico ? ` | ${row.medicoNombre || "Médico"}${row.medicoEspecialidad ? ` (${row.medicoEspecialidad})` : ""}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-700">S/ {Number(row.unitPrice || 0).toFixed(2)}</div>
                      <div className="mt-1 flex gap-1 justify-end">
                        {hasMedico ? (
                          <button
                            type="button"
                            onClick={() => seleccionarHorario(row)}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
                          >
                            Elegir horario
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => agregarItem(row)}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
