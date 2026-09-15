import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/apiClient";

function getTodayYmdLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function MedicoConsultas({ medicoId, onIniciarConsulta, onVerDetalle, mode = "lista" }) {
  const navigate = useNavigate();
  const [consultas, setConsultas] = useState([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [totalRows, setTotalRows] = useState(0);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, emergencias: 0, operativas: 0, pendientes_operativas: 0, excluidas_canceladas: 0 });
  const [statsClinicosHoy, setStatsClinicosHoy] = useState({
    fecha_referencia: "",
    consultas_total_hoy: 0,
    consultas_abiertas_hoy: 0,
    agenda_abierta_hoy: 0,
    cola_clinica_hoy: 0,
    consultas_completadas_hoy: 0,
    total_historico_filtrado: 0,
  });
  const [statsServiciosHoy, setStatsServiciosHoy] = useState({
    fecha_referencia: "",
    servicios_habilitados: [],
    pendientes_por_servicio: {},
  });
  const [statsImagenologiaPendiente, setStatsImagenologiaPendiente] = useState({
    fecha_referencia: "",
    total_pendientes: 0,
    pendientes_hoy: 0,
    por_tipo: { ecografia: 0, rayosx: 0, tomografia: 0 },
  });
  const [cierreHonorariosHoy, setCierreHonorariosHoy] = useState({
    fecha_referencia: "",
    pagables_hoy: 0,
    pendientes_cobro_hoy: 0,
    excluidas_hoy: 0,
    total_consultas_hoy: 0,
    monto_fijo_consulta: null,
    monto_pagable_estimado: null,
  });
  const [loadingCierreHonorariosHoy, setLoadingCierreHonorariosHoy] = useState(false);
  const [cierreHonorariosHoyError, setCierreHonorariosHoyError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [resumenEconomico, setResumenEconomico] = useState(null);
  const [resumenEconomicoError, setResumenEconomicoError] = useState("");
  const [loadingResumenEconomico, setLoadingResumenEconomico] = useState(false);
  const [expandedServicios, setExpandedServicios] = useState({});
  const [detalleServiciosByCotizacion, setDetalleServiciosByCotizacion] = useState({});
  const [loadingDetalleServiciosByCotizacion, setLoadingDetalleServiciosByCotizacion] = useState({});
  const [clockTick, setClockTick] = useState(0);
  
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState(getTodayYmdLocal);
  const [fechaHasta, setFechaHasta] = useState(getTodayYmdLocal);
  const [filtroEstado, setFiltroEstado] = useState("activas");
  const [filtroPago, setFiltroPago] = useState("solo_pagadas");
  const [filtroSemaforo, setFiltroSemaforo] = useState("todas");

  const formatMoney = (value) => {
    const n = Number(value || 0);
    return `S/ ${n.toFixed(2)}`;
  };

  const normalizarServicioTipo = (raw) => {
    const t = String(raw || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "rayosx" || t === "rayos_x" || t === "rayos x" || t === "rx") return "rayosx";
    return t;
  };

  const etiquetaServicio = (tipo) => {
    const t = normalizarServicioTipo(tipo);
    if (t === "consulta") return "Consulta";
    if (t === "ecografia") return "Ecografía";
    if (t === "laboratorio") return "Laboratorio";
    if (t === "rayosx") return "Rayos X";
    if (t === "procedimiento") return "Procedimiento";
    if (t === "farmacia") return "Farmacia";
    if (t === "operacion" || t === "cirugia") return "Operación";
    if (!t) return "Servicio";
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const obtenerServiciosResumen = (consulta) => {
    const tiposRaw = String(consulta?.servicios_tipos_resumen || "").trim();
    const tipos = tiposRaw
      ? tiposRaw.split(",").map(normalizarServicioTipo).filter(Boolean)
      : [];
    const tiposFinal = tipos.length > 0 ? tipos : ["consulta"];
    const count = Number(consulta?.servicios_count || tiposFinal.length || 1);
    const extras = Number(consulta?.servicios_extras_count || 0);
    return { tipos: tiposFinal, count, extras };
  };

  const cargarDetalleServiciosCotizacion = async (cotizacionId) => {
    const cotId = Number(cotizacionId || 0);
    if (cotId <= 0) return;
    if (detalleServiciosByCotizacion[cotId]) return;

    setLoadingDetalleServiciosByCotizacion((prev) => ({ ...prev, [cotId]: true }));
    try {
      const response = await authFetch(`api_cotizaciones.php?cotizacion_id=${cotId}&_t=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      const cot = data?.cotizacion || null;
      const detalles = Array.isArray(cot?.detalles) ? cot.detalles : [];
      const servicios = detalles
        .filter((d) => String(d?.estado_item || "").toLowerCase() !== "eliminado")
        .map((d) => ({
          id: Number(d?.id || 0),
          tipo: etiquetaServicio(d?.servicio_tipo || ""),
          descripcion: String(d?.descripcion || "").trim(),
          cantidad: Number(d?.cantidad || 1),
          subtotal: Number(d?.subtotal || 0),
        }));

      setDetalleServiciosByCotizacion((prev) => ({ ...prev, [cotId]: servicios }));
    } catch {
      setDetalleServiciosByCotizacion((prev) => ({ ...prev, [cotId]: [] }));
    } finally {
      setLoadingDetalleServiciosByCotizacion((prev) => ({ ...prev, [cotId]: false }));
    }
  };

  const toggleServicios = async (consulta) => {
    const consultaId = Number(consulta?.id || 0);
    if (consultaId <= 0) return;
    const cotId = Number(consulta?.cotizacion_id || 0);

    setExpandedServicios((prev) => ({ ...prev, [consultaId]: !prev[consultaId] }));
    if (cotId > 0) {
      await cargarDetalleServiciosCotizacion(cotId);
    }
  };

  const cargarResumenEconomico = async (signal) => {
    if (!medicoId) return;
    setLoadingResumenEconomico(true);
    setResumenEconomicoError("");
    try {
      const response = await authFetch(`api_medico_cuenta_corriente.php?medico_id=${medicoId}`, { signal });
      const data = await response.json();

      if (!data?.success) {
        setResumenEconomico(null);
        setResumenEconomicoError(data?.error || "No se pudo cargar el resumen económico");
        return;
      }

      setResumenEconomico({
        resumen: data.resumen || {},
        periodo: data.periodo_actual || {},
        condiciones: data.condiciones_pago || {},
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setResumenEconomico(null);
      setResumenEconomicoError("No se pudo cargar el resumen económico");
    } finally {
      setLoadingResumenEconomico(false);
    }
  };

  const cargarCierreHonorariosHoy = async (signal) => {
    if (!medicoId) return;
    setLoadingCierreHonorariosHoy(true);
    setCierreHonorariosHoyError("");
    try {
      const response = await authFetch(`api_cierre_honorarios_medico.php?medico_id=${medicoId}&incluir_detalle=0`, { signal });
      const data = await response.json();

      if (!data?.success) {
        setCierreHonorariosHoy({
          fecha_referencia: "",
          pagables_hoy: 0,
          pendientes_cobro_hoy: 0,
          excluidas_hoy: 0,
          total_consultas_hoy: 0,
          monto_fijo_consulta: null,
          monto_pagable_estimado: null,
        });
        setCierreHonorariosHoyError(data?.error || "No se pudo cargar el cierre diario");
        return;
      }

      const r = data?.resumen || {};
      setCierreHonorariosHoy({
        fecha_referencia: data?.fecha_referencia || "",
        pagables_hoy: Number(r.pagables_hoy || 0),
        pendientes_cobro_hoy: Number(r.pendientes_cobro_hoy || 0),
        excluidas_hoy: Number(r.excluidas_hoy || 0),
        total_consultas_hoy: Number(r.total_consultas_hoy || 0),
        monto_fijo_consulta: r.monto_fijo_consulta === null || r.monto_fijo_consulta === undefined ? null : Number(r.monto_fijo_consulta),
        monto_pagable_estimado: r.monto_pagable_estimado === null || r.monto_pagable_estimado === undefined ? null : Number(r.monto_pagable_estimado),
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setCierreHonorariosHoyError("No se pudo cargar el cierre diario");
    } finally {
      setLoadingCierreHonorariosHoy(false);
    }
  };

  const cargarConsultas = async (signal) => {
    if (!medicoId) return;
    setLoading(true);
    setMsg("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(rowsPerPage),
      });
      if (busqueda.trim()) params.set('search', busqueda.trim());
      if (fechaDesde) params.set('fecha_desde', fechaDesde);
      if (fechaHasta) params.set('fecha_hasta', fechaHasta);
      if (filtroEstado) params.set('estado_panel', filtroEstado);
      if (filtroPago) params.set('filtro_pago_panel', filtroPago);
      if (filtroSemaforo) params.set('semaforo_panel', filtroSemaforo);

      const response = await authFetch(`api_consultas.php?${params.toString()}`, { signal });
      const data = await response.json();

      if (!data?.success) {
        setConsultas([]);
        setStats({ total: 0, pendientes: 0, emergencias: 0, operativas: 0, pendientes_operativas: 0, excluidas_canceladas: 0 });
        setStatsClinicosHoy({
          fecha_referencia: "",
          consultas_total_hoy: 0,
          consultas_abiertas_hoy: 0,
          agenda_abierta_hoy: 0,
          cola_clinica_hoy: 0,
          consultas_completadas_hoy: 0,
          total_historico_filtrado: 0,
        });
        setStatsServiciosHoy({ fecha_referencia: "", servicios_habilitados: [], pendientes_por_servicio: {} });
        setStatsImagenologiaPendiente({ fecha_referencia: "", total_pendientes: 0, pendientes_hoy: 0, por_tipo: { ecografia: 0, rayosx: 0, tomografia: 0 } });
        setTotalRows(0);
        setMsg(data?.error || "No se pudieron cargar las consultas");
        return;
      }

      setConsultas(data.consultas || []);
      setStats(data.stats || { total: 0, pendientes: 0, emergencias: 0, operativas: 0, pendientes_operativas: 0, excluidas_canceladas: 0 });
      setStatsClinicosHoy(data.stats_clinicos_hoy || {
        fecha_referencia: "",
        consultas_total_hoy: 0,
        consultas_abiertas_hoy: 0,
        agenda_abierta_hoy: 0,
        cola_clinica_hoy: 0,
        consultas_completadas_hoy: 0,
        total_historico_filtrado: 0,
      });
      setStatsServiciosHoy(data.stats_servicios_hoy || { fecha_referencia: "", servicios_habilitados: [], pendientes_por_servicio: {} });
      setStatsImagenologiaPendiente(data.stats_imagenologia_pendiente || { fecha_referencia: "", total_pendientes: 0, pendientes_hoy: 0, por_tipo: { ecografia: 0, rayosx: 0, tomografia: 0 } });
      setTotalRows(data.pagination?.total ?? data.stats?.total ?? 0);

      const totalPagesServidor = data.pagination?.total_pages ?? 1;
      if (page > totalPagesServidor) {
        setPage(totalPagesServidor);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      console.error("Error cargando consultas:", error);
      setConsultas([]);
      setStats({ total: 0, pendientes: 0, emergencias: 0, operativas: 0, pendientes_operativas: 0, excluidas_canceladas: 0 });
      setStatsClinicosHoy({
        fecha_referencia: "",
        consultas_total_hoy: 0,
        consultas_abiertas_hoy: 0,
        agenda_abierta_hoy: 0,
        cola_clinica_hoy: 0,
        consultas_completadas_hoy: 0,
        total_historico_filtrado: 0,
      });
      setStatsServiciosHoy({ fecha_referencia: "", servicios_habilitados: [], pendientes_por_servicio: {} });
      setStatsImagenologiaPendiente({ fecha_referencia: "", total_pendientes: 0, pendientes_hoy: 0, por_tipo: { ecografia: 0, rayosx: 0, tomografia: 0 } });
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    cargarConsultas(controller.signal);
    return () => {
      controller.abort();
    };
  }, [medicoId, page, rowsPerPage, busqueda, fechaDesde, fechaHasta, filtroEstado, filtroPago, filtroSemaforo]);

  useEffect(() => {
    if (mode !== "dashboard") {
      setResumenEconomico(null);
      setResumenEconomicoError("");
      setCierreHonorariosHoyError("");
      return;
    }
    const controller = new AbortController();
    cargarResumenEconomico(controller.signal);
    cargarCierreHonorariosHoy(controller.signal);
    return () => {
      controller.abort();
    };
  }, [medicoId, mode]);

  const actualizarEstado = async (id, estado) => {
    setMsg("");
    setLoading(true);
    try {
      await authFetch("api_consultas.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado })
      });
      
      await cargarConsultas();
      setMsg(`Consulta ${estado} correctamente`);
    } catch (error) {
      console.error("Error actualizando estado:", error);
      setMsg("Error al actualizar el estado");
    } finally {
      setLoading(false);
    }
  };
  const consultasPaginadas = consultas;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const periodoActualInicio = resumenEconomico?.periodo?.inicio || "-";
  const periodoActualFin = resumenEconomico?.periodo?.fin || "-";
  const resumenFin = resumenEconomico?.resumen || {};
  const pagadoPeriodo = Number(resumenFin.pagado_honorarios_periodo || 0);
  const pagadoTotal = Number(resumenFin.pagado_honorarios_total || 0);
  const saldoPeriodo = Number(resumenFin.deuda_neta_periodo || 0);
  const saldoTotal = Number(resumenFin.deuda_neta_total || 0);
  const estadoSaldoPeriodo =
    saldoPeriodo > 0
      ? "La clínica te debe"
      : saldoPeriodo < 0
        ? "Saldo a favor de clínica"
        : "Sin saldo pendiente";

  // Funciones de paginación
  const handleRowsPerPage = (e) => {
    setRowsPerPage(Number(e.target.value));
    setPage(1);
  };
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // Función para formatear fecha
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      // Evita desfase por zona horaria cuando viene en formato YYYY-MM-DD
      const soloFecha = String(dateStr).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
        const [year, month, day] = soloFecha.split('-');
        return `${day}/${month}/${year}`;
      }

      return new Date(dateStr).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    try {
      const normalized = String(dateTimeStr).replace(' ', 'T');
      const d = new Date(normalized);
      if (Number.isNaN(d.getTime())) return String(dateTimeStr);
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(dateTimeStr);
    }
  };

  // Funciones para colores y iconos de estado
  const getEstadoColor = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completada':
      case 'completado':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelada':
      case 'cancelado':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'en_proceso':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEstadoIcon = (estado) => {
    switch (estado?.toLowerCase()) {
      case 'pendiente':
        return '⏳ ';
      case 'completada':
      case 'completado':
        return '✅ ';
      case 'cancelada':
      case 'cancelado':
        return '❌ ';
      case 'en_proceso':
        return '🔄 ';
      default:
        return '📋 ';
    }
  };

  const getEstadoVisual = (consulta) => {
    const estado = String(consulta?.estado || '').trim().toLowerCase();
    const hcCompletada = estado === 'completada' || estado === 'completado';
    const cancelada = estado === 'cancelada' || estado === 'cancelado';

    if (hcCompletada) {
      return {
        label: 'Completada',
        icon: '✅ ',
        className: 'bg-green-100 text-green-800 border-green-200'
      };
    }

    if (cancelada) {
      return {
        label: 'Cancelada',
        icon: '❌ ',
        className: 'bg-red-100 text-red-800 border-red-200'
      };
    }

    return {
      label: 'Falta atender',
      icon: '⏳ ',
      className: 'bg-amber-100 text-amber-800 border-amber-200'
    };
  };

  const getClasificacionColor = (clasificacion) => {
    switch (clasificacion?.toLowerCase()) {
      case 'emergencia':
        return 'bg-red-100 text-red-800 border-red-200 animate-pulse';
      case 'urgente':
      case 'urgencia':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'no urgente':
      case 'normal':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getClasificacionIcon = (clasificacion) => {
    switch (clasificacion?.toLowerCase()) {
      case 'emergencia':
        return '🚨 ';
      case 'urgente':
      case 'urgencia':
        return '⚠️ ';
      case 'no urgente':
      case 'normal':
        return '🟢 ';
      default:
        return '⚪ ';
    }
  };

  const servicioBadgeClass = (tipo) => {
    switch (normalizarServicioTipo(tipo)) {
      case 'consulta':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ecografia':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'rayosx':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'tomografia':
        return 'bg-violet-100 text-violet-800 border-violet-200';
      case 'procedimiento':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'operacion':
      case 'cirugia':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const severidadPendienteClass = (cantidad) => {
    const n = Number(cantidad || 0);
    if (n <= 0) return 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50';
    if (n <= 3) return 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50';
    return 'border-rose-200 bg-gradient-to-br from-rose-50 to-red-50';
  };

  const ordenServicios = ['consulta', 'ecografia', 'rayosx', 'tomografia', 'procedimiento', 'operacion'];
  const pendientesPorServicio = statsServiciosHoy?.pendientes_por_servicio || {};
  const serviciosHabilitados = Array.isArray(statsServiciosHoy?.servicios_habilitados)
    ? statsServiciosHoy.servicios_habilitados.map(normalizarServicioTipo).filter(Boolean)
    : [];
  const serviciosConPendientes = Object.keys(pendientesPorServicio)
    .map(normalizarServicioTipo)
    .filter((tipo) => Number(pendientesPorServicio[tipo] || 0) > 0);
  const serviciosCards = Array.from(new Set([...serviciosHabilitados, ...serviciosConPendientes]))
    .filter(Boolean)
    .sort((a, b) => {
      const ia = ordenServicios.indexOf(a);
      const ib = ordenServicios.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  const fechaServiciosRef = statsServiciosHoy?.fecha_referencia || '-';
  const fechaClinicaRef = statsClinicosHoy?.fecha_referencia || '-';
  const colaClinicaHoy = Number(statsClinicosHoy?.cola_clinica_hoy || 0);
  const consultasAbiertasHoy = Number(statsClinicosHoy?.consultas_abiertas_hoy || 0);
  const agendaAbiertaHoy = Number(statsClinicosHoy?.agenda_abierta_hoy || 0);
  const completadasHoy = Number(statsClinicosHoy?.consultas_completadas_hoy || 0);
  const totalHistoricoFiltrado = Number(statsClinicosHoy?.total_historico_filtrado || stats.total || 0);
  const imagenPendTotal = Number(statsImagenologiaPendiente?.total_pendientes || 0);
  const imagenPendHoy = Number(statsImagenologiaPendiente?.pendientes_hoy || 0);
  const imagenPorTipo = statsImagenologiaPendiente?.por_tipo || { ecografia: 0, rayosx: 0, tomografia: 0 };
  const imagenConciliacion = statsImagenologiaPendiente?.conciliacion || {
    pendientes_hoy_total: 0,
    vinculadas_consulta_hoy: 0,
    sin_consulta_hoy: 0,
  };
  const pagablesHoy = Number(cierreHonorariosHoy?.pagables_hoy || 0);
  const pendientesCobroHoy = Number(cierreHonorariosHoy?.pendientes_cobro_hoy || 0);
  const excluidasHoy = Number(cierreHonorariosHoy?.excluidas_hoy || 0);
  const totalCierreHoy = Number(cierreHonorariosHoy?.total_consultas_hoy || 0);
  const montoFijoConsulta = cierreHonorariosHoy?.monto_fijo_consulta;
  const montoPagableEstimado = cierreHonorariosHoy?.monto_pagable_estimado;
  const fechaCierreRef = cierreHonorariosHoy?.fecha_referencia || "-";

  const getHoyYmd = () => {
    return getTodayYmdLocal();
  };

  // Fuerza recálculo visual del semáforo cada minuto (incluye cambio automático al pasar medianoche)
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick((prev) => prev + 1);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const getTipoConsultaMeta = (consulta) => {
    const origen = String(consulta?.origen_creacion || '').trim().toLowerCase();
    if (origen === 'reservada_sin_turno') {
      return {
        label: 'Reservada sin turno',
        icon: '🕘',
        className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
      };
    }

    const tipo = String(consulta?.tipo_consulta || '').trim().toLowerCase();
    if (tipo === 'espontanea' || tipo === 'espontánea') {
      return {
        label: 'Espontánea',
        icon: '⚡',
        className: 'bg-amber-100 text-amber-800 border-amber-200'
      };
    }
    if (tipo === 'programada') {
      return {
        label: 'Programada',
        icon: '📅',
        className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
      };
    }

    const hoyYmd = getHoyYmd();
    if (consulta?.fecha && String(consulta.fecha) > hoyYmd) {
      return {
        label: 'Programada',
        icon: '📅',
        className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
      };
    }

    return {
      label: 'Consulta',
      icon: '🩺',
      className: 'bg-gray-100 text-gray-700 border-gray-200'
    };
  };

  const getAgendaMeta = (consulta) => {
    const esReprogramada = Number(consulta?.es_reprogramada || 0) === 1 || Boolean(consulta?.reprogramada_en);
    if (esReprogramada) {
      return {
        label: 'Reprogramada',
        icon: '🔁',
        className: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200'
      };
    }
    return {
      label: 'Normal',
      icon: '🗓️',
      className: 'bg-slate-100 text-slate-700 border-slate-200'
    };
  };

  const getOrigenConsultaMeta = (consulta) => {
    const origen = String(consulta?.origen_creacion || '').trim().toLowerCase();
    const hcOrigenId = Number(consulta?.hc_origen_id || 0);
    const fechaConsulta = String(consulta?.fecha || '').slice(0, 10);
    const esFechaFutura = /^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta)
      ? fechaConsulta > getHoyYmd()
      : false;
    const esHcProxima = origen === 'hc_proxima' || hcOrigenId > 0;
    if (esHcProxima) {
      return {
        visible: true,
        label: esFechaFutura ? 'HC proxima' : 'HC proxima (historial)',
        icon: '🧾',
        className: esFechaFutura
          ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
          : 'bg-violet-100 text-violet-800 border-violet-200'
      };
    }
    return {
      visible: false,
      label: '',
      icon: '',
      className: ''
    };
  };

  const getContratoMeta = (consulta) => {
    const esContrato = Number(consulta?.es_contrato || 0) === 1;
    if (!esContrato) {
      return {
        visible: false,
        label: '',
        icon: '',
        className: ''
      };
    }

    return {
      visible: true,
      label: 'Contrato',
      icon: '📘',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
  };

  // NUEVO: Función para obtener estilo y estado del cobro (falta_cancelar)
  const getEstadoCobro = (consulta) => {
    const estado = String(consulta?.estado || '').toLowerCase().trim();
    const esControl = Number(consulta?.es_control || 0) === 1;

    // Una consulta ya completada nunca debe aparecer bloqueada, independientemente
    // de su origen o estado de cotización.
    if (estado === 'completada' || estado === 'completado') {
      return { faltaPagar: false, label: null, rowClass: '', badgeClass: '' };
    }

    if (esControl) {
      return {
        faltaPagar: false,
        label: '🆓 Sin costo',
        rowClass: '',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-200'
      };
    }

    const estadoCotizacion = String(consulta?.cotizacion_estado || '').toLowerCase().trim();
    const cotizacionId = Number(consulta?.cotizacion_id || 0);
    const tieneCotizacion = cotizacionId > 0;
    const esHcProxima = Number(consulta?.hc_origen_id || 0) > 0
      || String(consulta?.origen_creacion || '').toLowerCase().trim() === 'hc_proxima';
    const cotizacionPagada = estadoCotizacion === 'pagado' || estadoCotizacion === 'pagada' || estadoCotizacion === 'control';
    const habilitacionAnticipadaActiva = Number(consulta?.habilitacion_anticipada_activa || 0) === 1;
    const habilitacionMotivo = String(consulta?.habilitacion_anticipada_motivo || '').trim();

    if (esHcProxima && !cotizacionPagada && !tieneCotizacion) {
      if (habilitacionAnticipadaActiva) {
        return {
          faltaPagar: false,
          label: '⚡ Anticipado autorizado',
          rowClass: '',
          badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
          title: habilitacionMotivo ? `Motivo: ${habilitacionMotivo}` : 'Habilitación anticipada activa'
        };
      }
      return {
        faltaPagar: true,
        label: '⏳ Por cobrar',
        rowClass: 'opacity-50 cursor-not-allowed',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
      };
    }

    if (tieneCotizacion && !cotizacionPagada) {
      if (habilitacionAnticipadaActiva) {
        return {
          faltaPagar: false,
          label: '⚡ Anticipado autorizado',
          rowClass: '',
          badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
          title: habilitacionMotivo ? `Motivo: ${habilitacionMotivo}` : 'Habilitación anticipada activa'
        };
      }
      return {
        faltaPagar: true,
        label: '⏳ Pago pendiente',
        rowClass: 'opacity-50 cursor-not-allowed',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
      };
    }

    if (estado === 'falta_cancelar' && !cotizacionPagada) {
      if (habilitacionAnticipadaActiva) {
        return {
          faltaPagar: false,
          label: '⚡ Anticipado autorizado',
          rowClass: '',
          badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
          title: habilitacionMotivo ? `Motivo: ${habilitacionMotivo}` : 'Habilitación anticipada activa'
        };
      }
      return {
        faltaPagar: true,
        label: '⏳ Por cobrar',
        rowClass: 'opacity-50 cursor-not-allowed',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
      };
    }

    if (cotizacionPagada) {
      return {
        faltaPagar: false,
        label: '✅ Cotizacion pagada',
        rowClass: '',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
      };
    }

    return {
      faltaPagar: false,
      label: null,
      rowClass: '',
      badgeClass: ''
    };
  };

  const parseConsultaDateTime = (consulta) => {
    const fecha = String(consulta?.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
    const hora = String(consulta?.hora || '').slice(0, 5);
    const hhmm = /^\d{2}:\d{2}$/.test(hora) ? hora : '00:00';
    const d = new Date(`${fecha}T${hhmm}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getSemaforoMeta = (consulta) => {
    void clockTick;
    const estado = String(consulta?.estado || '').trim().toLowerCase();
    if (estado === 'completada' || estado === 'completado') {
      return {
        rowClass: 'bg-emerald-50/70',
        cardClass: 'bg-emerald-50/80 border-emerald-200/70',
        markerClass: 'border-l-emerald-500'
      };
    }

    if (estado === 'cancelada' || estado === 'cancelado' || estado === 'anulada' || estado === 'anulado') {
      return {
        rowClass: 'bg-slate-100/80',
        cardClass: 'bg-slate-100/80 border-slate-300/70',
        markerClass: 'border-l-slate-400'
      };
    }

    const fechaConsulta = String(consulta?.fecha || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta) && fechaConsulta === getHoyYmd()) {
      return {
        rowClass: 'bg-rose-100/90',
        cardClass: 'bg-rose-100/90 border-rose-300/90',
        markerClass: 'border-l-rose-700'
      };
    }

    const dt = parseConsultaDateTime(consulta);
    if (dt) {
      const now = new Date();
      const delta = dt.getTime() - now.getTime();
      if (delta <= 0) {
        return {
          rowClass: 'bg-rose-100/90',
          cardClass: 'bg-rose-100/90 border-rose-300/90',
          markerClass: 'border-l-rose-700'
        };
      }
      return {
        rowClass: 'bg-amber-50/85',
        cardClass: 'bg-amber-50/85 border-amber-200/80',
        markerClass: 'border-l-amber-500'
      };
    }

    return {
      rowClass: 'bg-sky-50/70',
      cardClass: 'bg-sky-50/75 border-sky-200/70',
      markerClass: 'border-l-sky-500'
    };
  };

  const colaEstadoLabel = (estado) => {
    const t = String(estado || '').toLowerCase().trim();
    if (t === 'llego') return 'Llegó';
    if (t === 'en_sala') return 'En sala';
    if (t === 'llamando') return 'Llamando';
    if (t === 'en_atencion') return 'En atención';
    if (t === 'retirado') return 'Retirado';
    return 'Pendiente';
  };

  const colaPrioridadLabel = (prioridad) => {
    const p = String(prioridad || '').toLowerCase().trim();
    if (p === 'adulto_mayor') return 'Adulto mayor';
    if (p === 'nino') return 'Niño';
    if (p === 'embarazada') return 'Embarazada';
    if (p === 'urgente') return 'Urgente';
    return 'Normal';
  };

  const colaEstadoBadgeClass = (estado) => {
    const t = String(estado || '').toLowerCase().trim();
    if (t === 'en_sala') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (t === 'llamando') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (t === 'en_atencion') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (t === 'llego') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (t === 'retirado') return 'bg-slate-200 text-slate-700 border-slate-300';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const colaPrioridadBadgeClass = (prioridad) => {
    const p = String(prioridad || '').toLowerCase().trim();
    if (p === 'urgente') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (p === 'embarazada') return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
    if (p === 'nino') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (p === 'adulto_mayor') return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const colaOperativaHoy = consultas
    .filter((c) => String(c?.fecha || '').slice(0, 10) === getHoyYmd())
    .filter((c) => ['llego', 'en_sala', 'llamando', 'en_atencion'].includes(String(c?.cola_estado || '').toLowerCase().trim()));
  const colaActivos = colaOperativaHoy.filter((c) => ['llego', 'en_sala', 'llamando'].includes(String(c?.cola_estado || '').toLowerCase().trim()));
  const colaActual = colaActivos
    .slice()
    .sort((a, b) => {
      const ca = Number(a?.cola_correlativo || 0) > 0 ? Number(a?.cola_correlativo || 0) : 9999;
      const cb = Number(b?.cola_correlativo || 0) > 0 ? Number(b?.cola_correlativo || 0) : 9999;
      if (ca !== cb) return ca - cb;
      return String(a?.hora || '').localeCompare(String(b?.hora || ''));
    })[0] || null;
  const colaSiguiente = colaActivos.find((c) => Number(c?.cola_es_siguiente || 0) === 1) || null;

  const esDashboard = mode === "dashboard";
  const themeGradientMain = "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 55%, var(--color-accent) 100%)";

  return (
    <div className="w-full px-1 sm:px-2 xl:px-4 2xl:px-6">
      {esDashboard && (
        <div className="mb-4 rounded-2xl bg-white/95 border border-blue-100 shadow p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm sm:text-base font-bold text-blue-900">Mi resumen económico</h3>
            <span className="text-xs text-slate-500">Periodo: {periodoActualInicio} al {periodoActualFin}</span>
          </div>

          {loadingResumenEconomico ? (
            <div className="text-sm text-slate-500 py-2">Cargando resumen económico...</div>
          ) : resumenEconomicoError ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{resumenEconomicoError}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="rounded-xl p-3 border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
                  <div className="text-xs font-semibold text-blue-700">Honorario pendiente (periodo)</div>
                  <div className="text-xl font-bold text-blue-900 mt-1">{formatMoney(resumenFin.pendiente_honorarios_periodo)}</div>
                </div>
                <div className="rounded-xl p-3 border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50">
                  <div className="text-xs font-semibold text-cyan-700">Honorario pagado (periodo)</div>
                  <div className="text-xl font-bold text-cyan-900 mt-1">{formatMoney(pagadoPeriodo)}</div>
                </div>
                <div className="rounded-xl p-3 border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                  <div className="text-xs font-semibold text-amber-700">Adelantos recibidos (periodo)</div>
                  <div className="text-xl font-bold text-amber-900 mt-1">{formatMoney(resumenFin.adelantos_periodo)}</div>
                </div>
                <div className={`rounded-xl p-3 border ${saldoPeriodo >= 0 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50" : "border-rose-200 bg-gradient-to-br from-rose-50 to-red-50"}`}>
                  <div className={`text-xs font-semibold ${saldoPeriodo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>Saldo neto (periodo)</div>
                  <div className={`text-xl font-bold mt-1 ${saldoPeriodo >= 0 ? "text-emerald-900" : "text-rose-900"}`}>{formatMoney(Math.abs(saldoPeriodo))}</div>
                  <div className={`text-[11px] mt-1 ${saldoPeriodo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{estadoSaldoPeriodo}</div>
                </div>
                <div className={`rounded-xl p-3 border ${saldoTotal >= 0 ? "border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50" : "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50"}`}>
                  <div className={`text-xs font-semibold ${saldoTotal >= 0 ? "text-violet-700" : "text-rose-700"}`}>Saldo neto (total)</div>
                  <div className={`text-xl font-bold mt-1 ${saldoTotal >= 0 ? "text-violet-900" : "text-rose-900"}`}>{formatMoney(Math.abs(saldoTotal))}</div>
                </div>
                <div className="rounded-xl p-3 border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50">
                  <div className="text-xs font-semibold text-emerald-700">Honorario pagado (total)</div>
                  <div className="text-xl font-bold text-emerald-900 mt-1">{formatMoney(pagadoTotal)}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Cálculo visible: pendiente del periodo {formatMoney(resumenFin.pendiente_honorarios_periodo)} menos adelantos {formatMoney(resumenFin.adelantos_periodo)} igual saldo neto {formatMoney(saldoPeriodo)}.
              </div>
            </>
          )}
        </div>
      )}

      {esDashboard ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-4 mb-4 sm:mb-5 border border-white/50">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center" style={{ background: themeGradientMain }}>
              <svg className="w-3 h-3 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-800">Resumen clínico operativo</h3>
          </div>

          <div className="text-[11px] text-slate-500 mb-2">Fecha de referencia: {fechaClinicaRef}</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-white shadow-md" style={{ background: themeGradientMain }}>
              <p className="text-white/85 text-[11px] sm:text-xs font-medium">Cola clínica de hoy</p>
              <p className="text-lg sm:text-xl font-bold leading-tight">{colaClinicaHoy}</p>
              <p className="text-[10px] sm:text-[11px] text-white/80 mt-0.5">Consultas: {consultasAbiertasHoy} · Agenda: {agendaAbiertaHoy}</p>
            </div>
            <div className="rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-white shadow-md" style={{ background: "linear-gradient(90deg, var(--color-secondary) 0%, var(--color-accent) 100%)" }}>
              <p className="text-white/85 text-[11px] sm:text-xs font-medium">Atendidas hoy</p>
              <p className="text-lg sm:text-xl font-bold leading-tight">{completadasHoy}</p>
              <p className="text-[10px] sm:text-[11px] text-white/80 mt-0.5">Cierre clínico del día</p>
            </div>
            <div className="rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-white shadow-md" style={{ background: "linear-gradient(90deg, var(--color-accent) 0%, var(--color-primary) 100%)" }}>
              <p className="text-white/85 text-[11px] sm:text-xs font-medium">Total histórico filtrado</p>
              <p className="text-lg sm:text-xl font-bold leading-tight">{totalHistoricoFiltrado}</p>
              <p className="text-[10px] sm:text-[11px] text-white/80 mt-0.5">Contexto del listado</p>
            </div>
          </div>

          <div className="mb-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Emergencias en filtro actual: <span className="font-semibold text-slate-800">{stats.emergencias}</span>
          </div>

          <div className="mb-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-50 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm sm:text-base font-semibold text-emerald-900">Cierre diario de consultas pagables</h4>
                <p className="text-[11px] text-emerald-800/80">Base para pago fijo por consulta del medico.</p>
              </div>
              <span className="text-xs text-emerald-700">Fecha: {fechaCierreRef}</span>
            </div>

            {loadingCierreHonorariosHoy ? (
              <div className="text-xs sm:text-sm text-emerald-700">Cargando cierre diario...</div>
            ) : cierreHonorariosHoyError ? (
              <div className="text-xs sm:text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{cierreHonorariosHoyError}</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-emerald-300 bg-white/80 p-3">
                    <div className="text-[11px] text-slate-600">Pagables hoy</div>
                    <div className="text-2xl font-bold text-emerald-900 leading-none mt-1">{pagablesHoy}</div>
                  </div>
                  <div className="rounded-lg border border-amber-300 bg-white/80 p-3">
                    <div className="text-[11px] text-slate-600">Pendientes de cobro</div>
                    <div className="text-2xl font-bold text-amber-900 leading-none mt-1">{pendientesCobroHoy}</div>
                  </div>
                  <div className="rounded-lg border border-slate-300 bg-white/80 p-3">
                    <div className="text-[11px] text-slate-600">Excluidas</div>
                    <div className="text-2xl font-bold text-slate-900 leading-none mt-1">{excluidasHoy}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-700 bg-white/70 border border-emerald-100 rounded-lg px-3 py-2">
                  Total consultas del dia: <span className="font-semibold">{totalCierreHoy}</span>
                  {montoFijoConsulta !== null ? (
                    <>
                      {' '}· Monto fijo por consulta: <span className="font-semibold">{formatMoney(montoFijoConsulta)}</span>
                      {' '}· Total pagable estimado: <span className="font-semibold text-emerald-800">{formatMoney(montoPagableEstimado || 0)}</span>
                    </>
                  ) : (
                    <>
                      {' '}· Sin monto fijo configurado para consulta en configuracion de honorarios.
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm sm:text-base font-semibold text-slate-800">Pendientes de agenda por servicio hoy</h4>
                <p className="text-[11px] text-slate-500">Basado en consultas/agendamiento clínico; para Procedimiento también considera registros del módulo de procedimientos del día. No incluye informes de imagenología.</p>
              </div>
              <span className="text-xs text-slate-500">Fecha: {fechaServiciosRef}</span>
            </div>

            {serviciosCards.length === 0 ? (
              <div className="text-xs sm:text-sm text-slate-500">No hay servicios clínicos configurados o no hay pendientes para hoy.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                {serviciosCards.map((tipo) => {
                  const cantidad = Number(pendientesPorServicio[tipo] || 0);
                  return (
                    <div key={`pend-${tipo}`} className={`rounded-xl border p-3 ${severidadPendienteClass(cantidad)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${servicioBadgeClass(tipo)}`}>
                          {etiquetaServicio(tipo)}
                        </span>
                        <span className="text-[11px] text-slate-600">Pendientes</span>
                      </div>
                      <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 leading-none">{cantidad}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm sm:text-base font-semibold text-cyan-900">Pendientes de informes de Imagenología</h4>
                <p className="text-[11px] text-cyan-700/80">Basado en órdenes de imagen con estado pendiente.</p>
              </div>
              <button
                onClick={() => navigate('/mis-informes-imagenologia')}
                className="text-xs font-semibold text-cyan-700 hover:text-cyan-900 underline"
              >
                Ver módulo
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
              <div className="rounded-lg border border-cyan-200 bg-white/80 p-3">
                <div className="text-[11px] text-slate-600">Pendientes totales</div>
                <div className="text-2xl font-bold text-cyan-900 leading-none mt-1">{imagenPendTotal}</div>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-white/80 p-3">
                <div className="text-[11px] text-slate-600">Pendientes hoy</div>
                <div className="text-2xl font-bold text-cyan-900 leading-none mt-1">{imagenPendHoy}</div>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-white/80 p-3">
                <div className="text-[11px] text-slate-600">Ecografías</div>
                <div className="text-2xl font-bold text-cyan-900 leading-none mt-1">{Number(imagenPorTipo.ecografia || 0)}</div>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-white/80 p-3">
                <div className="text-[11px] text-slate-600">Rayos X</div>
                <div className="text-2xl font-bold text-cyan-900 leading-none mt-1">{Number(imagenPorTipo.rayosx || 0)}</div>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-white/80 p-3">
                <div className="text-[11px] text-slate-600">Tomografías</div>
                <div className="text-2xl font-bold text-cyan-900 leading-none mt-1">{Number(imagenPorTipo.tomografia || 0)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-lg border border-slate-200 bg-white/80 p-2.5">
                <div className="text-[11px] text-slate-600">Conciliación hoy</div>
                <div className="text-sm font-semibold text-slate-800 mt-1">{Number(imagenConciliacion.pendientes_hoy_total || 0)} órdenes pendientes</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5">
                <div className="text-[11px] text-emerald-700">Vinculadas a consulta de hoy</div>
                <div className="text-sm font-semibold text-emerald-900 mt-1">{Number(imagenConciliacion.vinculadas_consulta_hoy || 0)}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5">
                <div className="text-[11px] text-amber-700">Sin consulta de hoy</div>
                <div className="text-sm font-semibold text-amber-900 mt-1">{Number(imagenConciliacion.sin_consulta_hoy || 0)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={() => navigate('/mis-consultas')}
              className="rounded-xl px-4 py-3 text-left text-white shadow-md transition hover:opacity-95"
              style={{ background: themeGradientMain }}
            >
              <div className="text-xs text-white/90">Acceso rápido</div>
              <div className="text-sm sm:text-base font-semibold">Ir a Mis Consultas</div>
            </button>
            <button
              onClick={() => navigate('/mis-informes-imagenologia')}
              className="rounded-xl px-4 py-3 text-left text-white shadow-md transition hover:opacity-95"
              style={{ background: "linear-gradient(90deg, var(--color-secondary) 0%, var(--color-accent) 100%)" }}
            >
              <div className="text-xs text-white/90">Acceso rápido</div>
              <div className="text-sm sm:text-base font-semibold">Informes de Imagenología</div>
            </button>
            <button
              onClick={() => navigate('/panel-medico')}
              className="rounded-xl px-4 py-3 text-left text-white shadow-md transition hover:opacity-95"
              style={{ background: "linear-gradient(90deg, var(--color-accent) 0%, var(--color-primary) 100%)" }}
            >
              <div className="text-xs text-white/90">Acceso rápido</div>
              <div className="text-sm sm:text-base font-semibold">Gestionar Disponibilidad</div>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-4 mb-4 sm:mb-5 border border-white/50">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-2">Lista de consultas</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100 px-3 py-2">
                <div className="text-[11px] sm:text-xs font-semibold text-sky-700 uppercase tracking-wide">Total</div>
                <div className="text-xl sm:text-2xl font-extrabold text-sky-900 leading-tight">{Number(stats.total || 0)}</div>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-100 px-3 py-2">
                <div className="text-[11px] sm:text-xs font-semibold text-indigo-700 uppercase tracking-wide">Operativas</div>
                <div className="text-xl sm:text-2xl font-extrabold text-indigo-900 leading-tight">{Number(stats.operativas || 0)}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 px-3 py-2">
                <div className="text-[11px] sm:text-xs font-semibold text-amber-700 uppercase tracking-wide">Pendientes</div>
                <div className="text-xl sm:text-2xl font-extrabold text-amber-900 leading-tight">{Number(stats.pendientes_operativas || 0)}</div>
              </div>
              <div className="rounded-xl border border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 px-3 py-2">
                <div className="text-[11px] sm:text-xs font-semibold text-slate-700 uppercase tracking-wide">Excluidas/Canceladas</div>
                <div className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">{Number(stats.excluidas_canceladas || 0)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {/* Búsqueda general */}
          <div className="col-span-full lg:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Búsqueda general</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                value={busqueda}
                onChange={e => {
                  const value = String(e.target.value || "");
                  const hasSearch = value.trim() !== "";
                  setBusqueda(value);
                  if (hasSearch) {
                    // Al buscar por texto, evitar que filtros restrictivos oculten coincidencias.
                    setFiltroEstado("todas");
                    setFiltroPago("todas");
                    setFiltroSemaforo("todas");
                  }
                  setPage(1);
                }}
                placeholder="Buscar por nombre, HC o DNI..."
                className="pl-8 sm:pl-10 w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-white/80"
                onFocus={(e) => {
                  e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
                }}
                style={{ boxShadow: "none" }}
              />
            </div>
            {busqueda.trim() !== "" && (
              <p className="mt-1 text-[11px] text-slate-500">
                Al buscar por texto, el sistema cambia automáticamente Estado, Pago y Semáforo a "Todas" para mostrar coincidencias.
              </p>
            )}
          </div>
          
          {/* Fecha desde */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">📅 Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-white/80"
              onFocus={(e) => {
                e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
              }}
            />
          </div>
          
          {/* Fecha hasta */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">📅 Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-white/80"
              onFocus={(e) => {
                e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
              }}
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">📌 Estado de lista</label>
            <select
              value={filtroEstado}
              onChange={(e) => {
                const nextEstado = e.target.value;
                setFiltroEstado(nextEstado);
                if (nextEstado === 'canceladas_excluidas') {
                  setFiltroPago('todas');
                }
                setPage(1);
              }}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-white/80"
              onFocus={(e) => {
                e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
              }}
            >
              <option value="activas">Activas (por defecto)</option>
              <option value="pendientes">Solo pendientes</option>
              <option value="completadas">Solo completadas</option>
              <option value="canceladas_excluidas">Canceladas / eliminadas</option>
              <option value="todas">Todas</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">💳 Pago de consulta</label>
            <select
              value={filtroPago}
              onChange={(e) => { setFiltroPago(e.target.value); setPage(1); }}
              disabled={filtroEstado === 'canceladas_excluidas'}
              className={`w-full px-3 sm:px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 ${filtroEstado === 'canceladas_excluidas' ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white/80 border-gray-300'}`}
              onFocus={(e) => {
                e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
              }}
            >
              <option value="solo_pagadas">Solo pagadas (por defecto)</option>
              <option value="solo_no_pagadas">Solo no pagadas</option>
              <option value="todas">Pagadas y no pagadas</option>
            </select>
            {filtroEstado === 'canceladas_excluidas' && (
              <p className="mt-1 text-[11px] text-gray-500">Para canceladas/eliminadas se muestra todo sin filtrar por pago.</p>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">🚦 Semáforo</label>
            <select
              value={filtroSemaforo}
              onChange={(e) => { setFiltroSemaforo(e.target.value); setPage(1); }}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-white/80"
              onFocus={(e) => {
                e.currentTarget.style.setProperty("--tw-ring-color", "var(--color-primary)");
              }}
            >
              <option value="todas">Todas</option>
              <option value="proxima">Solo Próxima</option>
            </select>
          </div>
        </div>
        
        {/* Botón limpiar filtros */}
        {(busqueda || fechaDesde || fechaHasta) && (
          <div className="mt-2 sm:mt-3 flex justify-center sm:justify-end">
            <button 
              onClick={() => {
                const hoy = getTodayYmdLocal();
                setBusqueda("");
                setFechaDesde(hoy);
                setFechaHasta(hoy);
                setFiltroSemaforo('todas');
                setPage(1);
              }}
              className="inline-flex items-center gap-1 sm:gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-all duration-200 hover:scale-105 text-sm"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Limpiar Filtros
            </button>
          </div>
        )}
        </div>
      )}

      {!esDashboard && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Torre de sala</div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
              Activos en cola: {colaActivos.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className={`rounded-xl border p-3 ${colaActual ? 'border-rose-300 bg-white animate-pulse' : 'border-slate-200 bg-white'}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Paciente en sala</div>
              {colaActual ? (
                <>
                  <div className="mt-1 text-lg font-extrabold text-rose-700">
                    {Number(colaActual?.cola_correlativo || 0) > 0 ? `N-${Number(colaActual?.cola_correlativo || 0)} · ` : ''}
                    {colaActual?.paciente_nombre} {colaActual?.paciente_apellido || ''}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${colaEstadoBadgeClass(colaActual?.cola_estado)}`}>
                      {colaEstadoLabel(colaActual?.cola_estado)}
                    </span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${colaPrioridadBadgeClass(colaActual?.cola_prioridad)}`}>
                      {colaPrioridadLabel(colaActual?.cola_prioridad)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-slate-500">Sin paciente marcado en sala.</div>
              )}
            </div>
            <div className={`rounded-xl border p-3 ${colaSiguiente ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white'}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Siguiente de cola</div>
              {colaSiguiente ? (
                <>
                  <div className="mt-1 text-lg font-extrabold text-indigo-700">
                    {Number(colaSiguiente?.cola_correlativo || 0) > 0 ? `N-${Number(colaSiguiente?.cola_correlativo || 0)} · ` : ''}
                    {colaSiguiente?.paciente_nombre} {colaSiguiente?.paciente_apellido || ''}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Siguiente</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${colaPrioridadBadgeClass(colaSiguiente?.cola_prioridad)}`}>
                      {colaPrioridadLabel(colaSiguiente?.cola_prioridad)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-slate-500">No hay siguiente marcado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {!esDashboard && (
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
        <span className="text-gray-600 font-medium">Tipo de consulta:</span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-cyan-100 text-cyan-800 border-cyan-200 font-medium">
          📅 Programada
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-amber-100 text-amber-800 border-amber-200 font-medium">
          ⚡ Espontánea
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-gray-100 text-gray-700 border-gray-200 font-medium">
          🩺 Consulta
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 font-medium">
          🔁 Reprogramada
        </span>
        <span className="mx-1 text-gray-400">|</span>
        <span className="text-gray-600 font-medium">Semáforo:</span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-rose-100 text-rose-700 border-rose-200 font-medium">
          🔴 Falta atender
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-amber-100 text-amber-800 border-amber-200 font-medium">
          🟠 Próxima
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">
          🟢 Atendida
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-300 font-medium">
          ⚪ Cancelada
        </span>
        </div>
      )}

      {!esDashboard && (
      <>
      {loading ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-8 sm:p-12 border border-white/50 flex justify-center">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 font-medium text-sm sm:text-base">🏥 Cargando consultas médicas...</p>
          </div>
        </div>
      ) : consultasPaginadas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-8 sm:p-12 border border-white/50 text-center">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">📅 No hay consultas</h3>
              <p className="text-gray-500 text-sm sm:text-base">No se encontraron consultas con los filtros aplicados</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Vista Desktop - Tabla */}
      </>
      )}
          <div className="hidden lg:block bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ background: themeGradientMain }}>
                  <tr>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">👤 Paciente</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">🔁 Tipo agenda</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">🧩 Servicios</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">🏥 HC / DNI</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">📅 Fecha</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">⏰ Hora</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">📊 Estado</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">🚨 Clasificación</th>
                    <th className="px-3 py-3 text-left text-sm font-semibold text-white">🩺 Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {consultasPaginadas.map((consulta) => {
                    const tipoMeta = getTipoConsultaMeta(consulta);
                    const agendaMeta = getAgendaMeta(consulta);
                    const origenMeta = getOrigenConsultaMeta(consulta);
                    const contratoMeta = getContratoMeta(consulta);
                    const estadoVisual = getEstadoVisual(consulta);
                    const estadoCobro = getEstadoCobro(consulta);
                    const semaforoMeta = getSemaforoMeta(consulta);
                    const fechaConsultaYmd = String(consulta?.fecha || '').slice(0, 10);
                    const esConsultaFutura = fechaConsultaYmd !== '' && fechaConsultaYmd > getHoyYmd();
                    const accionesBloqueadas = estadoCobro.faltaPagar;
                    const accionesClinicasBloqueadas = accionesBloqueadas || esConsultaFutura;
                    const tituloAccionesBloqueadas = 'No se puede operar esta consulta hasta que se registre el pago';
                    const tituloAccionesFuturas = 'La consulta tiene fecha futura. Solo puede cancelarse o reprogramarse.';
                    const serviciosResumen = obtenerServiciosResumen(consulta);
                    const consultaId = Number(consulta?.id || 0);
                    const cotizacionId = Number(consulta?.cotizacion_id || 0);
                    const estaExpandido = Boolean(expandedServicios[consultaId]);
                    const detalleServicios = cotizacionId > 0 ? (detalleServiciosByCotizacion[cotizacionId] || []) : [];
                    const loadingDetalle = Boolean(loadingDetalleServiciosByCotizacion[cotizacionId]);
                    
                    return ([
                      <tr
                        key={`row-${consulta.id}`}
                        className={`${
                          semaforoMeta.rowClass
                        } ${estadoCobro.rowClass} hover:bg-blue-100/60 transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5`}
                        title={estadoCobro.faltaPagar ? 'Esta cita está pendiente de pago. No se puede editar hasta que se registre el pago.' : ''}
                      >
                        <td className={`px-3 py-3 border-l-4 ${semaforoMeta.markerClass}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-white font-semibold text-sm">
                                {((consulta.paciente_nombre || '') + (consulta.paciente_apellido || '')).charAt(0) || 'P'}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">
                                {consulta.paciente_nombre ? `${consulta.paciente_nombre} ${consulta.paciente_apellido || ''}`.trim() : `Paciente #${consulta.paciente_id}`}
                              </div>
                              <div className="mt-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoMeta.className}`}>
                                  {tipoMeta.icon} {tipoMeta.label}
                                </span>
                                {origenMeta.visible && (
                                  <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${origenMeta.className}`}>
                                    {origenMeta.icon} {origenMeta.label}
                                  </span>
                                )}
                                {contratoMeta.visible && (
                                  <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${contratoMeta.className}`}>
                                    {contratoMeta.icon} {contratoMeta.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${agendaMeta.className}`}
                            title={agendaMeta.label === 'Reprogramada' && consulta?.reprogramada_en ? `Reprogramada el ${formatDateTime(consulta.reprogramada_en)}` : ''}
                          >
                            {agendaMeta.icon} {agendaMeta.label}
                          </span>
                          {agendaMeta.label === 'Reprogramada' && consulta?.reprogramada_en && (
                            <div className="mt-1 text-[11px] text-fuchsia-700 font-medium">
                              {formatDateTime(consulta.reprogramada_en)}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {serviciosResumen.tipos.slice(0, 3).map((tipo) => (
                              <span key={`${consulta.id}-${tipo}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-sky-50 text-sky-700 border-sky-200">
                                {etiquetaServicio(tipo)}
                              </span>
                            ))}
                            {serviciosResumen.tipos.length > 3 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-100 text-slate-700 border-slate-200">
                                +{serviciosResumen.tipos.length - 3}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-600">
                            {serviciosResumen.count} servicio(s)
                            {serviciosResumen.extras > 0 ? ` · ${serviciosResumen.extras} adicional(es)` : ''}
                          </div>
                          {cotizacionId > 0 && (
                            <button
                              onClick={() => toggleServicios(consulta)}
                              className="mt-1 text-[11px] text-blue-700 hover:text-blue-900 underline"
                            >
                              {estaExpandido ? 'Ocultar lista' : 'Ver lista'}
                            </button>
                          )}
                        </td>
                        
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                HC: {consulta.historia_clinica || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                DNI: {consulta.dni || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium text-gray-900">
                              {formatDate(consulta.fecha)}
                            </span>
                          </div>
                        </td>
                        
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium text-gray-900">
                              {consulta.hora || 'N/A'}
                            </span>
                          </div>
                        </td>
                        
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${estadoVisual.className}`}>
                              {estadoVisual.icon}
                              {estadoVisual.label}
                            </span>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colaEstadoBadgeClass(consulta?.cola_estado)}`}>
                              {Number(consulta?.cola_correlativo || 0) > 0 ? `N-${Number(consulta?.cola_correlativo || 0)} · ` : ''}
                              {colaEstadoLabel(consulta?.cola_estado)}
                            </span>
                            {Number(consulta?.cola_es_siguiente || 0) === 1 && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border border-indigo-200 bg-indigo-100 text-indigo-700">
                                Siguiente
                              </span>
                            )}
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colaPrioridadBadgeClass(consulta?.cola_prioridad)} w-fit`}>
                              {colaPrioridadLabel(consulta?.cola_prioridad)}
                            </span>
                            {estadoCobro.label && (
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${estadoCobro.badgeClass} w-fit`}>
                                {estadoCobro.label}
                              </span>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getClasificacionColor(consulta.clasificacion)}`}>
                            {getClasificacionIcon(consulta.clasificacion)}
                            {consulta.clasificacion || 'Sin clasificar'}
                          </span>
                        </td>
                        
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {/* Botones de acción desktop */}
                            {consulta.estado === 'pendiente' && !consulta.clasificacion && (
                              <>
                                <button
                                  onClick={() => actualizarEstado(consulta.id, 'completada')}
                                  disabled={accionesClinicasBloqueadas}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all duration-200 shadow-md ${
                                    accionesClinicasBloqueadas
                                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                                      : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white hover:scale-105'
                                  }`}
                                  title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : 'Completar consulta')}
                                >
                                  <span className="text-sm">✔️</span>
                                </button>
                                <button
                                  onClick={() => actualizarEstado(consulta.id, 'cancelada')}
                                  disabled={accionesBloqueadas}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all duration-200 shadow-md ${
                                    accionesBloqueadas
                                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                                      : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:scale-105'
                                  }`}
                                  title={accionesBloqueadas ? tituloAccionesBloqueadas : 'Cancelar consulta'}
                                >
                                  <span className="text-sm">✖️</span>
                                </button>
                              </>
                            )}
                            
                            <button
                              onClick={() => navigate(`/historia-clinica/${consulta.paciente_id}/${consulta.id}`)}
                              disabled={accionesClinicasBloqueadas}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all duration-200 ${
                                accionesClinicasBloqueadas
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-50'
                                  : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white hover:scale-105 shadow-md'
                              }`}
                              title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : 'Ver Historia Clínica')}
                            >
                              <span className="text-sm">📖</span>
                            </button>
                            
                            {onIniciarConsulta && (
                              <button
                                onClick={() => onIniciarConsulta(consulta)}
                                disabled={accionesClinicasBloqueadas}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md ${
                                  accionesClinicasBloqueadas
                                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                                    : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white hover:scale-105'
                                }`}
                                title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : 'Iniciar consulta')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Iniciar
                              </button>
                            )}
                            
                            {onVerDetalle && (
                              <button
                                onClick={() => onVerDetalle(consulta)}
                                disabled={accionesBloqueadas}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md ${
                                  accionesBloqueadas
                                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-60'
                                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white hover:scale-105'
                                }`}
                                title={accionesBloqueadas ? tituloAccionesBloqueadas : 'Ver detalle'}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Ver
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>,
                      estaExpandido ? (
                        <tr key={`det-${consulta.id}`} className="bg-slate-50">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="text-xs text-slate-600 mb-2 font-semibold">Servicios asociados a la consulta</div>
                            {loadingDetalle ? (
                              <div className="text-xs text-slate-500">Cargando servicios...</div>
                            ) : detalleServicios.length === 0 ? (
                              <div className="text-xs text-slate-500">No se encontraron detalles de servicios en la cotización asociada.</div>
                            ) : (
                              <div className="space-y-1">
                                {detalleServicios.map((item) => (
                                  <div key={`${consulta.id}-${item.id}-${item.tipo}`} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1.5">
                                    <div>
                                      <span className="font-semibold text-slate-700">{item.tipo}</span>
                                      {item.descripcion ? <span className="text-slate-600"> · {item.descripcion}</span> : null}
                                    </div>
                                    <div className="text-slate-600">x{item.cantidad} · S/ {Number(item.subtotal || 0).toFixed(2)}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null
                    ]);
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vista Móvil - Tarjetas */}
          <div className="lg:hidden space-y-3 sm:space-y-4">
            {consultasPaginadas.map((consulta) => {
              const tipoMeta = getTipoConsultaMeta(consulta);
              const agendaMeta = getAgendaMeta(consulta);
              const origenMeta = getOrigenConsultaMeta(consulta);
              const contratoMeta = getContratoMeta(consulta);
              const estadoVisual = getEstadoVisual(consulta);
              const estadoCobro = getEstadoCobro(consulta);
              const semaforoMeta = getSemaforoMeta(consulta);
              const fechaConsultaYmd = String(consulta?.fecha || '').slice(0, 10);
              const esConsultaFutura = fechaConsultaYmd !== '' && fechaConsultaYmd > getHoyYmd();
              const accionesBloqueadas = estadoCobro.faltaPagar;
              const accionesClinicasBloqueadas = accionesBloqueadas || esConsultaFutura;
              const tituloAccionesBloqueadas = 'No se puede operar esta consulta hasta que se registre el pago';
              const tituloAccionesFuturas = 'La consulta tiene fecha futura. Solo puede cancelarse o reprogramarse.';
              const serviciosResumen = obtenerServiciosResumen(consulta);
              const consultaId = Number(consulta?.id || 0);
              const cotizacionId = Number(consulta?.cotizacion_id || 0);
              const estaExpandido = Boolean(expandedServicios[consultaId]);
              const detalleServicios = cotizacionId > 0 ? (detalleServiciosByCotizacion[cotizacionId] || []) : [];
              const loadingDetalle = Boolean(loadingDetalleServiciosByCotizacion[cotizacionId]);
              return (
              <div
                key={consulta.id}
                  title={estadoCobro.faltaPagar ? 'Esta cita está pendiente de pago' : ''}
                className={`backdrop-blur-sm rounded-xl shadow-lg border-l-4 p-4 hover:shadow-xl transition-all duration-200 hover:scale-[1.02] ${
                  semaforoMeta.cardClass
                  } ${semaforoMeta.markerClass} ${estadoCobro.rowClass}`}
              >
                {/* Header de la tarjeta con paciente */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-lg">
                      {((consulta.paciente_nombre || '') + (consulta.paciente_apellido || '')).charAt(0) || 'P'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {consulta.paciente_nombre ? `${consulta.paciente_nombre} ${consulta.paciente_apellido || ''}`.trim() : `Paciente #${consulta.paciente_id}`}
                    </h3>
                    <p className="text-sm text-gray-500">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoMeta.className}`}>
                        {tipoMeta.icon} {tipoMeta.label}
                      </span>
                      {origenMeta.visible && (
                        <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${origenMeta.className}`}>
                          {origenMeta.icon} {origenMeta.label}
                        </span>
                      )}
                      {contratoMeta.visible && (
                        <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${contratoMeta.className}`}>
                          {contratoMeta.icon} {contratoMeta.label}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Información en grid */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-gray-600 font-medium">📅 Fecha</p>
                    <p className="text-gray-900">{formatDate(consulta.fecha)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">⏰ Hora</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-gray-900">{consulta.hora || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">🏥 HC</p>
                    <p className="text-gray-900">{consulta.historia_clinica || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-medium">👤 DNI</p>
                    <p className="text-gray-900">{consulta.dni || 'N/A'}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-gray-600 font-medium text-sm mb-1">🧩 Servicios asociados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {serviciosResumen.tipos.slice(0, 3).map((tipo) => (
                      <span key={`${consulta.id}-m-${tipo}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-sky-50 text-sky-700 border-sky-200">
                        {etiquetaServicio(tipo)}
                      </span>
                    ))}
                    {serviciosResumen.tipos.length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-100 text-slate-700 border-slate-200">
                        +{serviciosResumen.tipos.length - 3}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {serviciosResumen.count} servicio(s)
                    {serviciosResumen.extras > 0 ? ` · ${serviciosResumen.extras} adicional(es)` : ''}
                  </p>
                  {cotizacionId > 0 && (
                    <button
                      onClick={() => toggleServicios(consulta)}
                      className="mt-1 text-[11px] text-blue-700 hover:text-blue-900 underline"
                    >
                      {estaExpandido ? 'Ocultar lista' : 'Ver lista'}
                    </button>
                  )}
                </div>

                {estaExpandido && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="text-xs text-slate-600 mb-2 font-semibold">Servicios asociados a la consulta</div>
                    {loadingDetalle ? (
                      <div className="text-xs text-slate-500">Cargando servicios...</div>
                    ) : detalleServicios.length === 0 ? (
                      <div className="text-xs text-slate-500">No se encontraron detalles de servicios en la cotización asociada.</div>
                    ) : (
                      <div className="space-y-1">
                        {detalleServicios.map((item) => (
                          <div key={`${consulta.id}-m-${item.id}-${item.tipo}`} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1.5">
                            <div>
                              <span className="font-semibold text-slate-700">{item.tipo}</span>
                              {item.descripcion ? <span className="text-slate-600"> · {item.descripcion}</span> : null}
                            </div>
                            <div className="text-slate-600">x{item.cantidad} · S/ {Number(item.subtotal || 0).toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Estados */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${agendaMeta.className}`}
                    title={agendaMeta.label === 'Reprogramada' && consulta?.reprogramada_en ? `Reprogramada el ${formatDateTime(consulta.reprogramada_en)}` : ''}
                  >
                    {agendaMeta.icon}
                    {agendaMeta.label}
                  </span>
                  {agendaMeta.label === 'Reprogramada' && consulta?.reprogramada_en && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
                      {formatDateTime(consulta.reprogramada_en)}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${estadoVisual.className}`}>
                    {estadoVisual.icon}
                    {estadoVisual.label}
                  </span>
                  {estadoCobro.label && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${estadoCobro.badgeClass}`}>
                      {estadoCobro.label}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getClasificacionColor(consulta.clasificacion)}`}>
                    {getClasificacionIcon(consulta.clasificacion)}
                    {consulta.clasificacion || 'Sin clasificar'}
                  </span>
                </div>

                {/* Botones de acción móvil */}
                <div className="flex flex-wrap gap-2">
                  {consulta.estado === 'pendiente' && !consulta.clasificacion && (
                    <>
                      <button
                        onClick={() => actualizarEstado(consulta.id, 'completada')}
                        disabled={accionesClinicasBloqueadas}
                        title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : 'Completar consulta')}
                        className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                          accionesClinicasBloqueadas
                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60'
                            : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                        }`}
                      >
                        <span>✔️</span>
                        <span className="hidden sm:inline">Completar</span>
                      </button>
                      <button
                        onClick={() => actualizarEstado(consulta.id, 'cancelada')}
                        disabled={accionesBloqueadas}
                        title={accionesBloqueadas ? tituloAccionesBloqueadas : 'Cancelar consulta'}
                        className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                          accionesBloqueadas
                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60'
                            : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
                        }`}
                      >
                        <span>✖️</span>
                        <span className="hidden sm:inline">Cancelar</span>
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={() => navigate(`/historia-clinica/${consulta.paciente_id}/${consulta.id}`)}
                    disabled={accionesClinicasBloqueadas}
                    title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : '')}
                      className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                        accionesClinicasBloqueadas
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                      }`}
                  >
                    <span>📖</span>
                    <span className="hidden sm:inline">Historia</span>
                  </button>
                  
                  {onIniciarConsulta && (
                    <button
                      onClick={() => onIniciarConsulta(consulta)}
                      disabled={accionesClinicasBloqueadas}
                      title={esConsultaFutura ? tituloAccionesFuturas : (accionesBloqueadas ? tituloAccionesBloqueadas : 'Iniciar consulta')}
                      className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                        accionesClinicasBloqueadas
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60'
                          : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="hidden sm:inline">Iniciar</span>
                    </button>
                  )}
                  
                  {onVerDetalle && (
                    <button
                      onClick={() => onVerDetalle(consulta)}
                      disabled={accionesBloqueadas}
                      title={accionesBloqueadas ? tituloAccionesBloqueadas : 'Ver detalle'}
                      className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                        accionesBloqueadas
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60'
                          : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="hidden sm:inline">Ver</span>
                    </button>
                  )}
                </div>
              </div>
            );})}
          </div>
        </>
      )}

      {/* Mensaje de estado */}
      {!esDashboard && msg && (
        <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-100 border border-blue-300 rounded-lg sm:rounded-xl text-blue-800 text-center text-sm sm:text-base">
          {msg}
        </div>
      )}

      {/* Paginación moderna responsive */}
      {!esDashboard && totalRows > 0 && (
        <div className="mt-4 sm:mt-8 bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 border border-white/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Controles de página */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handlePrev}
                disabled={page === 1}
                className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden sm:inline">Anterior</span>
              </button>
              
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-gray-600 font-medium text-sm sm:text-base">
                  {page}/{totalPages}
                </span>
              </div>
              
              <button
                onClick={handleNext}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Selector de filas por página */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <label className="text-xs sm:text-sm font-medium text-gray-700">
                📄 <span className="hidden sm:inline">Filas por página:</span><span className="sm:hidden">Por página:</span>
              </label>
              <select
                value={rowsPerPage}
                onChange={handleRowsPerPage}
                className="px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              
              <span className="text-xs sm:text-sm text-gray-500 text-center sm:text-left">
                <span className="block sm:inline">{consultasPaginadas.length} de {totalRows}</span>
                <span className="hidden sm:inline"> consultas</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MedicoConsultas;