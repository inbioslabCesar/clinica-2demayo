import MovimientosModal from "./MovimientosModal";
import { FaInfoCircle, FaEdit, FaHistory, FaLock, FaPills, FaVial, FaCalendarAlt, FaExclamationTriangle } from "react-icons/fa";
import { FaTrash } from "react-icons/fa";
import MedicamentoForm from "./MedicamentoForm";
// ...hooks de filtro de fecha solo dentro de la función...
// ...hooks de cuarentena solo dentro de la función...
// ...existing code...
import { useEffect, useRef, useState } from "react";

import { BASE_URL } from "../config/config";
import useUsuarioLogueado from "../hooks/useUsuarioLogueado";
import Swal from "sweetalert2";

const CRITICAL_STOCK = 5;
const LOW_STOCK_MAX = 15;
const EXPIRY_RED_DAYS = 30;
const EXPIRY_ORANGE_DAYS = 90;

function getDiasVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  const venc = new Date(fechaVencimiento);
  return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
}

function getNivelAlerta({ stock, diasVencimiento }) {
  if (
    Number(stock) < CRITICAL_STOCK ||
    (typeof diasVencimiento === "number" && diasVencimiento < EXPIRY_RED_DAYS)
  ) {
    return "red";
  }
  if (
    (Number(stock) >= CRITICAL_STOCK && Number(stock) <= LOW_STOCK_MAX) ||
    (typeof diasVencimiento === "number" && diasVencimiento < EXPIRY_ORANGE_DAYS)
  ) {
    return "orange";
  }
  return "green";
}

function formatStockLabel(stock, unitsPorCaja) {
  const total = Math.max(0, Number(stock) || 0);
  const porCaja = Math.max(1, Number(unitsPorCaja) || 1);
  const cajas = Math.floor(total / porCaja);
  const unidades = total % porCaja;

  if (cajas > 0 && unidades > 0) {
    return `Cajas: ${cajas} | Unidades: ${unidades}`;
  }
  if (cajas > 0 && unidades === 0) {
    return `${cajas === 1 ? "1 Caja" : `${cajas} Cajas`} (${total} und)`;
  }
  return `${total} ${total === 1 ? "unidad" : "unidades"}`;
}

