
import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";
import LiquidacionLaboratorioReferenciaTable from "../components/laboratorio_referencia/LiquidacionLaboratorioReferenciaTable";
import LiquidacionLaboratorioReferenciaModal from "../components/laboratorio_referencia/LiquidacionLaboratorioReferenciaModal";

export default function LiquidacionLaboratorioReferenciaPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalExamenes, setModalExamenes] = useState([]);
  const [modalMovimiento, setModalMovimiento] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [laboratorioFilter, setLaboratorioFilter] = useState("");
  const [laboratorios, setLaboratorios] = useState([]);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    fetchMovimientos();
  }, []);

  const fetchMovimientos = () => {
    setLoading(true);
    fetch(`${BASE_URL}api_laboratorio_referencia_movimientos.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setMovimientos(data.movimientos || []);
        setLaboratorios(Array.from(new Set((data.movimientos || []).map(m => m.laboratorio_referencia).filter(Boolean))));
        setLoading(false);
      });
  };

  const marcarPagado = (id) => {
    fetch(`${BASE_URL}api_laboratorio_referencia_movimientos.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accion: "marcar_pagado", id })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMensaje("Movimiento marcado como pagado.");
          fetchMovimientos();
        } else {
          setMensaje("Error al marcar como pagado.");
        }
      });
  };

  const movimientosFiltrados = movimientos.filter(m => {
    const matchEstado = estadoFilter === "" || m.estado === estadoFilter;
    const matchLab = laboratorioFilter === "" || m.laboratorio_referencia === laboratorioFilter;
    return matchEstado && matchLab;
  });

  // Paginación
  const totalPages = Math.max(1, Math.ceil(movimientosFiltrados.length / rowsPerPage));
  const paginated = movimientosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
  <div className="w-full max-w-[1600px] mx-auto p-6 bg-white rounded-xl shadow-lg mt-8">
      <h2 className="text-2xl font-bold text-blue-800 mb-6 flex items-center gap-2">💳 Liquidación Laboratorios de Referencia</h2>
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div>
          <label className="font-semibold text-gray-700">Filtrar por estado:</label>
          <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} className="border px-3 py-2 rounded w-40">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
        </div>
        <div>
          <label className="font-semibold text-gray-700">Filtrar por laboratorio:</label>
          <select value={laboratorioFilter} onChange={e => setLaboratorioFilter(e.target.value)} className="border px-3 py-2 rounded w-40">
            <option value="">Todos</option>
            {laboratorios.map(lab => (
              <option key={lab} value={lab}>{lab}</option>
            ))}
          </select>
        </div>
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
              setModalMovimiento(m);
              setModalOpen(true);
            }}
            onMarcarPagado={marcarPagado}
          />
          <LiquidacionLaboratorioReferenciaModal
            open={modalOpen}
            examenes={modalExamenes}
            onClose={() => setModalOpen(false)}
          />
        </>
      )}
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('pagado') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
    </div>
  );
}
