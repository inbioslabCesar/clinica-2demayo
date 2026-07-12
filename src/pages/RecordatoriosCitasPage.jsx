import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../utils/apiClient";
import Swal from "sweetalert2";
import QuickAccessNav from "../components/comunes/QuickAccessNav";

const ESTADOS_GESTION = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "contactado", label: "Contactado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "no_contesta", label: "No contesta" },
  { value: "reprogramar", label: "Reprogramar" },
  { value: "cancelado", label: "Cancelado" },
];

const ORDER_STORAGE_KEY = "recordatorios_citas_orden_v1";

function estadoBadgeClasses(estado) {
  switch (estado) {
    case "confirmado":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "contactado":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "no_contesta":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "reprogramar":
      return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
    case "cancelado":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  const d = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFechaHora(fecha, hora) {
  if (!fecha) return "-";
  const hh = String(hora || "").slice(0, 5);
  return `${formatFecha(fecha)} ${hh || ""}`.trim();
}

function diasParaCita(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const target = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - hoy.getTime();
  return Math.floor(ms / 86400000);
}

function estadoLabel(estado) {
  switch (estado) {
    case "contactado":
      return "Contactado";
    case "confirmado":
      return "Confirmado";
    case "no_contesta":
      return "No contesta";
    case "reprogramar":
      return "Reprogramar";
    case "cancelado":
      return "Cancelado";
    default:
      return "Pendiente";
  }
}








function consultaAtendidaEnHC(item) {
  return Number(item?.hc_tiene_registro || 0) === 1;
}

function esRecordatorioFaltaCancelar(item) {
  return String(item?.recordatorio_tipo || "") === "falta_cancelar";
}

function esRecordatorioAgendaServicio(item) {
  return String(item?.origen_consulta || "") === "agenda_servicio" && Number(item?.cotizacion_id || 0) > 0;
}

function compararFechaHoraItem(a, b) {
  const fa = `${String(a?.fecha || "")} ${String(a?.hora || "").slice(0, 5)}`;
  const fb = `${String(b?.fecha || "")} ${String(b?.hora || "").slice(0, 5)}`;
  return fa.localeCompare(fb);
}

function parseFechaHora(item) {
  const fecha = String(item?.fecha || "").trim();
  const hora = String(item?.hora || "").trim().slice(0, 5) || "00:00";
  if (!fecha) return null;
  const d = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function minutosDistancia(a, b) {
  const da = parseFechaHora(a);
  const db = parseFechaHora(b);
  if (!da || !db) return Number.POSITIVE_INFINITY;
  return Math.abs(da.getTime() - db.getTime()) / 60000;
}

function servicioTokensDesdeItem(item) {
  const raw = String(item?.servicios_label || "").trim();
  if (raw) {
    return raw
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const fallback = String(tipoServicioLabel(item)).trim();
  return fallback ? [fallback] : [];
}

function consolidarPagoGrupo(agendas) {
  const lista = Array.isArray(agendas) ? agendas : [];
  const conCobro = lista.filter((item) => Number(item?.cotizacion_id || 0) > 0 || Number(item?.saldo_pendiente || 0) > 0 || ["pagado", "pagada", "control"].includes(String(item?.cotizacion_estado || "").toLowerCase()));
  const saldoPositivo = conCobro.find((item) => Number(item?.saldo_pendiente || 0) > 0) || null;
  const pagado = conCobro.find((item) => ["pagado", "pagada", "control"].includes(String(item?.cotizacion_estado || "").toLowerCase()) && Number(item?.saldo_pendiente || 0) <= 0) || null;
  const conCotizacion = conCobro.find((item) => Number(item?.cotizacion_id || 0) > 0) || null;

  if (saldoPositivo) {
    return {
      saldo_pendiente: Number(saldoPositivo.saldo_pendiente || 0),
      cotizacion_estado: String(saldoPositivo.cotizacion_estado || "").toLowerCase(),
      cotizacion_id: Number(saldoPositivo.cotizacion_id || 0),
    };
  }

  if (pagado) {
    return {
      saldo_pendiente: 0,
      cotizacion_estado: String(pagado.cotizacion_estado || "pagado").toLowerCase(),
      cotizacion_id: Number(pagado.cotizacion_id || 0),
    };
  }

  if (conCotizacion) {
    return {
      saldo_pendiente: Number(conCotizacion.saldo_pendiente || 0),
      cotizacion_estado: String(conCotizacion.cotizacion_estado || "").toLowerCase(),
      cotizacion_id: Number(conCotizacion.cotizacion_id || 0),
    };
  }

  return {
    saldo_pendiente: 0,
    cotizacion_estado: "",
    cotizacion_id: 0,
  };
}

function agruparRecordatoriosAgendaServicio(items) {
  const grupos = new Map();
  const salida = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!esRecordatorioAgendaServicio(item)) {
      salida.push({ ...item });
      continue;
    }

    const key = `cotizacion-${Number(item.cotizacion_id || 0)}`;
    const existente = grupos.get(key);
    if (!existente) {
      const base = { ...item, _agenda_items: [{ ...item }] };
      grupos.set(key, base);
      salida.push(base);
      continue;
    }

    existente._agenda_items.push({ ...item });
  }

  // Unir consulta del mismo paciente (origen cotizador, sin cotizacion_id) al paquete
  // cuando cae cercana en tiempo a un grupo agenda_servicio del mismo paciente.
  for (let i = 0; i < salida.length; i += 1) {
    const item = salida[i];
    if (esRecordatorioAgendaServicio(item)) continue;

    const esConsultaCotizador =
      String(item?.servicio_tipo || "").toLowerCase().trim() === "consulta"
      && String(item?.origen_consulta || "") !== "agenda_servicio";

    if (!esConsultaCotizador) continue;

    let mejorGrupo = null;
    let mejorDistancia = Number.POSITIVE_INFINITY;
    let mejorCoincideCotizacion = false;
    const cotizacionItem = Number(item?.cotizacion_id || 0);
    for (const candidato of salida) {
      if (!esRecordatorioAgendaServicio(candidato)) continue;
      const mismoPaciente = Number(candidato?.paciente_id || 0) > 0 && Number(candidato?.paciente_id || 0) === Number(item?.paciente_id || 0);
      if (!mismoPaciente) continue;
      const tienePaquete = String(candidato?.servicios_label || "").includes("+");
      if (!tienePaquete) continue;

      const cotizacionCandidato = Number(candidato?.cotizacion_id || 0);
      const coincideCotizacion = cotizacionItem > 0 && cotizacionCandidato > 0 && cotizacionItem === cotizacionCandidato;
      const distancia = coincideCotizacion ? 0 : minutosDistancia(candidato, item);

      if (coincideCotizacion) {
        mejorGrupo = candidato;
        mejorDistancia = 0;
        mejorCoincideCotizacion = true;
        break;
      }

      if (distancia < mejorDistancia) {
        mejorDistancia = distancia;
        mejorGrupo = candidato;
      }
    }

    // Ventana amplia para cubrir caso típico: consulta hoy y servicios programados después.
    if (mejorGrupo && (mejorCoincideCotizacion || mejorDistancia <= (30 * 24 * 60))) {
      const agendaItems = Array.isArray(mejorGrupo._agenda_items) ? mejorGrupo._agenda_items : [{ ...mejorGrupo }];
      agendaItems.push({ ...item, _fusionado_desde_consulta: true });
      mejorGrupo._agenda_items = agendaItems;
      salida.splice(i, 1);
      i -= 1;
    }
  }

  for (const item of salida) {
    const agendas = Array.isArray(item._agenda_items) ? [...item._agenda_items] : [];
    if (agendas.length <= 1) {
      if (agendas.length === 1) {
        const unico = agendas[0];
        item.servicios_label = String(unico.servicios_label || item.servicios_label || "").trim();
      }
      continue;
    }

    agendas.sort(compararFechaHoraItem);
    const agendasReferencia = agendas.filter((ag) => !ag?._fusionado_desde_consulta);
    const agendasBase = agendasReferencia.length > 0 ? agendasReferencia : agendas;
    const serviciosTokens = agendas.flatMap(servicioTokensDesdeItem);
    const serviciosUnicos = Array.from(new Set(serviciosTokens));
    const medicosUnicos = Array.from(new Set(agendas.map((ag) => `${String(ag.medico_nombre || "").trim()} ${String(ag.medico_apellido || "").trim()}`.trim()).filter(Boolean)));
    const primerAgendaConMedico = agendas.find((ag) => `${String(ag.medico_nombre || "").trim()} ${String(ag.medico_apellido || "").trim()}`.trim() !== "") || null;
    const fechasUnicas = Array.from(new Set(agendasBase.map((ag) => String(ag.fecha || "").trim()).filter(Boolean)));
    const pagoConsolidado = consolidarPagoGrupo(agendas);

    item.servicio_tipo = "paquete";
    item.servicios_label = serviciosUnicos.join(" + ") || "Paquete";
    item.agendas_count = agendasBase.length;
    item.servicios_count = serviciosUnicos.length;
    item.fechas_count = fechasUnicas.length;
    item.medico_nombre = medicosUnicos.length > 1 ? "Varios" : (primerAgendaConMedico?.medico_nombre || agendasBase[0]?.medico_nombre || item.medico_nombre || "");
    item.medico_apellido = medicosUnicos.length > 1 ? "médicos" : (primerAgendaConMedico?.medico_apellido || agendasBase[0]?.medico_apellido || item.medico_apellido || "");
    item.fecha = agendasBase[0]?.fecha || item.fecha || "";
    item.hora = agendasBase[0]?.hora || item.hora || "";
    item.fecha_fin = agendasBase[agendasBase.length - 1]?.fecha || item.fecha_fin || "";
    item.hora_fin = agendasBase[agendasBase.length - 1]?.hora || item.hora_fin || "";
    item._pago_grupo = pagoConsolidado;
  }

  return salida;
}

function esConsultaHcProxima(item) {
  return String(item?.origen_consulta || "") === "hc_proxima";
}

function esConsultaReservadaSinTurno(item) {
  return String(item?.origen_consulta || "") === "reservada_sin_turno";
}

function tipoConsultaLabel(item) {
  if (esConsultaReservadaSinTurno(item)) return "Reservada sin turno";
  const tipo = String(item?.tipo_consulta || "").toLowerCase();
  if (tipo === "programada") return "Programada";
  if (tipo === "espontanea") return "Espontanea";
  return tipo ? `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}` : "Sin tipo";
}

function tipoConsultaBadge(item) {
  if (esConsultaReservadaSinTurno(item)) {
    return "bg-cyan-100 text-cyan-700 border-cyan-200";
  }
  const tipo = String(item?.tipo_consulta || "").toLowerCase();
  if (tipo === "programada") {
    return "bg-sky-100 text-sky-700 border-sky-200";
  }
  if (tipo === "espontanea") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function tipoServicioLabel(item) {
  const tipo = String(item?.servicio_tipo || "").toLowerCase().trim();
  const serviciosLabel = String(item?.servicios_label || '').trim();
  if (serviciosLabel !== '') return serviciosLabel;
  if (tipo === "rayosx" || tipo === "rayos_x" || tipo === "rayos x") return "Rayos X";
  if (tipo === "ecografia") return "Ecografía";
  if (tipo === "laboratorio") return "Laboratorio";
  if (tipo === "farmacia") return "Farmacia";
  if (tipo === "consulta") return "Consulta";
  if (tipo === "procedimiento") return "Procedimiento";
  if (tipo === "operacion") return "Operación";
  if (tipo === "hospitalizacion") return "Hospitalización";
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

function tipoServicioBadge(item) {
  const tipo = String(item?.servicio_tipo || "").toLowerCase().trim();
  if (tipo === "paquete" || tipo === "perfil") return "bg-violet-100 text-violet-700 border-violet-200";
  if (tipo === "consulta") return "bg-sky-100 text-sky-700 border-sky-200";
  if (tipo === "ecografia") return "bg-violet-100 text-violet-700 border-violet-200";
  if (tipo === "laboratorio") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (tipo === "farmacia") return "bg-amber-100 text-amber-700 border-amber-200";
  if (tipo === "rayosx" || tipo === "rayos_x" || tipo === "rayos x") return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (tipo === "procedimiento") return "bg-orange-100 text-orange-700 border-orange-200";
  if (tipo === "operacion") return "bg-rose-100 text-rose-700 border-rose-200";
  if (tipo === "hospitalizacion") return "bg-teal-100 text-teal-700 border-teal-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function pagoServicioLabel(item) {
  const pago = item?._pago_grupo || item;
  const saldo = Number(pago?.saldo_pendiente || 0);
  const estado = String(pago?.cotizacion_estado || "").toLowerCase();
  if (saldo > 0) return `Saldo S/ ${saldo.toFixed(2)}`;
  if (estado === "pagado" || estado === "pagada") return "Pagado";
  if (Number(pago?.cotizacion_id || 0) > 0) return "Sin saldo";
  return "Sin cobro";
}

function pagoServicioBadge(item) {
  const pago = item?._pago_grupo || item;
  const saldo = Number(pago?.saldo_pendiente || 0);
  const estado = String(pago?.cotizacion_estado || "").toLowerCase();
  if (saldo > 0) return "bg-rose-100 text-rose-700 border-rose-200";
  if (estado === "pagado" || estado === "pagada") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (Number(pago?.cotizacion_id || 0) > 0) return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function normalizarDetallesCotizacion(detalles) {
  if (!Array.isArray(detalles)) return [];

  return detalles
    .map((det, index) => {
      const tipoRaw = String(det?.servicio_tipo || "otros").trim().toLowerCase();
      const descripcion = String(det?.descripcion || det?.descripcion_snapshot || "").trim();
      const cantidad = Number(det?.cantidad || 1);
      const subtotal = Number(det?.subtotal || 0);
      const detalleId = Number(det?.id || 0);
      const servicioId = Number(det?.servicio_id || 0);
      const tipoLabel = tipoServicioLabel({ servicio_tipo: tipoRaw });

      return {
        key: detalleId > 0 ? `det-${detalleId}` : `det-${tipoRaw}-${servicioId}-${index}`,
        tipo: tipoRaw,
        tipo_label: tipoLabel,
        descripcion: descripcion || `${tipoLabel} ${servicioId > 0 ? `#${servicioId}` : ""}`.trim(),
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
        subtotal: Number.isFinite(subtotal) ? subtotal : 0,
      };
    })
    .filter((det) => Boolean(det.descripcion));
}

const DETALLE_TIPO_ORDEN = {
  Consulta: 1,
  Laboratorio: 2,
  "Rayos X": 3,
  Ecografía: 4,
  Procedimiento: 5,
  Operación: 6,
  Hospitalización: 7,
  Farmacia: 8,
};

function ordenarTiposDetalle(tipos) {
  return [...tipos].sort((a, b) => {
    const ordenA = Number(DETALLE_TIPO_ORDEN[a] || 999);
    const ordenB = Number(DETALLE_TIPO_ORDEN[b] || 999);
    if (ordenA !== ordenB) return ordenA - ordenB;
    return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
  });
}

function obtenerPrioridad(item) {
  const dias = diasParaCita(item?.fecha);
  const estado = String(item?.estado_gestion || "pendiente");

  if (consultaAtendidaEnHC(item)) {
    return { nivel: "atendido", etiqueta: "Atendido", orden: 4, badge: "bg-violet-100 text-violet-700 border-violet-200" };
  }

  if (estado === "confirmado" || estado === "cancelado") {
    return { nivel: "resuelto", etiqueta: "Resuelto", orden: 5, badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }

  if (dias === 0) {
    return { nivel: "critico", etiqueta: "Critico", orden: 0, badge: "bg-rose-100 text-rose-700 border-rose-200" };
  }

  if (Number.isFinite(dias) && dias >= 1 && dias <= 3) {
    return { nivel: "alto", etiqueta: "Alto", orden: 1, badge: "bg-amber-100 text-amber-700 border-amber-200" };
  }

  return { nivel: "normal", etiqueta: "Normal", orden: 2, badge: "bg-sky-100 text-sky-700 border-sky-200" };
}

export default function RecordatoriosCitasPage() {
  const navigate = useNavigate();

  const initialOrdenCitas = (() => {
    try {
      const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
      return stored === "prioridad" ? "prioridad" : "fecha";
    } catch {
      return "fecha";
    }
  })();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [dias, setDias] = useState(30);
  const [estadoGestion, setEstadoGestion] = useState("");
  const [origenConsulta, setOrigenConsulta] = useState("");
  const [tipoRecordatorio, setTipoRecordatorio] = useState("citas");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinGestion, setSoloSinGestion] = useState(false);
  const [vistaRapida, setVistaRapida] = useState("todas");
  const [ordenCitas, setOrdenCitas] = useState(initialOrdenCitas);
  const [filaActivaId, setFilaActivaId] = useState(null);
  const [detalleExpandedRows, setDetalleExpandedRows] = useState({});
  const [detalleTipoFiltroRows, setDetalleTipoFiltroRows] = useState({});
  const [detalleCotizacionCache, setDetalleCotizacionCache] = useState({});
  const [detalleCotizacionLoading, setDetalleCotizacionLoading] = useState({});
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statsGlobal, setStatsGlobal] = useState({ urgentes: 0, hoy: 0, sin_telefono: 0, confirmadas: 0, atendidas: 0 });
  const [prioridadGlobal, setPrioridadGlobal] = useState({ critico: 0, alto: 0, normal: 0, bajo: 0, atendido: 0, resuelto: 0 });
  const usandoVistaUnificada = tipoRecordatorio === "todos";
  const usaPaginacionCliente = usandoVistaUnificada || tipoRecordatorio === "citas";

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      if (tipoRecordatorio === "todos") {
        const base = {
          dias: String(dias),
          estado_gestion: estadoGestion,
          origen_consulta: origenConsulta,
          busqueda: busqueda.trim(),
          solo_sin_gestion: soloSinGestion ? "1" : "0",
          _t: String(Date.now()),
        };

        const citasParams = new URLSearchParams({ ...base, tipo_recordatorio: "citas" });
        const faltasParams = new URLSearchParams({ ...base, tipo_recordatorio: "falta_cancelar" });

        const [resCitas, resFaltas] = await Promise.all([
          authFetch(`api_recordatorios_citas.php?${citasParams.toString()}`),
          authFetch(`api_recordatorios_citas.php?${faltasParams.toString()}`),
        ]);

        const [dataCitas, dataFaltas] = await Promise.all([resCitas.json(), resFaltas.json()]);
        if (!dataCitas.success) throw new Error(dataCitas.error || "No se pudo cargar recordatorios de citas");
        if (!dataFaltas.success) throw new Error(dataFaltas.error || "No se pudo cargar faltas por cancelar");

        const itemsCitas = Array.isArray(dataCitas.items) ? dataCitas.items : [];
        const itemsFaltas = Array.isArray(dataFaltas.items) ? dataFaltas.items : [];
        const combinados = [...itemsCitas, ...itemsFaltas];

        setItems(combinados);
        setTotalItems(combinados.length);
        setTotalPages(Math.max(1, Math.ceil(combinados.length / rowsPerPage)));

        setStatsGlobal({
          urgentes: Number(dataCitas?.stats?.urgentes || 0),
          hoy: Number(dataCitas?.stats?.hoy || 0),
          sin_telefono: Number(dataCitas?.stats?.sin_telefono || 0),
          confirmadas: Number(dataCitas?.stats?.confirmadas || 0),
          atendidas: Number(dataCitas?.stats?.atendidas || 0),
        });

        setPrioridadGlobal({
          critico: Number(dataCitas?.prioridad?.critico || 0) + Number(dataFaltas?.prioridad?.critico || 0),
          alto: Number(dataCitas?.prioridad?.alto || 0) + Number(dataFaltas?.prioridad?.alto || 0),
          normal: Number(dataCitas?.prioridad?.normal || 0) + Number(dataFaltas?.prioridad?.normal || 0),
          bajo: Number(dataCitas?.prioridad?.bajo || 0) + Number(dataFaltas?.prioridad?.bajo || 0),
          atendido: Number(dataCitas?.prioridad?.atendido || 0) + Number(dataFaltas?.prioridad?.atendido || 0),
          resuelto: Number(dataCitas?.prioridad?.resuelto || 0) + Number(dataFaltas?.prioridad?.resuelto || 0),
        });

        return;
      }

      const params = new URLSearchParams({
        dias: String(dias),
        estado_gestion: estadoGestion,
        origen_consulta: origenConsulta,
        tipo_recordatorio: tipoRecordatorio,
        busqueda: busqueda.trim(),
        solo_sin_gestion: soloSinGestion ? "1" : "0",
        _t: String(Date.now()),
      });
      if (!usaPaginacionCliente) {
        params.set("page", String(page));
        params.set("per_page", String(rowsPerPage));
      }
      const res = await authFetch(`api_recordatorios_citas.php?${params.toString()}`);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo cargar recordatorios");
      }
      const loadedItems = Array.isArray(data.items) ? data.items : [];
      setItems(loadedItems);
      if (usaPaginacionCliente) {
        setTotalItems(loadedItems.length);
        setTotalPages(Math.max(1, Math.ceil(loadedItems.length / rowsPerPage)));
      } else {
        setTotalItems(Number(data?.pagination?.total ?? data?.total ?? 0));
        setTotalPages(Math.max(1, Number(data?.pagination?.total_pages ?? 1)));
      }
      setStatsGlobal({
        urgentes: Number(data?.stats?.urgentes || 0),
        hoy: Number(data?.stats?.hoy || 0),
        sin_telefono: Number(data?.stats?.sin_telefono || 0),
        confirmadas: Number(data?.stats?.confirmadas || 0),
        atendidas: Number(data?.stats?.atendidas || 0),
      });
      setPrioridadGlobal({
        critico: Number(data?.prioridad?.critico || 0),
        alto: Number(data?.prioridad?.alto || 0),
        normal: Number(data?.prioridad?.normal || 0),
        bajo: Number(data?.prioridad?.bajo || 0),
        atendido: Number(data?.prioridad?.atendido || 0),
        resuelto: Number(data?.prioridad?.resuelto || 0),
      });
    } catch (err) {
      setError(err.message || "Error cargando recordatorios");
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
      setStatsGlobal({ urgentes: 0, hoy: 0, sin_telefono: 0, confirmadas: 0, atendidas: 0 });
      setPrioridadGlobal({ critico: 0, alto: 0, normal: 0, bajo: 0, atendido: 0, resuelto: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, estadoGestion, origenConsulta, soloSinGestion, tipoRecordatorio]);

  useEffect(() => {
    if (usaPaginacionCliente) return;
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, usaPaginacionCliente]);

  useEffect(() => {
    setPage(1);
    setDetalleExpandedRows({});
    setDetalleTipoFiltroRows({});
  }, [dias, estadoGestion, origenConsulta, soloSinGestion, busqueda, vistaRapida, rowsPerPage, tipoRecordatorio]);

  useEffect(() => {
    if (!usaPaginacionCliente) return;
    setTotalPages(Math.max(1, Math.ceil(items.length / rowsPerPage)));
  }, [items.length, rowsPerPage, usaPaginacionCliente]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, ordenCitas);
    } catch {
      // Si localStorage no está disponible, se conserva el comportamiento en memoria.
    }
  }, [ordenCitas]);

  const pendientesUrgentes = useMemo(
    () => items.filter((item) => {
      const d = diasParaCita(item.fecha);
      return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
    }).length,
    [items]
  );

  const faltasPendientes = useMemo(
    () => items.filter((item) => esRecordatorioFaltaCancelar(item)).length,
    [items]
  );

  const metricas = useMemo(() => ({
    urgentes: Number(statsGlobal.urgentes || 0),
    hoy: Number(statsGlobal.hoy || 0),
    sinTelefono: Number(statsGlobal.sin_telefono || 0),
    confirmadas: Number(statsGlobal.confirmadas || 0),
    atendidas: Number(statsGlobal.atendidas || 0),
  }), [statsGlobal]);

  const itemsVista = useMemo(() => {
    const base = agruparRecordatoriosAgendaServicio(items);
    if (vistaRapida === "criticos") {
      return base.filter((item) => {
        const d = diasParaCita(item.fecha);
        return d === 0 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
      });
    }
    if (vistaRapida === "urgentes") {
      return base.filter((item) => {
        const d = diasParaCita(item.fecha);
        return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
      });
    }
    if (vistaRapida === "sin_telefono") {
      return base.filter((item) => !String(item.paciente_telefono || "").trim());
    }
    if (vistaRapida === "confirmadas") {
      return base.filter((item) => item.estado_gestion === "confirmado");
    }
    if (vistaRapida === "atendidas") {
      return base.filter((item) => consultaAtendidaEnHC(item));
    }
    return base;
  }, [items, vistaRapida]);

  const itemsPriorizados = useMemo(() => {
    const enriched = itemsVista.map((item) => {
      const prioridad = obtenerPrioridad(item);
      const diasRestantes = diasParaCita(item.fecha);
      const rowKey = esRecordatorioAgendaServicio(item)
        ? `agenda-${Number(item.cotizacion_id || 0)}`
        : `${String(item?.recordatorio_tipo || "cita")}-${Number(item?.id || 0)}`;
      return { ...item, prioridad, diasRestantes, _rowKey: rowKey };
    });

    if (ordenCitas === "fecha") {
      enriched.sort((a, b) => {
        const fa = `${a.fecha || ""} ${String(a.hora || "").slice(0, 5)}`;
        const fb = `${b.fecha || ""} ${String(b.hora || "").slice(0, 5)}`;
        const cmp = fa.localeCompare(fb);
        if (cmp !== 0) return cmp;
        return Number(a.id || 0) - Number(b.id || 0);
      });
      return enriched;
    }

    enriched.sort((a, b) => {
      if (a.prioridad.orden !== b.prioridad.orden) {
        return a.prioridad.orden - b.prioridad.orden;
      }

      const da = Number.isFinite(a.diasRestantes) ? a.diasRestantes : 999;
      const db = Number.isFinite(b.diasRestantes) ? b.diasRestantes : 999;
      if (da !== db) return da - db;

      const fa = `${a.fecha || ""} ${String(a.hora || "").slice(0, 5)}`;
      const fb = `${b.fecha || ""} ${String(b.hora || "").slice(0, 5)}`;
      return fa.localeCompare(fb);
    });

    return enriched;
  }, [itemsVista, ordenCitas]);

  const resumenPrioridad = useMemo(() => ({
    critico: Number(prioridadGlobal.critico || 0),
    alto: Number(prioridadGlobal.alto || 0),
    normal: Number(prioridadGlobal.normal || 0),
    bajo: Number(prioridadGlobal.bajo || 0),
    atendido: Number(prioridadGlobal.atendido || 0),
    resuelto: Number(prioridadGlobal.resuelto || 0),
  }), [prioridadGlobal]);

  const resumenPago = useMemo(() => {
    return items.reduce((acc, item) => {
      const saldo = Number(item?.saldo_pendiente || 0);
      const estado = String(item?.cotizacion_estado || "").toLowerCase();
      const tieneCobro = Number(item?.cotizacion_id || 0) > 0 || saldo > 0 || estado === "pagado" || estado === "pagada";
      if (!tieneCobro) {
        acc.sinCobro += 1;
      } else if (saldo > 0) {
        acc.conSaldo += 1;
      } else if (estado === "pagado" || estado === "pagada") {
        acc.pagados += 1;
      } else {
        acc.sinSaldo += 1;
      }
      return acc;
    }, { pagados: 0, conSaldo: 0, sinSaldo: 0, sinCobro: 0 });
  }, [items]);

  const siguienteLlamada = useMemo(
    () => itemsPriorizados.find((item) => !["confirmado", "cancelado"].includes(String(item.estado_gestion || "")) && !consultaAtendidaEnHC(item)) || null,
    [itemsPriorizados]
  );

  const totalItemsVista = usaPaginacionCliente ? itemsPriorizados.length : totalItems;
  const totalPagesVista = Math.max(1, usaPaginacionCliente ? Math.ceil(totalItemsVista / rowsPerPage) : totalPages);
  const pageVista = Math.min(page, totalPagesVista);

  const itemsPaginados = useMemo(() => {
    if (!usaPaginacionCliente) return itemsPriorizados;
    const start = (pageVista - 1) * rowsPerPage;
    return itemsPriorizados.slice(start, start + rowsPerPage);
  }, [itemsPriorizados, pageVista, rowsPerPage, usaPaginacionCliente]);

  useEffect(() => {
    if (page > totalPagesVista) {
      setPage(totalPagesVista);
    }
  }, [page, totalPagesVista]);

  const enfocarSiguienteLlamada = () => {
    if (!siguienteLlamada) return;
    setFilaActivaId(siguienteLlamada._rowKey);
    window.setTimeout(() => {
      const el = document.getElementById(`rc-row-${siguienteLlamada._rowKey}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const cargarDetalleCotizacion = async (cotizacionId) => {
    const cotId = Number(cotizacionId || 0);
    if (cotId <= 0 || detalleCotizacionCache[cotId]) return;

    setDetalleCotizacionLoading((prev) => ({ ...prev, [cotId]: true }));
    try {
      const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotId}&_t=${Date.now()}`);
      const data = await res.json();
      if (!data?.success || !data?.cotizacion) {
        throw new Error(data?.error || "No se pudo cargar detalle de cotización");
      }

      const detalles = normalizarDetallesCotizacion(data?.cotizacion?.detalles || []);
      setDetalleCotizacionCache((prev) => ({
        ...prev,
        [cotId]: {
          ok: true,
          items: detalles,
        },
      }));
    } catch (err) {
      setDetalleCotizacionCache((prev) => ({
        ...prev,
        [cotId]: {
          ok: false,
          items: [],
          error: err?.message || "No se pudo cargar detalle de cotización",
        },
      }));
    } finally {
      setDetalleCotizacionLoading((prev) => ({ ...prev, [cotId]: false }));
    }
  };

  const toggleDetalleRow = async (item) => {
    const rowKey = String(item?._rowKey || "");
    if (!rowKey) return;

    const isExpanded = Boolean(detalleExpandedRows[rowKey]);
    if (isExpanded) {
      setDetalleExpandedRows((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      setDetalleTipoFiltroRows((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      return;
    }

    setDetalleExpandedRows((prev) => ({ ...prev, [rowKey]: true }));
    const cotId = Number(item?.cotizacion_id || 0);
    if (cotId > 0 && !detalleCotizacionCache[cotId]) {
      await cargarDetalleCotizacion(cotId);
    }
  };

  const cambiarFiltroDetalleRow = (rowKey, filtroTipo) => {
    const key = String(rowKey || "");
    if (!key) return;
    const filtro = String(filtroTipo || "todos");
    setDetalleTipoFiltroRows((prev) => ({ ...prev, [key]: filtro }));
  };

  const guardarGestion = async (item, estado) => {
    const requiereProximo = estado === "no_contesta" || estado === "reprogramar";
    const modal = await Swal.fire({
      title: `Registrar gestion: ${estadoLabel(estado)}`,
      html: `
        <div style="display:flex;flex-direction:column;gap:10px;text-align:left;">
          <label style="font-size:12px;font-weight:600;color:#334155;">Observacion</label>
          <textarea id="rc_obs" class="swal2-textarea" style="margin:0;width:100%;" placeholder="Detalle breve de la gestion">${item.observacion || ""}</textarea>
          ${requiereProximo ? `
            <label style="font-size:12px;font-weight:600;color:#334155;">Proximo contacto (opcional)</label>
            <input id="rc_next" type="datetime-local" class="swal2-input" style="margin:0;width:100%;" />
          ` : ""}
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const obsEl = document.getElementById("rc_obs");
        const nextEl = document.getElementById("rc_next");
        const observacion = obsEl ? String(obsEl.value || "").trim() : "";
        const proximo = nextEl ? String(nextEl.value || "").trim() : "";
        return { observacion, proximo };
      },
    });

    if (!modal.isConfirmed) return false;

    const observacion = String(modal.value?.observacion || "");
    const proximo = String(modal.value?.proximo || "");

    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await authFetch(`api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consulta_id: item.id,
          estado,
          observacion,
          fecha_proximo_contacto: proximo,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo guardar gestion");
      }
      setMensaje("Gestion guardada correctamente.");
      await cargar();
      return true;
    } catch (err) {
      setError(err.message || "No se pudo guardar gestion");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const guardarGestionAgenda = async (item, estado) => {
    const requiereProximo = estado === "no_contesta" || estado === "reprogramar";
    const modal = await Swal.fire({
      title: `Registrar gestion: ${estadoLabel(estado)}`,
      html: `
        <div style="display:flex;flex-direction:column;gap:10px;text-align:left;">
          <label style="font-size:12px;font-weight:600;color:#334155;">Observacion</label>
          <textarea id="rc_obs_agenda" class="swal2-textarea" style="margin:0;width:100%;" placeholder="Detalle breve de la gestion">${item.observacion || ""}</textarea>
          ${requiereProximo ? `
            <label style="font-size:12px;font-weight:600;color:#334155;">Proximo contacto (opcional)</label>
            <input id="rc_next_agenda" type="datetime-local" class="swal2-input" style="margin:0;width:100%;" />
          ` : ""}
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const obsEl = document.getElementById("rc_obs_agenda");
        const nextEl = document.getElementById("rc_next_agenda");
        const observacion = obsEl ? String(obsEl.value || "").trim() : "";
        const proximo = nextEl ? String(nextEl.value || "").trim() : "";
        return { observacion, proximo };
      },
    });

    if (!modal.isConfirmed) return false;

    const observacion = String(modal.value?.observacion || "");
    const proximo = String(modal.value?.proximo || "");

    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await authFetch(`api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "guardar_gestion_agenda",
          cotizacion_id: Number(item.cotizacion_id),
          estado,
          observacion,
          fecha_proximo_contacto: proximo,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo guardar gestion");
      }
      setMensaje("Gestion guardada correctamente.");
      await cargar();
      return true;
    } catch (err) {
      setError(err.message || "No se pudo guardar gestion");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const reprogramarAgendaServicio = async (item) => {
    const fechaActual = item.fecha || "";
    const horaActual = item.hora ? String(item.hora).slice(0, 5) : "";
    
    const modal = await Swal.fire({
      title: "Reprogramar servicios",
      html: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
          <div>
            <label style="font-size:12px;font-weight:600;color:#334155;">Nueva fecha</label>
            <input id="rc_fecha_reprog" type="date" class="swal2-input" style="margin:0;width:100%;" value="${fechaActual}" />
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#334155;">Nueva hora</label>
            <input id="rc_hora_reprog" type="time" class="swal2-input" style="margin:0;width:100%;" value="${horaActual}" />
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Reprogramar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fechaEl = document.getElementById("rc_fecha_reprog");
        const horaEl = document.getElementById("rc_hora_reprog");
        const fecha = fechaEl ? String(fechaEl.value || "").trim() : "";
        const hora = horaEl ? String(horaEl.value || "").trim() : "";
        if (!fecha || !hora) {
          Swal.showValidationMessage("Debes ingresar fecha y hora");
          return null;
        }
        return { fecha, hora };
      },
    });

    if (!modal.isConfirmed) return false;

    const { fecha, hora } = modal.value || {};
    
    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await authFetch(`api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprogramar_agenda_servicio",
          cotizacion_id: Number(item.cotizacion_id),
          nueva_fecha: fecha,
          nueva_hora: hora,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo reprogramar");
      }
      setMensaje(`Servicios reprogramados para ${fecha} a las ${String(hora).slice(0, 5)}.`);
      await cargar();
      return true;
    } catch (err) {
      setError(err.message || "No se pudo reprogramar los servicios");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const crearCotizacion = async (item) => {
    if (item.cotizacion_id) {
      navigate(`/cobrar-cotizacion/${item.cotizacion_id}`);
      return;
    }
    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await authFetch(`api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crear_cotizacion", consulta_id: item.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo crear la cotización");
      navigate(`/cobrar-cotizacion/${data.cotizacion_id}`);
    } catch (err) {
      setError(err.message || "Error al registrar cobro");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: "linear-gradient(145deg, #f8fafc, #eef2ff)" }}>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Recordatorios de proximas citas</h1>
              <p className="mt-1 text-sm text-slate-600">
                Vista operativa para admin y recepcion: llamadas de confirmacion antes de la cita.
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
              {tipoRecordatorio === "citas"
                ? `Urgentes (hoy/manana sin confirmar): ${pendientesUrgentes}`
                : `Faltas pendientes por cobrar: ${faltasPendientes}`}
            </div>
          </div>

          <QuickAccessNav keys={["pacientes", "recordatorios", "listaConsultas", "cotizaciones", "reporteCaja"]} className="mt-4" />

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-7">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Tipo recordatorio</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={tipoRecordatorio}
                onChange={(e) => setTipoRecordatorio(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="citas">Citas</option>
                <option value="falta_cancelar">Falta cancelar</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Horizonte</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              >
                <option value={365}>1 año</option>
                <option value={180}>180 dias</option>
                <option value={90}>90 dias</option>
                <option value={60}>60 dias</option>
                <option value={30}>30 dias</option>
                <option value={14}>14 dias</option>
                <option value={7}>7 dias</option>
                <option value={3}>3 dias</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Estado gestion</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={estadoGestion}
                onChange={(e) => setEstadoGestion(e.target.value)}
              >
                {ESTADOS_GESTION.map((item) => (
                  <option key={item.value || "all"} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Origen</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={origenConsulta}
                onChange={(e) => setOrigenConsulta(e.target.value)}
                  disabled={tipoRecordatorio !== "citas"}
              >
                <option value="">Todos</option>
                <option value="agendada">Agendada</option>
                <option value="hc_proxima">HC proxima</option>
                <option value="cotizador">Cotizador</option>
                <option value="reservada_sin_turno">Reservada sin turno</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Busqueda</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Paciente, medico, DNI, telefono o ID"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Orden</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={ordenCitas}
                onChange={(e) => setOrdenCitas(e.target.value)}
              >
                <option value="prioridad">Por prioridad</option>
                <option value="fecha">Por fecha</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={cargar}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Buscar
              </button>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={soloSinGestion}
                  onChange={(e) => setSoloSinGestion(e.target.checked)}
                  disabled={tipoRecordatorio !== "citas"}
                />
                Solo pendientes
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {mensaje && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{mensaje}</div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <button
            type="button"
            onClick={() => setVistaRapida("urgentes")}
            className={`rounded-xl border px-4 py-3 text-left ${vistaRapida === "urgentes" ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}
          >
            <div className="text-xs text-slate-500">Urgentes</div>
            <div className="text-xl font-bold text-rose-700">{metricas.urgentes}</div>
          </button>
          <button
            type="button"
            onClick={() => setVistaRapida("todas")}
            className={`rounded-xl border px-4 py-3 text-left ${vistaRapida === "todas" ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}
          >
            <div className="text-xs text-slate-500">Citas hoy</div>
            <div className="text-xl font-bold text-sky-700">{metricas.hoy}</div>
          </button>
          <button
            type="button"
            onClick={() => setVistaRapida("sin_telefono")}
            className={`rounded-xl border px-4 py-3 text-left ${vistaRapida === "sin_telefono" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
          >
            <div className="text-xs text-slate-500">Sin telefono</div>
            <div className="text-xl font-bold text-amber-700">{metricas.sinTelefono}</div>
          </button>
          <button
            type="button"
            onClick={() => setVistaRapida("confirmadas")}
            className={`rounded-xl border px-4 py-3 text-left ${vistaRapida === "confirmadas" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
          >
            <div className="text-xs text-slate-500">Confirmadas</div>
            <div className="text-xl font-bold text-emerald-700">{metricas.confirmadas}</div>
          </button>
          <button
            type="button"
            onClick={() => setVistaRapida(vistaRapida === "atendidas" ? "todas" : "atendidas")}
            className={`rounded-xl border px-4 py-3 text-left ${vistaRapida === "atendidas" ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}
          >
            <div className="text-xs text-slate-500">Atendidas HC</div>
            <div className="text-xl font-bold text-violet-700">{metricas.atendidas}</div>
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Critico: {resumenPrioridad.critico}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Alto: {resumenPrioridad.alto}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Normal: {resumenPrioridad.normal}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Bajo: {resumenPrioridad.bajo}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Atendido: {resumenPrioridad.atendido}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Resuelto: {resumenPrioridad.resuelto}</span>
          <button
            type="button"
            onClick={() => setVistaRapida(vistaRapida === "criticos" ? "todas" : "criticos")}
            className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold ${vistaRapida === "criticos" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {vistaRapida === "criticos" ? "Ver todas" : "Solo criticos"}
          </button>
          <button
            type="button"
            onClick={enfocarSiguienteLlamada}
            disabled={!siguienteLlamada}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={siguienteLlamada ? `Siguiente: Cita #${siguienteLlamada.id}` : "No hay citas pendientes"}
          >
            Siguiente llamada
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Pagados: {resumenPago.pagados}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Con saldo pendiente: {resumenPago.conSaldo}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Sin saldo: {resumenPago.sinSaldo}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Sin cobro: {resumenPago.sinCobro}</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3 text-left">Cita</th>
                <th className="p-3 text-left">Prioridad</th>
                <th className="p-3 text-left">Paciente</th>
                <th className="p-3 text-left">Servicio</th>
                <th className="p-3 text-left">Detalle</th>
                <th className="p-3 text-left">Medico</th>
                <th className="p-3 text-left">Estado gestion</th>
                <th className="p-3 text-left">Intentos</th>
                <th className="p-3 text-left">Observacion</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-5 text-center text-slate-500">Cargando recordatorios...</td>
                </tr>
              ) : itemsPriorizados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-5 text-center text-slate-500">No hay citas para la vista seleccionada.</td>
                </tr>
              ) : (
                itemsPaginados.map((item) => {
                  const diasRestantes = item.diasRestantes;
                  const esHcProxima = esConsultaHcProxima(item);
                  const esFaltaCancelar = esRecordatorioFaltaCancelar(item);
                  const esControl = Number(item?.es_control || 0) === 1;
                  const esTipoProgramada = String(item?.tipo_consulta || "").toLowerCase() === "programada";
                  const mostrarBadgeTipo = !(esHcProxima && esTipoProgramada);
                  const estadoCotizacion = String(item?.cotizacion_estado || "").toLowerCase();
                  const cotizacionPagada =
                    estadoCotizacion === "pagado" || estadoCotizacion === "pagada" || estadoCotizacion === "control";
                  const puedeRegistrarCobro = !item.cotizacion_id
                    && !esControl
                    && (item.estado_consulta === "falta_cancelar" || Number(item.hc_origen_id || 0) > 0);
                  const cotizacionId = Number(item?.cotizacion_id || 0);
                  const detalleExpanded = Boolean(detalleExpandedRows[item._rowKey]);
                  const detalleCache = cotizacionId > 0 ? detalleCotizacionCache[cotizacionId] : null;
                  const detalleLoading = cotizacionId > 0 && Boolean(detalleCotizacionLoading[cotizacionId]);
                  const detalleItems = Array.isArray(detalleCache?.items) ? detalleCache.items : [];
                  const detallesPorTipo = detalleItems.reduce((acc, det) => {
                    const key = String(det?.tipo_label || "Servicio");
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {});
                  const tiposDetalle = ordenarTiposDetalle(Object.keys(detallesPorTipo));
                  const filtroDetalleRaw = String(detalleTipoFiltroRows[item._rowKey] || "todos");
                  const filtroDetalleActivo = filtroDetalleRaw === "todos" || tiposDetalle.includes(filtroDetalleRaw)
                    ? filtroDetalleRaw
                    : "todos";
                  const detalleItemsFiltrados = filtroDetalleActivo === "todos"
                    ? detalleItems
                    : detalleItems.filter((det) => String(det?.tipo_label || "") === filtroDetalleActivo);
                  return (
                    <Fragment key={item._rowKey}>
                      <tr id={`rc-row-${item._rowKey}`} className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${item.prioridad.nivel === "critico" ? "bg-rose-50/30" : ""} ${filaActivaId === item._rowKey ? "ring-2 ring-indigo-300 bg-indigo-50/40" : ""}`}>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">#{item.id}</div>
                          <div className="mt-1">
                            {esFaltaCancelar ? (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                Falta cancelar
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                Cita
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600">{formatFechaHora(item.fecha, item.hora)}</div>
                          <div className="text-xs font-semibold text-rose-700">
                            {esFaltaCancelar
                              ? "Pendiente cobro"
                              : diasRestantes === 0
                                ? "Hoy"
                                : diasRestantes === 1
                                  ? "Manana"
                                  : `${diasRestantes} dias`}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${item.prioridad.badge}`}>
                            {item.prioridad.etiqueta}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">{item.paciente_nombre} {item.paciente_apellido}</div>
                          <div className="text-xs text-slate-600">DNI: {item.paciente_dni || "-"}</div>
                          <div className="text-xs text-slate-600">Tel: {item.paciente_telefono || "Sin telefono"}</div>
                          <div className="mt-1">
                            {mostrarBadgeTipo && (
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tipoConsultaBadge(item)}`}>
                                {tipoConsultaLabel(item)}
                              </span>
                            )}
                            {esHcProxima && (
                              <span className="ml-1 inline-flex rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                HC proxima
                              </span>
                            )}
                            {esControl && (
                              <span className="ml-1 inline-flex rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                Sin costo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tipoServicioBadge(item)}`}>
                            {tipoServicioLabel(item)}
                          </span>
                          {String(item?.origen_consulta || "") === "agenda_servicio" && (
                            <div className="mt-1 text-[11px] text-slate-500">Agenda servicio</div>
                          )}
                          {Number(item?.servicios_count || item?.agendas_count || 0) > 1 && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              Paquete agrupado · {Number(item.servicios_count || item.agendas_count || 0)} servicios{Number(item?.fechas_count || 0) > 1 ? ` · ${Number(item.fechas_count || 0)} fechas` : ''}
                            </div>
                          )}
                          <div className="mt-1">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pagoServicioBadge(item)}`}>
                              {pagoServicioLabel(item)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          {cotizacionId > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleDetalleRow(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              title={detalleExpanded ? "Ocultar detalle" : "Ver detalle de servicios"}
                            >
                              {detalleExpanded ? "▾" : "▸"} Detalle
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Sin detalle</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">{esFaltaCancelar ? "-" : `${item.medico_nombre} ${item.medico_apellido}`}</td>
                        <td className="p-3">
                          {esFaltaCancelar ? (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Pendiente pago
                            </span>
                          ) : (
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoBadgeClasses(item.estado_gestion)}`}>
                              {estadoLabel(item.estado_gestion)}
                            </span>
                          )}
                          <div className="mt-1 text-xs text-slate-500">
                            Prox: {item.fecha_proximo_contacto ? item.fecha_proximo_contacto.replace("T", " ") : "-"}
                          </div>
                          {esFaltaCancelar && Number(item?.saldo_pendiente || 0) > 0 && (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                Saldo: S/ {Number(item?.saldo_pendiente || 0).toFixed(2)}
                              </span>
                            </div>
                          )}
                          {puedeRegistrarCobro && (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                ⏳ Por cobrar
                              </span>
                            </div>
                          )}
                          {cotizacionPagada && (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                ✅ Cotizacion pagada
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">{item.intentos || 0}</td>
                        <td className="p-3 text-xs text-slate-600">{item.observacion || "-"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {esFaltaCancelar ? (
                              Number(item?.cotizacion_id || 0) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/cobrar-cotizacion/${Number(item.cotizacion_id)}`)}
                                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                >
                                  💰 Ir a cobrar
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">Sin cotización vinculada</span>
                              )
                            ) : (
                              <>
                                {puedeRegistrarCobro && (
                                  <button
                                    type="button"
                                    onClick={() => crearCotizacion(item)}
                                    disabled={savingId === item.id}
                                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                  >
                                    💰 Registrar Cobro
                                  </button>
                                )}
                                {esRecordatorioAgendaServicio(item) ? (
                                  // ═══ Flujo AGENDA SERVICIOS ═══
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestionAgenda(item, "contactado")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                    >
                                      Llamado
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestionAgenda(item, "confirmado")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                    >
                                      Confirmo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestionAgenda(item, "no_contesta")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                    >
                                      No contesta
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await reprogramarAgendaServicio(item);
                                      }}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                                    >
                                      Reprogramar
                                    </button>
                                  </>
                                ) : (
                                  // ═══ Flujo CONSULTAS (EXISTENTE, SIN CAMBIO) ═══
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestion(item, "contactado")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                    >
                                      Llamado
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestion(item, "confirmado")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                    >
                                      Confirmo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => guardarGestion(item, "no_contesta")}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                    >
                                      No contesta
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const ok = await guardarGestion(item, "reprogramar");
                                        if (!ok) return;
                                        const params = new URLSearchParams({
                                          paciente_id: String(Number(item.paciente_id || 0)),
                                          consulta_id: String(Number(item.id || 0)),
                                          origen: "recordatorios",
                                          accion: "reprogramar",
                                          back_to: "/recordatorios-citas",
                                        });
                                        navigate(`/agendar-consulta?${params.toString()}`);
                                      }}
                                      disabled={savingId === item.id}
                                      className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                                    >
                                      Reprogramar
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {detalleExpanded && (
                        <tr className="border-t border-indigo-100 bg-indigo-50/30">
                          <td colSpan={10} className="p-3">
                            {cotizacionId <= 0 ? (
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                                Esta fila no tiene cotización vinculada para mostrar detalle.
                              </div>
                            ) : detalleLoading ? (
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                                Cargando detalle de cotización...
                              </div>
                            ) : !detalleCache?.ok ? (
                              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {String(detalleCache?.error || "No se pudo cargar detalle de cotización")}
                              </div>
                            ) : detalleItems.length === 0 ? (
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                                La cotización no tiene ítems activos para mostrar.
                              </div>
                            ) : (
                              <div className="rounded-lg border border-indigo-200 bg-white p-3">
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-semibold text-indigo-700">Cotización #{cotizacionId}</span>
                                  <button
                                    type="button"
                                    onClick={() => cambiarFiltroDetalleRow(item._rowKey, "todos")}
                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${filtroDetalleActivo === "todos" ? "border-indigo-300 bg-indigo-100 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                                  >
                                    Todos: {detalleItems.length}
                                  </button>
                                  {tiposDetalle.map((tipo) => (
                                    <button
                                      key={tipo}
                                      type="button"
                                      onClick={() => cambiarFiltroDetalleRow(item._rowKey, tipo)}
                                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${filtroDetalleActivo === tipo ? "border-indigo-300 bg-indigo-100 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                                    >
                                      {tipo}: {Number(detallesPorTipo[tipo] || 0)}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  {detalleItemsFiltrados.map((det) => (
                                    <div key={det.key} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                                      <div className="font-semibold text-slate-800">{det.descripcion}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                                        <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">
                                          {det.tipo_label}
                                        </span>
                                        <span>Cant: {Number(det.cantidad || 1)}</span>
                                        <span>Sub: S/ {Number(det.subtotal || 0).toFixed(2)}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {detalleItemsFiltrados.length === 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                                      No hay ítems para este tipo de servicio.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && itemsPriorizados.length > 0 && (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 text-slate-600">
              <span>
                Mostrando {itemsPaginados.length} de {totalItemsVista} registro(s)
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filas</label>
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Pagina {pageVista} de {totalPagesVista}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPagesVista, prev + 1))}
                disabled={pageVista === totalPagesVista}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
