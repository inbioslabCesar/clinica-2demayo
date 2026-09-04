import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { authFetch } from "../../utils/apiClient";
import { useQuoteCart } from "../../context/QuoteCartContext";

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

function horaToMinutes(hm) {
  const v = normalizeHourHm(hm);
  if (!v) return Number.POSITIVE_INFINITY;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
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
  });
  const [checkingIdentity, setCheckingIdentity] = useState(false);

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

  const resolverIdentidad = async () => {
    const value = String(identityText || "").trim();

    if (identityMode === "sin_datos" || value === "") {
      setIdentityResolved({ patientId: 0, patientName: "Particular", dni: "", origen: "anonimo" });
      return;
    }

    setCheckingIdentity(true);
    try {
      const tipo = identityMode === "dni" ? "dni" : "nombre";
      const res = await authFetch("api_pacientes_buscar.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: value }),
      });
      const data = await res.json();

      if (data?.success && Array.isArray(data?.pacientes) && data.pacientes.length > 0) {
        const p = data.pacientes[0];
        const patientName = `${String(p?.nombre || "").trim()} ${String(p?.apellido || "").trim()}`.trim();
        setIdentityResolved({
          patientId: Number(p?.id || 0),
          patientName: patientName || "Paciente",
          dni: String(p?.dni || "").trim(),
          origen: "local",
        });
        return;
      }

      const sugerencia = data?.sugerencia_externa;
      if (tipo === "dni" && sugerencia) {
        const patientName = `${String(sugerencia?.nombre || "").trim()} ${String(sugerencia?.apellido || "").trim()}`.trim();
        setIdentityResolved({
          patientId: 0,
          patientName: patientName || "Particular",
          dni: String(sugerencia?.dni || value).trim(),
          origen: "externa",
        });
      } else {
        setIdentityResolved({
          patientId: 0,
          patientName: identityMode === "nombre" ? value : "Particular",
          dni: identityMode === "dni" ? value : "",
          origen: "temporal",
        });
      }
    } catch {
      setIdentityResolved({
        patientId: 0,
        patientName: identityMode === "nombre" ? value : "Particular",
        dni: identityMode === "dni" ? value : "",
        origen: "temporal",
      });
    } finally {
      setCheckingIdentity(false);
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
      const horasLibres = (Array.isArray(data?.horarios_disponibles) ? data.horarios_disponibles : [])
        .map((h) => normalizeHourHm(h?.hora || h?.hora_db || ""))
        .filter(Boolean)
        .sort((a, b) => horaToMinutes(a) - horaToMinutes(b));
      const horasOcupadas = (Array.isArray(data?.horarios_ocupados) ? data.horarios_ocupados : [])
        .map((h) => normalizeHourHm(h))
        .filter(Boolean)
        .sort((a, b) => horaToMinutes(a) - horaToMinutes(b));

      return { horasLibres, horasOcupadas };
    };

    try {
      const hoy = getLimaDate();
      let fechaSeleccionada = String(fechaAgenda || hoy).slice(0, 10);

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
              <div style="margin-top:4px;color:#92400e;font-size:12px;">Sin horas libres en esta fecha. Se registrará como reserva sin turno para permitir agenda futura.</div>
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
                  if (manualHoraInput && !normalizeHourHm(manualHoraInput.value || "")) {
                    manualHoraInput.value = "09:00";
                  }
                } else {
                  select.innerHTML = horasLibres.map((h) => `<option value=\"${h}\">${h}</option>`).join("");
                  select.value = horasLibres[0];
                  select.disabled = false;
                  if (manualWrap) manualWrap.style.display = "none";
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

      agregarItem(row, {
        horaProgramada: picked.value.hora,
        fechaProgramada: picked.value.fecha,
        consultaTipoConsulta: picked.value.reservaSinTurno ? "reservada_sin_turno" : "programada",
      });
    } catch {
      await Swal.fire("Atención", "No se pudo consultar la disponibilidad del médico.", "warning");
    }
  };

  const agregarItem = (row, opts = {}) => {
    const patientId = Number(identityResolved?.patientId || 0);
    const patientName = String(identityResolved?.patientName || "Particular").trim() || "Particular";
    const patientDni = String(identityResolved?.dni || "").trim();
    const hasMedico = Number(row?.medicoId || 0) > 0;
    const esConsulta = String(row?.serviceType || "").toLowerCase() === "consulta";

    // Todo servicio con médico debe elegir un horario explícito para evitar
    // que quede con la hora de creación de la cotización por defecto.
    if (hasMedico && !normalizeHourHm(opts?.horaProgramada || "")) {
      seleccionarHorario(row);
      return;
    }

    const fechaProgramada = hasMedico ? String(opts?.fechaProgramada || fechaAgenda || "").slice(0, 10) : "";
    const horaProgramada = hasMedico
      ? normalizeHourHm(opts?.horaProgramada || "") || ""
      : "";

    if (cart?.items?.length > 0 && Number(cart?.patientId || 0) !== patientId) {
      Swal.fire("Carrito en uso", "El carrito ya tiene otro paciente/contexto. Vacía el carrito o conserva el mismo paciente.", "info");
      return;
    }

    if (patientId > 0) {
      setPatient(patientId, patientName, patientDni);
    } else {
      setPatient(0, patientName, patientDni);
    }

    addItems({
      patientId,
      patientName,
      patientDni,
      items: [
        {
          serviceType: row.serviceType,
          serviceId: row.serviceId,
          description: row.description,
          unitPrice: row.unitPrice,
          quantity: 1,
          source: row.source,
          medicoId: Number(row.medicoId || 0),
          medicoNombre: String(row.medicoNombre || "").trim(),
          fechaProgramada,
          horaProgramada,
          consultaMedicoId: row.serviceType === "consulta" ? Number(row.medicoId || 0) : null,
          consultaFecha: row.serviceType === "consulta" && row.medicoId ? fechaProgramada : "",
          consultaHora: row.serviceType === "consulta" && row.medicoId ? horaProgramada : "",
          consultaTipoConsulta: row.serviceType === "consulta"
            ? String(opts?.consultaTipoConsulta || "programada")
            : "",
          packageId: Number(row.packageId || 0) || null,
          packageCode: String(row.packageCode || ""),
          packageType: String(row.packageType || ""),
          componentes: Array.isArray(row.componentes) ? row.componentes : [],
          cotizacionId: Number(row.cotizacionId || 0) || null,
        },
      ],
    });

    if (hasMedico && esConsulta) {
      Swal.fire("Consulta programada", `Se agregó ${row.description} para ${fechaProgramada} ${horaProgramada}.`, "success");
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
          onChange={(e) => setIdentityMode(e.target.value)}
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm"
        >
          <option value="sin_datos">Sin datos del paciente</option>
          <option value="dni">DNI</option>
          <option value="nombre">Nombre referencial</option>
        </select>
        <input
          type="text"
          value={identityText}
          onChange={(e) => setIdentityText(e.target.value)}
          placeholder={identityMode === "dni" ? "DNI del paciente" : "Nombre referencial"}
          disabled={identityMode === "sin_datos"}
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm disabled:bg-gray-100"
        />
        <button
          type="button"
          onClick={resolverIdentidad}
          disabled={checkingIdentity}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {checkingIdentity ? "Verificando..." : "Aplicar"}
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-700">
        Contexto: <b>{identityResolved.patientName}</b>
        {identityResolved.dni ? ` | DNI: ${identityResolved.dni}` : ""}
        {identityResolved.patientId > 0 ? ` | ID local: ${identityResolved.patientId}` : " | Temporal"}
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
                const esConsulta = String(row.serviceType || "").toLowerCase() === "consulta";
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
