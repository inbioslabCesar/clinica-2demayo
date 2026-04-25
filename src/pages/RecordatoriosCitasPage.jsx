import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
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

function esConsultaHcProxima(item) {
  return String(item?.origen_consulta || "") === "hc_proxima";
}

function tipoConsultaLabel(item) {
  const tipo = String(item?.tipo_consulta || "").toLowerCase();
  if (tipo === "programada") return "Programada";
  if (tipo === "espontanea") return "Espontanea";
  return tipo ? `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}` : "Sin tipo";
}

function tipoConsultaBadge(item) {
  const tipo = String(item?.tipo_consulta || "").toLowerCase();
  if (tipo === "programada") {
    return "bg-sky-100 text-sky-700 border-sky-200";
  }
  if (tipo === "espontanea") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function obtenerPrioridad(item) {
  const dias = diasParaCita(item?.fecha);
  const estado = String(item?.estado_gestion || "pendiente");
  const sinTelefono = !String(item?.paciente_telefono || "").trim();

  if (consultaAtendidaEnHC(item)) {
    return { nivel: "atendido", etiqueta: "Atendido", orden: 4, badge: "bg-violet-100 text-violet-700 border-violet-200" };
  }

  if (estado === "confirmado" || estado === "cancelado") {
    return { nivel: "resuelto", etiqueta: "Resuelto", orden: 5, badge: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }

  if (dias === 0 && ["pendiente", "no_contesta"].includes(estado)) {
    return { nivel: "critico", etiqueta: "Critico", orden: 0, badge: "bg-rose-100 text-rose-700 border-rose-200" };
  }

  if ((dias === 1 && ["pendiente", "no_contesta"].includes(estado)) || (sinTelefono && estado !== "confirmado")) {
    return { nivel: "alto", etiqueta: "Alto", orden: 1, badge: "bg-amber-100 text-amber-700 border-amber-200" };
  }

  if (["pendiente", "contactado", "no_contesta", "reprogramar"].includes(estado)) {
    return { nivel: "normal", etiqueta: "Normal", orden: 2, badge: "bg-sky-100 text-sky-700 border-sky-200" };
  }

  return { nivel: "bajo", etiqueta: "Bajo", orden: 3, badge: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function RecordatoriosCitasPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [dias, setDias] = useState(30);
  const [estadoGestion, setEstadoGestion] = useState("");
  const [origenConsulta, setOrigenConsulta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinGestion, setSoloSinGestion] = useState(false);
  const [vistaRapida, setVistaRapida] = useState("todas");
  const [filaActivaId, setFilaActivaId] = useState(null);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dias: String(dias),
        estado_gestion: estadoGestion,
        origen_consulta: origenConsulta,
        busqueda: busqueda.trim(),
        solo_sin_gestion: soloSinGestion ? "1" : "0",
        _t: String(Date.now()),
      });
      const res = await fetch(`${BASE_URL}api_recordatorios_citas.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo cargar recordatorios");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Error cargando recordatorios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, estadoGestion, origenConsulta, soloSinGestion]);

  useEffect(() => {
    setPage(1);
  }, [dias, estadoGestion, origenConsulta, soloSinGestion, busqueda, vistaRapida, rowsPerPage]);

  const pendientesUrgentes = useMemo(
    () => items.filter((item) => {
      const d = diasParaCita(item.fecha);
      return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
    }).length,
    [items]
  );

  const metricas = useMemo(() => {
    const urgentes = items.filter((item) => {
      const d = diasParaCita(item.fecha);
      return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
    }).length;
    const hoy = items.filter((item) => diasParaCita(item.fecha) === 0).length;
    const sinTelefono = items.filter((item) => !String(item.paciente_telefono || "").trim()).length;
    const confirmadas = items.filter((item) => item.estado_gestion === "confirmado").length;
    const atendidas = items.filter((item) => consultaAtendidaEnHC(item)).length;
    return { urgentes, hoy, sinTelefono, confirmadas, atendidas };
  }, [items]);

  const itemsVista = useMemo(() => {
    if (vistaRapida === "criticos") {
      return items.filter((item) => {
        const d = diasParaCita(item.fecha);
        return d === 0 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
      });
    }
    if (vistaRapida === "urgentes") {
      return items.filter((item) => {
        const d = diasParaCita(item.fecha);
        return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion) && !consultaAtendidaEnHC(item);
      });
    }
    if (vistaRapida === "sin_telefono") {
      return items.filter((item) => !String(item.paciente_telefono || "").trim());
    }
    if (vistaRapida === "confirmadas") {
      return items.filter((item) => item.estado_gestion === "confirmado");
    }
    if (vistaRapida === "atendidas") {
      return items.filter((item) => consultaAtendidaEnHC(item));
    }
    return items;
  }, [items, vistaRapida]);

  const itemsPriorizados = useMemo(() => {
    const enriched = itemsVista.map((item) => {
      const prioridad = obtenerPrioridad(item);
      const diasRestantes = diasParaCita(item.fecha);
      return { ...item, prioridad, diasRestantes };
    });

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
  }, [itemsVista]);

  const resumenPrioridad = useMemo(() => {
    const resumen = { critico: 0, alto: 0, normal: 0, bajo: 0, atendido: 0, resuelto: 0 };
    itemsPriorizados.forEach((i) => {
      const key = i.prioridad?.nivel || "normal";
      resumen[key] = (resumen[key] || 0) + 1;
    });
    return resumen;
  }, [itemsPriorizados]);

  const siguienteLlamada = useMemo(
    () => itemsPriorizados.find((item) => !["confirmado", "cancelado"].includes(String(item.estado_gestion || "")) && !consultaAtendidaEnHC(item)) || null,
    [itemsPriorizados]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(itemsPriorizados.length / rowsPerPage)),
    [itemsPriorizados.length, rowsPerPage]
  );

  const itemsPaginados = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return itemsPriorizados.slice(start, start + rowsPerPage);
  }, [itemsPriorizados, page, rowsPerPage]);

  const enfocarSiguienteLlamada = () => {
    if (!siguienteLlamada) return;
    const idx = itemsPriorizados.findIndex((item) => item.id === siguienteLlamada.id);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / rowsPerPage) + 1;
      setPage(targetPage);
    }
    setFilaActivaId(siguienteLlamada.id);
    window.setTimeout(() => {
      const el = document.getElementById(`rc-row-${siguienteLlamada.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
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
      const res = await fetch(`${BASE_URL}api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

  const crearCotizacion = async (item) => {
    if (item.cotizacion_id) {
      navigate(`/cobrar-cotizacion/${item.cotizacion_id}`);
      return;
    }
    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await fetch(`${BASE_URL}api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
              Urgentes (hoy/manana sin confirmar): {pendientesUrgentes}
            </div>
          </div>

          <QuickAccessNav keys={["pacientes", "recordatorios", "listaConsultas", "cotizaciones", "reporteCaja"]} className="mt-4" />

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Horizonte</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              >
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
              >
                <option value="">Todos</option>
                <option value="agendada">Agendada</option>
                <option value="hc_proxima">HC proxima</option>
                <option value="cotizador">Cotizador</option>
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

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3 text-left">Cita</th>
                <th className="p-3 text-left">Prioridad</th>
                <th className="p-3 text-left">Paciente</th>
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
                  <td colSpan={8} className="p-5 text-center text-slate-500">Cargando recordatorios...</td>
                </tr>
              ) : itemsPriorizados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-5 text-center text-slate-500">No hay citas para la vista seleccionada.</td>
                </tr>
              ) : (
                itemsPaginados.map((item) => {
                  const diasRestantes = item.diasRestantes;
                  const esHcProxima = esConsultaHcProxima(item);
                  const esControl = Number(item?.es_control || 0) === 1;
                  const esTipoProgramada = String(item?.tipo_consulta || "").toLowerCase() === "programada";
                  const mostrarBadgeTipo = !(esHcProxima && esTipoProgramada);
                  const estadoCotizacion = String(item?.cotizacion_estado || "").toLowerCase();
                  const cotizacionPagada =
                    estadoCotizacion === "pagado" || estadoCotizacion === "pagada" || estadoCotizacion === "control";
                  const puedeRegistrarCobro = !item.cotizacion_id
                    && !esControl
                    && (item.estado_consulta === "falta_cancelar" || Number(item.hc_origen_id || 0) > 0);
                  return (
                    <tr id={`rc-row-${item.id}`} key={item.id} className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${item.prioridad.nivel === "critico" ? "bg-rose-50/30" : ""} ${filaActivaId === item.id ? "ring-2 ring-indigo-300 bg-indigo-50/40" : ""}`}>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">#{item.id}</div>
                        <div className="text-xs text-slate-600">{formatFechaHora(item.fecha, item.hora)}</div>
                        <div className="text-xs font-semibold text-rose-700">
                          {diasRestantes === 0
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
                      <td className="p-3 text-slate-700">{item.medico_nombre} {item.medico_apellido}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoBadgeClasses(item.estado_gestion)}`}>
                          {estadoLabel(item.estado_gestion)}
                        </span>
                        <div className="mt-1 text-xs text-slate-500">
                          Prox: {item.fecha_proximo_contacto ? item.fecha_proximo_contacto.replace("T", " ") : "-"}
                        </div>
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
                        </div>
                      </td>
                    </tr>
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
                Mostrando {itemsPaginados.length} de {itemsPriorizados.length} registro(s)
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
                Pagina {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
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