// Componente Badge para Stock
const StockBadge = ({ stock, unitsPorCaja = 30, fechaVencimiento }) => {
  const diasVencimiento = getDiasVencimiento(fechaVencimiento);
  const nivel = getNivelAlerta({ stock, diasVencimiento });
  const label = formatStockLabel(stock, unitsPorCaja);

  const stylesByNivel = {
    green: {
      bg: "bg-green-100",
      text: "text-green-800",
      border: "#16a34a",
      icon: "✅",
    },
    orange: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      border: "#ea580c",
      icon: "⚠️",
    },
    red: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "#dc2626",
      icon: "🚨",
    },
  };

  const style = stylesByNivel[nivel];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${style.bg} ${style.text} px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold border transition-all duration-200`}
      style={{ borderColor: style.border, opacity: 0.95 }}
      title={label}
    >
      <span>{style.icon}</span>
      <span>{label}</span>
    </span>
  );
};

// Componente Badge para Vencimiento
const VencimientoBadge = ({ fechaVencimiento, stock }) => {
  if (!fechaVencimiento) {
    return <span className="text-xs text-gray-500 px-2 py-1">-</span>;
  }
  const diff = getDiasVencimiento(fechaVencimiento);
  const nivel = getNivelAlerta({ stock, diasVencimiento: diff });

  let bgColor = "bg-green-100";
  let textColor = "text-green-800";
  let icon = "✅";
  let label = `Vence en ${diff}d`;

  if (nivel === "red") {
    bgColor = "bg-red-100";
    textColor = "text-red-800";
    icon = diff < 0 ? "❌" : "🚨";
    label = diff < 0 ? "Vencido" : `Vence en ${diff}d`;
  } else if (nivel === "orange") {
    bgColor = "bg-orange-100";
    textColor = "text-orange-800";
    icon = "⚠️";
  }
  
  return (
    <span className={`inline-flex items-center gap-1 ${bgColor} ${textColor} px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold border transition-all duration-200`}
          style={{
            borderColor: bgColor === "bg-green-100" ? "#16a34a" : bgColor === "bg-red-100" ? "#dc2626" : "#ea580c",
            opacity: 0.95
          }}>
      <span className="text-[10px]">{icon}</span>
      <span>{label}</span>
    </span>
  );
};

export default function MedicamentosList() {
  const REQUEST_TIMEOUT_MS = 12000;
    const [deleteLoading, setDeleteLoading] = useState(false);
    const handleDelete = async (med) => {
      const confirm = await Swal.fire({
        title: `¿Seguro que deseas eliminar el medicamento "${med.nombre}"?`,
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#d33",
      });
      if (!confirm.isConfirmed) return;
      setDeleteLoading(true);
      const apiUrl = `${BASE_URL}api_medicamentos.php`;
      try {
        const res = await fetch(apiUrl, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: med.id })
        });
        const result = await res.json();
        if (result.success) {
          await Swal.fire("¡Eliminado!", "El medicamento ha sido eliminado correctamente.", "success");
          fetchMedicamentos();
        } else {
          // Detectar error de clave foránea
          if (result.error && result.error.includes("foreign key constraint fails")) {
            await Swal.fire({
              title: "No se puede eliminar",
              text: "Este medicamento tiene movimientos registrados. Elimina primero los movimientos asociados antes de borrar el medicamento.",
              icon: "error",
              confirmButtonText: "Entendido",
              confirmButtonColor: "#3085d6"
            });
          } else {
            await Swal.fire("Error", result.error || "Error al eliminar", "error");
          }
        }
      } catch {
        await Swal.fire("Error", "Error de red o servidor", "error");
      }
      setDeleteLoading(false);
    };
  const usuarioLogueado = useUsuarioLogueado();
  const [detalleMed, setDetalleMed] = useState(null);
  const [filtroVencDesde, setFiltroVencDesde] = useState("");
  const [filtroVencHasta, setFiltroVencHasta] = useState("");
  const [movimientosMed, setMovimientosMed] = useState(null);
  const [medicamentos, setMedicamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(3);
  const [showCuarentena, setShowCuarentena] = useState(false);
  const [cuarentenaData, setCuarentenaData] = useState(null);
  const [motivoCuarentena, setMotivoCuarentena] = useState("");
  const [filtroCuarentena, setFiltroCuarentena] = useState(false);
  const listAbortRef = useRef(null);
  const listRequestIdRef = useRef(0);

  const themeGradient = {
    backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
  };
  const themeTextGradient = {
    backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
  const primarySoftButtonStyle = {
    color: "var(--color-primary-dark)",
    borderColor: "var(--color-primary-light)",
  };

  const fetchMedicamentos = async () => {
    const requestId = ++listRequestIdRef.current;
    if (listAbortRef.current) {
      listAbortRef.current.abort();
    }
    const controller = new AbortController();
    listAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    const apiUrl = `${BASE_URL}api_medicamentos.php`;
    try {
      const res = await fetch(apiUrl, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Error al cargar medicamentos");
      const data = await res.json();
      if (requestId !== listRequestIdRef.current) return;
      setMedicamentos(data);
    } catch (err) {
      if (requestId !== listRequestIdRef.current) return;
      if (err?.name === "AbortError") {
        setError(new Error("Tiempo de espera agotado al cargar medicamentos."));
      } else {
        setError(err);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchMedicamentos();
    return () => {
      if (listAbortRef.current) {
        listAbortRef.current.abort();
      }
    };
  }, []);

  const handleAdd = () => {
    setEditData(null);
    setShowForm(true);
  };

  const handleEdit = (med) => {
    setEditData(med);
    setShowForm(true);
  };

  const handleSave = (data) => {
    const apiUrl = `${BASE_URL}api_medicamentos.php`;
    return fetch(apiUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setShowForm(false);
          fetchMedicamentos();
          return { success: true };
        } else {
          // Devuelve el error al formulario para que lo muestre
          return { error: result.error || "Error al guardar" };
        }
      })
      .catch(() => ({ error: "Error de red o servidor" }));
  };

  let medicamentosFiltrados = medicamentos.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );
  // Ordenar por id descendente (el más reciente primero)
  medicamentosFiltrados.sort((a, b) => {
    if (a.id && b.id) {
      return b.id - a.id;
    }
    // Si no hay id, mantener el orden original
    return 0;
  });
  if (filtroCuarentena) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.estado === "cuarentena"
    );
  }
  if (filtroVencDesde) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.fecha_vencimiento && m.fecha_vencimiento >= filtroVencDesde
    );
  }
  if (filtroVencHasta) {
    medicamentosFiltrados = medicamentosFiltrados.filter(
      (m) => m.fecha_vencimiento && m.fecha_vencimiento <= filtroVencHasta
    );
  }

  // Paginación
  const totalPaginas = Math.ceil(medicamentosFiltrados.length / tamanoPagina);
  const medicamentosPaginados = medicamentosFiltrados.slice(
    (pagina - 1) * tamanoPagina,
    pagina * tamanoPagina
  );

  const handleChangeTamano = (e) => {
    setTamanoPagina(Number(e.target.value));
    setPagina(1);
  };

  const handlePagina = (nueva) => {
    if (nueva >= 1 && nueva <= totalPaginas) setPagina(nueva);
  };

  return (
  <div className="w-full h-full mx-auto px-2 sm:px-3 md:px-4 lg:px-6 xl:px-10 2xl:px-12 py-6 max-w-full">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text mb-2" style={themeTextGradient}>
          💊 
          
        </h1>
        <p className="text-gray-600 text-lg">
          Sistema integral de inventario farmacéutico
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-between mb-4 gap-2">
        <input
          type="text"
          placeholder="Buscar por código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border rounded px-3 py-2 w-full sm:w-72"
        />
        <select
          value={tamanoPagina}
          onChange={handleChangeTamano}
          className="border rounded px-2 py-2 ml-2"
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
        </select>
        <span className="ml-2 text-sm">por página</span>
        <button
          onClick={handleAdd}
          className="text-white px-6 py-3 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 font-semibold flex items-center gap-2"
          style={themeGradient}
        >
          <span className="text-lg">+</span>
          Nuevo Medicamento
        </button>
      </div>

      {/* Filtro de fecha y cuarentena */}
      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-2 sm:p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 shadow-sm">
        <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-base font-semibold text-yellow-900 flex-wrap">
          <span className="inline-block text-yellow-600 mr-1">🗓️</span>
          <label className="text-xs sm:text-base">
            Filtrar por vencimiento:
          </label>
          <span className="ml-1 text-xs font-normal text-gray-700">Desde</span>
          <input
            type="date"
            value={filtroVencDesde}
            onChange={(e) => setFiltroVencDesde(e.target.value)}
            className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-16 sm:w-24 md:w-28"
          />
          <span className="ml-1 text-xs font-normal text-gray-700">Hasta</span>
          <input
            type="date"
            value={filtroVencHasta}
            onChange={(e) => setFiltroVencHasta(e.target.value)}
            className="border border-yellow-400 rounded px-1 py-1 focus:ring-2 focus:ring-yellow-300 w-16 sm:w-24 md:w-28"
          />
          <button
            type="button"
            onClick={() => {
              setFiltroVencDesde("");
              setFiltroVencHasta("");
            }}
            className="ml-1 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-semibold border border-yellow-400 hover:bg-yellow-400 transition text-xs sm:text-sm"
            title="Limpiar filtros de vencimiento"
          >
            Limpiar
          </button>
        </div>
        <div className="flex items-center gap-4 mt-2 sm:mt-0">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filtroCuarentena}
              onChange={(e) => setFiltroCuarentena(e.target.checked)}
            />
            Solo cuarentena
          </label>
          <span className="text-xs text-gray-500">
            Medicamentos en cuarentena deben ser llevados a puntos de acopio
            autorizados (DIGEMID).
          </span>
        </div>
      </div>
      {loading && <div className="text-center text-gray-500">Cargando...</div>}
      {error && (
        <div className="text-center text-red-500">
          {error.message || "Error"}
        </div>
      )}
      {!loading && !error && (
        <div className="w-full overflow-x-auto md:overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 rounded-xl shadow-lg border border-gray-100 bg-white">
          <table className="w-full min-w-max md:w-full bg-white rounded-xl text-xs sm:text-xs md:text-[11px] lg:text-[12px]">
            <thead>
              <tr className="text-white font-bold uppercase tracking-wide" style={themeGradient}>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="flex items-center gap-0.5 md:gap-1"><FaPills size={12} /> Código</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap min-w-[160px] md:min-w-[200px]" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="flex items-center gap-0.5 md:gap-1"><FaVial size={12} /> Medicamento</span>
                </th>
                <th className="py-3 px-1.5 md:px-2 border-b text-center text-[9px] font-semibold uppercase tracking-wide sm:hidden md:hidden" style={{ borderColor: "var(--color-primary-light)" }}>
                  Act.
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-[10px] font-semibold uppercase tracking-wide hidden lg:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="xl:hidden text-[9px]">Pres.</span>
                  <span className="hidden xl:inline">Presentación</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-[10px] font-semibold uppercase tracking-wide hidden 2xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="text-[9px]">Concent.</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-[10px] font-semibold uppercase tracking-wide hidden 2xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  Lab.
                </th>
                <th className="py-3 px-2 md:px-2 lg:px-3 border-b text-center text-[10px] font-semibold uppercase tracking-wide hidden lg:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="flex items-center justify-center gap-0.5"><FaPills size={11} /> Stock</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-center text-[10px] font-semibold uppercase tracking-wide hidden lg:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="flex items-center justify-center gap-0.5"><FaCalendarAlt size={11} /> Venc.</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-right text-[10px] font-semibold uppercase tracking-wide hidden xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="text-[9px]\">P.Compra</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-right text-[10px] font-semibold uppercase tracking-wide hidden xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="text-[9px]\">Margen%</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-right text-[10px] font-semibold uppercase tracking-wide hidden xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="text-[9px]\">P.Venta</span>
                </th>
                <th className="py-3 px-2 md:px-3 lg:px-4 border-b text-center text-[10px] font-semibold uppercase tracking-wide hidden xl:table-cell whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  <span className="text-[9px]\">Estado</span>
                </th>
                <th className="py-3 px-1.5 md:px-2 border-b text-center text-[10px] font-semibold uppercase tracking-wide table-cell md:table-cell w-auto whitespace-nowrap" style={{ borderColor: "var(--color-primary-light)" }}>
                  Act.
                </th>
              </tr>
            </thead>
            <tbody>
              {medicamentosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    No hay medicamentos registrados
                  </td>
                </tr>
              ) : (
                medicamentosPaginados.map((m, index) => {
                  // Colores alternados para las filas
                  let rowClass = index % 2 === 0 ? "bg-white hover:bg-blue-50" : "bg-gray-50 hover:bg-blue-50";

                  // Resaltado de vencimiento (override de colores alternados si es necesario)
                  let vencClass = "";
                  if (m.fecha_vencimiento) {
                    const diff = getDiasVencimiento(m.fecha_vencimiento);
                    if (diff < EXPIRY_RED_DAYS) {
                      vencClass = "bg-red-50 border-l-4 border-red-500";
                      rowClass = ""; // Override row colors for urgency
                    } else if (diff < EXPIRY_ORANGE_DAYS) {
                      vencClass = "bg-yellow-50 border-l-4 border-orange-500";
                      rowClass = ""; // Override row colors for warning
                    }
                  }
                  return (
                    <tr
                      key={m.id}
                      className={`transition-all duration-200 border-b border-gray-100 hover:shadow-sm ${rowClass} ${vencClass} group`}
                      style={{
                        ...(rowClass ? { "--tw-bg-opacity": 1 } : {}),
                      }}
                    >
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 font-medium text-gray-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5 md:gap-1 bg-blue-50 px-2 md:px-2.5 py-0.5 rounded-full font-mono text-[9px] md:text-[10px] font-bold text-blue-700">
                          <FaPills size={10} />
                          {m.codigo}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 font-semibold text-gray-800 line-clamp-2">
                        <div className="flex items-start gap-1.5 md:gap-2">
                          <span className="text-base md:text-lg mt-0.5 flex-shrink-0">💊</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs md:text-sm font-bold text-gray-900 break-words line-clamp-2 leading-snug">
                              {m.nombre}
                            </div>
                            <div className="text-[8px] md:text-xs text-gray-500 mt-0.5">
                              {m.presentacion && <span>{m.presentacion}</span>}
                              {m.concentracion && <span> · {m.concentracion}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-1 md:px-1.5 border-b border-gray-100 text-center sm:hidden md:hidden flex flex-row gap-0.5 justify-center">
                        <button
                          onClick={() => setDetalleMed(m)}
                          className="p-1.5 border border-gray-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-blue-100"
                          title="Ver detalles"
                        >
                          <FaInfoCircle size={12} className="text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleEdit(m)}
                          className="p-1.5 border border-gray-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-green-100"
                          title="Editar"
                        >
                          <FaEdit size={12} className="text-green-600" />
                        </button>
                        <button
                          onClick={() => setMovimientosMed(m)}
                          className="p-1.5 border border-gray-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-purple-100"
                          title="Historial"
                        >
                          <FaHistory size={12} className="text-purple-600" />
                        </button>
                        {m.estado !== "cuarentena" && (
                          <button
                            onClick={() => {
                              setCuarentenaData(m);
                              setShowCuarentena(true);
                              setMotivoCuarentena("");
                            }}
                            className="p-1.5 border border-yellow-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-yellow-100"
                            title="Cuarentena"
                          >
                            <FaLock size={12} className="text-yellow-600" />
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 hidden lg:table-cell text-gray-700 whitespace-nowrap">
                        <span className="text-[9px] md:text-[10px] bg-gray-100 px-2 py-0.5 rounded-md">{m.presentacion || "-"}</span>
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 hidden 2xl:table-cell text-gray-700 whitespace-nowrap">
                        <span className="text-[9px] md:text-[10px] bg-gray-100 px-2 py-0.5 rounded-md">{m.concentracion || "-"}</span>
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 hidden 2xl:table-cell text-gray-700 text-[9px] md:text-[10px] whitespace-nowrap">
                        {m.laboratorio || "-"}
                      </td>
                      <td className="py-2.5 px-2 md:px-2 lg:px-3 border-b border-gray-100 text-center font-medium text-gray-700 hidden lg:table-cell whitespace-nowrap">
                        <StockBadge
                          stock={Number(m.stock || 0)}
                          unitsPorCaja={Number(m.unidades_por_caja || 30)}
                          fechaVencimiento={m.fecha_vencimiento}
                        />
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 text-center hidden lg:table-cell whitespace-nowrap">
                        <VencimientoBadge
                          fechaVencimiento={m.fecha_vencimiento}
                          stock={Number(m.stock || 0)}
                        />
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 text-right font-mono text-[9px] md:text-[10px] text-gray-800 font-semibold hidden xl:table-cell whitespace-nowrap">
                        <span className="bg-green-50 px-2 py-0.5 rounded-md font-bold text-green-700">
                          S/ {m.precio_compra !== undefined ? Number(m.precio_compra).toFixed(2) : "-"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 text-right text-[9px] md:text-[10px] text-gray-800 font-semibold hidden xl:table-cell whitespace-nowrap">
                        <span className="bg-blue-50 px-2 py-0.5 rounded-md text-blue-700">
                          {m.margen_ganancia !== undefined ? Number(m.margen_ganancia).toFixed(1) : "-"}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 text-right font-semibold text-green-700 font-mono text-[9px] md:text-[10px] hidden xl:table-cell whitespace-nowrap">
                        <span className="bg-green-100 px-2 py-0.5 rounded-md text-green-900 font-bold">
                          S/ {m.precio_compra !== undefined && m.margen_ganancia !== undefined
                            ? (Number(m.precio_compra) + (Number(m.precio_compra) * Number(m.margen_ganancia)) / 100).toFixed(2)
                            : "-"}
                        </span>
                      </td>
                      <td
                        className={
                          "py-2.5 px-2 md:px-3 lg:px-4 border-b border-gray-100 hidden xl:table-cell font-semibold text-center rounded-md whitespace-nowrap " +
                          (m.estado === "cuarentena"
                            ? "bg-yellow-200 text-yellow-900"
                            : m.estado === "activo"
                            ? "text-green-700"
                            : "text-gray-700")
                        }
                      >
                        {m.estado === "cuarentena" ? (
                          <span className="inline-flex items-center gap-0.5 bg-yellow-100 px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-bold">
                            <FaExclamationTriangle size={10} />
                            CUARENTENA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[8px] md:text-[9px] font-semibold">
                            {m.estado === "activo" && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                            {m.estado}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-1 md:px-1.5 border-b border-gray-100 text-center gap-0.5 justify-center flex table-cell md:table-cell whitespace-nowrap">
                        <button
                          onClick={() => handleEdit(m)}
                          className="p-1.5 border border-gray-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-green-100"
                          title="Editar"
                        >
                          <FaEdit size={12} className="text-green-600" />
                        </button>
                        <button
                          onClick={() => setMovimientosMed(m)}
                          className="p-1.5 border border-gray-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-purple-100"
                          title="Historial"
                        >
                          <FaHistory size={12} className="text-purple-600" />
                        </button>
                        {m.estado !== "cuarentena" && (
                          <button
                            onClick={() => {
                              setCuarentenaData(m);
                              setShowCuarentena(true);
                              setMotivoCuarentena("");
                            }}
                            className="p-1.5 border border-yellow-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-yellow-100"
                            title="Cuarentena"
                          >
                            <FaLock size={12} className="text-yellow-600" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(m)}
                          className="p-1.5 border border-red-300 rounded-lg transition-all duration-200 transform hover:scale-110 hover:bg-red-100"
                          title="Eliminar"
                          disabled={deleteLoading}
                        >
                          <FaTrash size={12} className="text-red-600" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Modal de detalles para móvil */}
          {detalleMed && (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-xs w-full relative">
                <button
                  onClick={() => setDetalleMed(null)}
                  className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-xl"
                >
                  ×
                </button>
                <h2 className="text-lg font-bold mb-2 text-blue-800">
                  Detalles del Medicamento
                </h2>
                <div className="space-y-1 text-sm">
                  <div>
                    <b>Código:</b> {detalleMed.codigo}
                  </div>
                  <div>
                    <b>Nombre:</b> {detalleMed.nombre}
                  </div>
                  <div>
                    <b>Presentación:</b> {detalleMed.presentacion}
                  </div>
                  <div>
                    <b>Concentración:</b> {detalleMed.concentracion}
                  </div>
                  <div>
                    <b>Laboratorio:</b> {detalleMed.laboratorio}
                  </div>
                  <div>
                    <b>Stock:</b> {detalleMed.stock}
                  </div>
                  <div>
                    <b>Vencimiento:</b>{" "}
                    {detalleMed.fecha_vencimiento
                      ? new Date(
                          detalleMed.fecha_vencimiento
                        ).toLocaleDateString()
                      : "-"}
                  </div>
                  <div>
                    <b>Precio compra:</b> S/{" "}
                    {detalleMed.precio_compra !== undefined
                      ? Number(detalleMed.precio_compra).toFixed(2)
                      : "-"}
                  </div>
                  <div>
                    <b>Margen ganancia:</b>{" "}
                    {detalleMed.margen_ganancia !== undefined
                      ? Number(detalleMed.margen_ganancia).toFixed(1)
                      : "-"}
                    %
                  </div>
                  <div>
                    <b>Precio venta:</b> S/{" "}
                    {detalleMed.precio_compra !== undefined &&
                    detalleMed.margen_ganancia !== undefined
                      ? (
                          Number(detalleMed.precio_compra) +
                          (Number(detalleMed.precio_compra) *
                            Number(detalleMed.margen_ganancia)) /
                            100
                        ).toFixed(2)
                      : "-"}
                  </div>
                  <div>
                    <b>Estado:</b> {detalleMed.estado}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal de cuarentena */}
          {showCuarentena && (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full relative">
                <h2 className="text-lg font-bold mb-2 text-yellow-800">
                  Enviar a cuarentena
                </h2>
                <p className="mb-2 text-sm">
                  Medicamento: <b>{cuarentenaData?.nombre}</b> (
                  {cuarentenaData?.codigo})
                </p>
                <label className="block mb-2 text-sm">
                  Motivo de cuarentena <span className="text-red-600">*</span>
                </label>
                <textarea
                  className="w-full border rounded px-2 py-1 mb-4"
                  rows={3}
                  value={motivoCuarentena}
                  onChange={(e) => setMotivoCuarentena(e.target.value)}
                  required
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowCuarentena(false)}
                    className="bg-gray-400 text-white px-4 py-2 rounded"
                  >
                    Cancelar
                  </button>
                  <button
                    className="bg-yellow-600 text-white px-4 py-2 rounded"
                    disabled={!motivoCuarentena.trim()}
                    onClick={async () => {
                      if (!cuarentenaData) return;
                      const apiUrl = `${BASE_URL}api_medicamentos.php`;
                      const hoy = new Date().toISOString().slice(0, 10);
                      const data = {
                        ...cuarentenaData,
                        estado: "cuarentena",
                        fecha_cuarentena: hoy,
                        motivo_cuarentena: motivoCuarentena,
                      };
                      await fetch(apiUrl, {
                        method: "POST",
                        credentials: "include",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify(data),
                      });
                      setShowCuarentena(false);
                      setCuarentenaData(null);
                      setMotivoCuarentena("");
                      fetchMedicamentos();
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Controles de paginación */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-600">
              Página {pagina} de {totalPaginas} ({medicamentosFiltrados.length}{" "}
              resultados)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePagina(1)}
                disabled={pagina === 1}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                «
              </button>
              <button
                onClick={() => handlePagina(pagina - 1)}
                disabled={pagina === 1}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                ‹
              </button>
              <span className="px-2 py-1">{pagina}</span>
              <button
                onClick={() => handlePagina(pagina + 1)}
                disabled={pagina === totalPaginas || totalPaginas === 0}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                ›
              </button>
              <button
                onClick={() => handlePagina(totalPaginas)}
                disabled={pagina === totalPaginas || totalPaginas === 0}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl p-0 max-w-5xl w-[95vw] my-auto flex items-center justify-center">
            <MedicamentoForm
              initialData={editData}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
      {movimientosMed && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-0 max-w-5xl w-[95vw] flex items-center justify-center">
            <MovimientosModal
              medicamento={movimientosMed}
              usuario={usuarioLogueado}
              onClose={() => {
                setMovimientosMed(null);
                fetchMedicamentos();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
