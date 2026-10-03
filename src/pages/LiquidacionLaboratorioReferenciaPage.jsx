
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { authFetch } from "../utils/apiClient";
import LiquidacionLaboratorioReferenciaTable from "../components/laboratorio_referencia/LiquidacionLaboratorioReferenciaTable";
import LiquidacionLaboratorioReferenciaModal from "../components/laboratorio_referencia/LiquidacionLaboratorioReferenciaModal";

const LAB_REF_FILTROS_STORAGE_KEY = "liquidacion-lab-ref-filtros-v1";

function loadFiltrosPersistidosLabRef() {
  try {
    const raw = localStorage.getItem(LAB_REF_FILTROS_STORAGE_KEY);
    if (!raw) return { estado: "", laboratorio: "", rowsPerPage: 3 };
    const parsed = JSON.parse(raw);
    return {
      estado: typeof parsed?.estado === "string" ? parsed.estado : "",
      laboratorio: typeof parsed?.laboratorio === "string" ? parsed.laboratorio : "",
      rowsPerPage: Number.isFinite(Number(parsed?.rowsPerPage)) ? Number(parsed.rowsPerPage) : 3,
    };
  } catch {
    return { estado: "", laboratorio: "", rowsPerPage: 3 };
  }
}

export default function LiquidacionLaboratorioReferenciaPage() {
  const usuario = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("usuario") || "{}");
    } catch {
      return {};
    }
  })();
  const esAdmin = String(usuario?.rol || "").toLowerCase() === "administrador";

  const [modalOpen, setModalOpen] = useState(false);
  const [modalExamenes, setModalExamenes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => loadFiltrosPersistidosLabRef().rowsPerPage);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState(() => loadFiltrosPersistidosLabRef().estado);
  const [laboratorioFilter, setLaboratorioFilter] = useState(() => loadFiltrosPersistidosLabRef().laboratorio);
  const [laboratorios, setLaboratorios] = useState([]);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    fetchMovimientos();
  }, []);

  const fetchMovimientos = () => {
    setLoading(true);
    authFetch(`api_laboratorio_referencia_movimientos.php?solo_liquidables=1&incluir_cancelados=1`)
      .then(res => res.json())
      .then(data => {
        setMovimientos(data.movimientos || []);
        setLaboratorios(Array.from(new Set((data.movimientos || []).map(m => m.laboratorio_referencia || m.laboratorio).filter(Boolean))));
        setLoading(false);
      });
  };

  const marcarPagado = async (id) => {
    const result = await Swal.fire({
      title: "Liquidar laboratorio de referencia",
      html: `
        <div class="text-left space-y-3">
          <label class="block text-sm font-semibold">Método de pago al laboratorio</label>
          <select id="liquidacion-lab-metodo" class="swal2-select !w-full !m-0">
            <option value="efectivo">Efectivo</option>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="cheque">Cheque</option>
            <option value="deposito">Depósito</option>
          </select>
          <label class="block text-sm font-semibold">Fuente de fondos</label>
          <select id="liquidacion-lab-fuente" class="swal2-select !w-full !m-0">
            <option value="clinica">Saldo de la clínica</option>
            <option value="tercero_directo">Pago directo del dueño / tercero</option>
            <option value="tercero_fondeo">Dueño / tercero fondeó a la clínica</option>
          </select>
          <input id="liquidacion-lab-tercero" class="swal2-input !w-full !m-0" placeholder="Nombre del dueño / tercero (si aplica)" />
          <input id="liquidacion-lab-referencia" class="swal2-input !w-full !m-0" placeholder="N.º de operación o referencia (opcional)" />
          <textarea id="liquidacion-lab-observaciones" class="swal2-textarea !w-full !m-0" placeholder="Observación (opcional)"></textarea>
        </div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, liquidar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
      didOpen: () => {
        const fuente = document.getElementById("liquidacion-lab-fuente");
        const tercero = document.getElementById("liquidacion-lab-tercero");
        const actualizarTercero = () => {
          tercero.disabled = fuente.value === "clinica";
          if (fuente.value === "clinica") tercero.value = "";
        };
        fuente.addEventListener("change", actualizarTercero);
        actualizarTercero();
      },
      preConfirm: () => {
        const metodoPago = document.getElementById("liquidacion-lab-metodo").value;
        const fuenteFondos = document.getElementById("liquidacion-lab-fuente").value;
        const terceroNombre = document.getElementById("liquidacion-lab-tercero").value.trim();
        if (fuenteFondos !== "clinica" && !terceroNombre) {
          Swal.showValidationMessage("Indica quién cubrió el pago externo.");
          return false;
        }
        return {
          metodo_pago: metodoPago,
          fuente_fondos: fuenteFondos,
          tercero_nombre: terceroNombre,
          referencia_pago: document.getElementById("liquidacion-lab-referencia").value.trim(),
          observaciones: document.getElementById("liquidacion-lab-observaciones").value.trim(),
        };
      },
    });

    if (!result.isConfirmed) return;

    try {
      const res = await authFetch(`api_laboratorio_referencia_movimientos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "marcar_pagado", id, ...result.value }),
      });
      const data = await res.json();
      if (data.success) {
        setMensaje("Movimiento liquidado correctamente.");
        fetchMovimientos();
      } else {
        setMensaje(data.error || "Error al liquidar el movimiento.");
      }
    } catch {
      setMensaje("Error de conexión al liquidar el movimiento.");
    }
  };

  const movimientosFiltrados = movimientos.filter(m => {
    const estado = String(m.estado || "").toLowerCase();
    const matchEstado = estadoFilter === "" ? estado !== "cancelado" : estado === estadoFilter;
    const matchLab = laboratorioFilter === "" || (m.laboratorio_referencia || m.laboratorio) === laboratorioFilter;
    return matchEstado && matchLab;
  });

  const anularMovimiento = async (id) => {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: "¿Anular este honorario de laboratorio?",
      html: "Se cancelará el movimiento de laboratorio. No se eliminarán datos y quedará trazabilidad para auditoría.",
      icon: "warning",
      input: "text",
      inputPlaceholder: "Escribe el motivo de la anulación",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "El motivo es obligatorio";
        return undefined;
      },
      showCancelButton: true,
      confirmButtonText: "Sí, anular",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });
    if (!isConfirmed) return;

    try {
      const res = await authFetch(`api_laboratorio_referencia_movimientos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "anular_movimiento", id, motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMensaje("Movimiento anulado correctamente.");
        fetchMovimientos();
      } else {
        setMensaje(data.error || "No se pudo anular el movimiento.");
      }
    } catch {
      setMensaje("Error de conexión al anular el movimiento.");
    }
  };

  useEffect(() => {
    setPage(0);
  }, [estadoFilter, laboratorioFilter, rowsPerPage]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAB_REF_FILTROS_STORAGE_KEY,
        JSON.stringify({
          estado: estadoFilter,
          laboratorio: laboratorioFilter,
          rowsPerPage,
        }),
      );
    } catch {
      // no-op
    }
  }, [estadoFilter, laboratorioFilter, rowsPerPage]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(movimientosFiltrados.length / rowsPerPage));
  const paginated = movimientosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
  <div className="w-full max-w-[1600px] mx-auto p-6 bg-white rounded-xl shadow-lg mt-8">
      <h2 className="text-2xl font-bold text-blue-800 mb-6 flex items-center gap-2">💳 Liquidación Laboratorios de Referencia</h2>
      <div className="mb-4">
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col bg-blue-50 rounded-lg p-2">
            <label className="font-semibold text-blue-800 mb-1">Filtrar por estado:</label>
            <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} className="border rounded px-2 py-2 text-sm focus:outline-blue-400">
              <option value="">Todos (excepto cancelados)</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div className="flex flex-col bg-blue-50 rounded-lg p-2">
            <label className="font-semibold text-blue-800 mb-1">Filtrar por laboratorio:</label>
            <select value={laboratorioFilter} onChange={e => setLaboratorioFilter(e.target.value)} className="border rounded px-2 py-2 text-sm focus:outline-blue-400">
              <option value="">Todos</option>
              {laboratorios.map(lab => (
                <option key={lab} value={lab}>{lab}</option>
              ))}
            </select>
          </div>
        </form>
      </div>
      {loading ? (
        <div className="text-center text-gray-500">Cargando movimientos...</div>
      ) : movimientosFiltrados.length === 0 ? (
        <div className="text-center text-gray-500">No hay movimientos para mostrar.</div>
      ) : (
        <>
          <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm text-gray-700 flex gap-4 items-center">
              <span className="bg-gray-100 rounded px-2 py-1">Total movimientos: <b>{movimientosFiltrados.length}</b></span>
              <span className="bg-gray-100 rounded px-2 py-1">Páginas: <b>{totalPages}</b></span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <button
                disabled={page === 0 || totalPages === 1}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 disabled:opacity-50 hover:bg-blue-200 transition-colors shadow-sm"
                title="Página anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="px-3 py-1 text-sm font-medium bg-gray-50 rounded">Página {page + 1} de {totalPages || 1}</span>
              <button
                disabled={page >= totalPages - 1 || totalPages === 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 disabled:opacity-50 hover:bg-blue-200 transition-colors shadow-sm"
                title="Página siguiente"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <select
                value={rowsPerPage}
                onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 ml-2"
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </div>
          </div>
          <LiquidacionLaboratorioReferenciaTable
            movimientos={movimientosFiltrados}
            paginated={paginated}
            onVerDetalles={m => {
              let examenes = [];
              try {
                examenes = JSON.parse(m.observaciones);
                if (!Array.isArray(examenes)) examenes = [m.observaciones];
              } catch {
                examenes = m.observaciones.split(',').map(e => e.trim());
              }
              setModalExamenes(examenes);
              setModalOpen(true);
            }}
            onMarcarPagado={marcarPagado}
            onAnular={anularMovimiento}
            canAnular={esAdmin}
          />
          <LiquidacionLaboratorioReferenciaModal
            open={modalOpen}
            examenes={modalExamenes}
            onClose={() => setModalOpen(false)}
          />
        </>
      )}
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${(mensaje.toLowerCase().includes('pagado') || mensaje.toLowerCase().includes('liquidado')) ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
    </div>
  );
}
