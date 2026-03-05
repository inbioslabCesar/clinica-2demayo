import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";
import { FiEdit3, FiEye, FiSlash, FiDollarSign } from "react-icons/fi";

const serviceRouteMap = {
  laboratorio: "/cotizar-laboratorio",
  rayosx: "/cotizar-rayosx",
  rayos_x: "/cotizar-rayosx",
  "rayos x": "/cotizar-rayosx",
  ecografia: "/cotizar-ecografia",
  operacion: "/cotizar-operacion",
  operaciones: "/cotizar-operacion",
  procedimiento: "/cotizar-procedimientos",
  procedimientos: "/cotizar-procedimientos",
  farmacia: "/cotizar-farmacia",
};

function normalizarServicioTipo(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "";
  if (base === "rayos_x" || base === "rayos x") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  return base;
}

export default function CotizacionesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const autoAnularRef = useRef(false);

  const actionBtnBase = "inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-transform hover:scale-105";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [qInput, setQInput] = useState("");
  const [estadoInput, setEstadoInput] = useState("");
  const [fechaInicioInput, setFechaInicioInput] = useState(today);
  const [fechaFinInput, setFechaFinInput] = useState(today);
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    q: "",
    estado: "",
    fechaInicio: today,
    fechaFin: today,
  });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("include_detalles", "0");
      if (filtrosAplicados.q.trim()) params.set("q", filtrosAplicados.q.trim());
      if (filtrosAplicados.estado) params.set("estado", filtrosAplicados.estado);
      if (filtrosAplicados.fechaInicio && filtrosAplicados.fechaFin) {
        params.set("fecha_inicio", filtrosAplicados.fechaInicio);
        params.set("fecha_fin", filtrosAplicados.fechaFin);
      }

      const res = await fetch(`${BASE_URL}api_cotizaciones.php?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar cotizaciones");
      }
      setRows(Array.isArray(data.cotizaciones) ? data.cotizaciones : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo cargar la lista", "error");
    } finally {
      setLoading(false);
    }
  }, [filtrosAplicados, limit, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const filtrar = () => {
    setPage(1);
    setFiltrosAplicados({
      q: qInput,
      estado: estadoInput,
      fechaInicio: fechaInicioInput,
      fechaFin: fechaFinInput,
    });
  };

  const limpiarFiltros = () => {
    setQInput("");
    setEstadoInput("");
    setFechaInicioInput(today);
    setFechaFinInput(today);
    setPage(1);
    setFiltrosAplicados({
      q: "",
      estado: "",
      fechaInicio: today,
      fechaFin: today,
    });
  };

  const badgeEstado = (value) => {
    const st = String(value || "").toLowerCase();
    if (st === "pagado") return "bg-green-100 text-green-700";
    if (st === "parcial") return "bg-amber-100 text-amber-700";
    if (st === "anulada") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  const anularCotizacion = useCallback(async (cotizacion) => {
    const { value: motivo } = await Swal.fire({
      title: `Anular cotización #${cotizacion.id}`,
      input: "text",
      inputLabel: "Motivo de anulación",
      inputPlaceholder: "Escribe el motivo",
      showCancelButton: true,
      confirmButtonText: "Anular",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "Motivo obligatorio";
        if (value.trim().length < 4) return "Mínimo 4 caracteres";
        return undefined;
      },
    });

    if (!motivo) return;

    try {
      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "anular",
          cotizacion_id: Number(cotizacion.id),
          motivo: motivo.trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo anular");
      Swal.fire("Listo", "Cotización anulada", "success");
      await cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo anular", "error");
    }
  }, [cargar]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const accion = String(sp.get("accion") || "").toLowerCase();
    const cotizacionId = Number(sp.get("cotizacion_id") || 0);
    if (accion !== "anular" || !cotizacionId || autoAnularRef.current || loading) return;

    autoAnularRef.current = true;

    const ejecutarAnulacion = async () => {
      let cotizacionObjetivo = rows.find((r) => Number(r.id) === cotizacionId) || null;

      if (!cotizacionObjetivo) {
        try {
          const res = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, {
            credentials: "include",
          });
          const data = await res.json();
          if (data?.success && data?.cotizacion) {
            cotizacionObjetivo = data.cotizacion;
          }
        } catch {
          // mantener null para manejar abajo
        }
      }

      if (!cotizacionObjetivo) {
        Swal.fire("Atención", `No se encontró la cotización #${cotizacionId}.`, "warning");
        return;
      }

      if (String(cotizacionObjetivo.estado || "").toLowerCase() === "anulada") {
        Swal.fire("Info", `La cotización #${cotizacionId} ya está anulada.`, "info");
        return;
      }

      await anularCotizacion(cotizacionObjetivo);
    };

    ejecutarAnulacion();
  }, [location.search, loading, rows, anularCotizacion]);

  const ajustarItemCotizacion = async (cotizacion) => {
    let detalles = Array.isArray(cotizacion.detalles) ? cotizacion.detalles : [];
    if (!detalles.length) {
      try {
        const resCot = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacion.id)}`, {
          credentials: "include",
        });
        const dataCot = await resCot.json();
        if (!dataCot?.success || !dataCot?.cotizacion) {
          throw new Error(dataCot?.error || "No se pudo cargar detalle de cotización");
        }
        detalles = Array.isArray(dataCot.cotizacion.detalles) ? dataCot.cotizacion.detalles : [];
      } catch (error) {
        Swal.fire("Error", error?.message || "No se pudo cargar el detalle para ajustar", "error");
        return;
      }
    }

    if (!detalles.length) {
      Swal.fire("Sin detalle", "No hay ítems para ajustar en esta cotización.", "info");
      return;
    }

    const activos = detalles.filter((d) => Number(d.cantidad || 0) > 0);
    if (!activos.length) {
      Swal.fire("Sin ítems activos", "Todos los ítems ya fueron ajustados.", "info");
      return;
    }

    const options = {};
    activos.forEach((d) => {
      options[String(d.id)] = `${d.servicio_tipo} | ${d.descripcion} | Cant: ${d.cantidad} | S/ ${Number(d.subtotal || 0).toFixed(2)}`;
    });

    const sel = await Swal.fire({
      title: `Ajustar cotización #${cotizacion.id}`,
      input: "select",
      inputOptions: options,
      inputPlaceholder: "Selecciona un ítem",
      showCancelButton: true,
      confirmButtonText: "Siguiente",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => (!value ? "Selecciona un ítem" : undefined),
    });
    if (!sel.isConfirmed) return;

    const item = activos.find((d) => String(d.id) === String(sel.value));
    if (!item) return;

    const qty = await Swal.fire({
      title: "Cantidad a quitar",
      input: "number",
      inputValue: 1,
      inputAttributes: {
        min: "1",
        max: String(Math.max(1, Number(item.cantidad || 1))),
        step: "1",
      },
      showCancelButton: true,
      confirmButtonText: "Siguiente",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) return "Ingresa una cantidad válida";
        if (n > Number(item.cantidad || 0)) return "No puede ser mayor a la cantidad actual";
        return undefined;
      },
    });
    if (!qty.isConfirmed) return;

    const motivo = await Swal.fire({
      title: "Motivo del ajuste",
      input: "text",
      inputPlaceholder: "Escribe el motivo",
      showCancelButton: true,
      confirmButtonText: "Aplicar ajuste",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "Motivo obligatorio";
        if (value.trim().length < 4) return "Mínimo 4 caracteres";
        return undefined;
      },
    });
    if (!motivo.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "devolucion_item",
          cotizacion_id: Number(cotizacion.id),
          cotizacion_detalle_id: Number(item.id),
          cantidad_eliminar: Number(qty.value),
          motivo: String(motivo.value || "").trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo aplicar el ajuste");
      Swal.fire("Listo", `Ajuste aplicado. Monto devuelto: S/ ${Number(data.monto_devuelto || 0).toFixed(2)}`, "success");
      cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo aplicar el ajuste", "error");
    }
  };

  const irEditarServicio = (cotizacion, servicioTipo) => {
    const tipo = normalizarServicioTipo(servicioTipo);
    if (tipo === "consulta") {
      navigate(`/agendar-consulta?cotizacion_id=${cotizacion.id}`, {
        state: { pacienteId: cotizacion.paciente_id, backTo: "/cotizaciones" },
      });
      return;
    }

    const base = serviceRouteMap[tipo];
    if (!base) return;
    navigate(`${base}/${cotizacion.paciente_id}?cotizacion_id=${cotizacion.id}`);
  };

  return (
    <div className="max-w-full mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold text-purple-800">Cotizaciones</h2>
          <div className="text-sm text-gray-600">Total registros: <b>{total}</b></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar paciente, DNI, HC o ID"
            className="border rounded px-3 py-2 md:col-span-2"
          />
          <select
            value={estadoInput}
            onChange={(e) => setEstadoInput(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagado">Pagado</option>
            <option value="anulada">Anulada</option>
          </select>
          <input
            type="date"
            value={fechaInicioInput}
            onChange={(e) => setFechaInicioInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="date"
            value={fechaFinInput}
            onChange={(e) => setFechaFinInput(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={filtrar} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Filtrar</button>
          <button onClick={limpiarFiltros} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Paciente</th>
                <th className="px-3 py-2 text-left">Quién cotizó</th>
                <th className="px-3 py-2 text-left">Servicios</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">Sin resultados</td>
                </tr>
              ) : rows.map((row) => {
                const estadoRow = String(row.estado || "").toLowerCase();
                const servicios = Array.from(new Set(
                  String(row.servicios_tipos || "")
                    .split(",")
                    .map((s) => normalizarServicioTipo(s))
                    .filter(Boolean)
                ));
                return (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-2 font-semibold">#{row.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.fecha}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.nombre} {row.apellido}</div>
                      <div className="text-xs text-gray-500">DNI: {row.dni || "-"} | HC: {row.historia_clinica || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{row.usuario_nombre || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {servicios.length === 0 ? <span className="text-gray-400">-</span> : servicios.map((s) => (
                          <button
                            key={`${row.id}-${s}`}
                            onClick={() => irEditarServicio(row, s)}
                            className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"
                            title="Abrir servicio"
                          >
                            {estadoRow === "anulada" ? `${s} (anulada)` : s}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.total || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">S/ {Number(row.saldo_pendiente ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeEstado(row.estado)}`}>
                        {row.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => navigate(`/consumo-paciente/${row.paciente_id}?cotizacion_id=${row.id}&back_to=/cotizaciones`)}
                          className={`${actionBtnBase} bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200`}
                          title="Ver detalle"
                          aria-label="Ver detalle"
                        >
                          <FiEye className="text-sm" />
                        </button>
                        {(String(row.estado || "").toLowerCase() === "pendiente" || String(row.estado || "").toLowerCase() === "parcial") && (
                          <button
                            onClick={() => navigate(`/cobrar-cotizacion/${row.id}`)}
                            className={`${actionBtnBase} bg-green-100 text-green-700 border-green-200 hover:bg-green-200`}
                            title="Cobrar"
                            aria-label="Cobrar"
                          >
                            <FiDollarSign className="text-sm" />
                          </button>
                        )}
                        {String(row.estado || "").toLowerCase() !== "anulada" && (
                          <button
                            onClick={() => anularCotizacion(row)}
                            className={`${actionBtnBase} bg-red-100 text-red-700 border-red-200 hover:bg-red-200`}
                            title="Anular"
                            aria-label="Anular"
                          >
                            <FiSlash className="text-sm" />
                          </button>
                        )}
                        {(String(row.estado || "").toLowerCase() === "pagado" || String(row.estado || "").toLowerCase() === "parcial") && (
                          <button
                            onClick={() => ajustarItemCotizacion(row)}
                            className={`${actionBtnBase} bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200`}
                            title="Ajustar ítem"
                            aria-label="Ajustar ítem"
                          >
                            <FiEdit3 className="text-sm" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <div className="text-sm text-gray-600">Página {page} de {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Siguiente
            </button>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="border rounded px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
