import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";

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
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8">
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
          <table className="w-full table-auto border-collapse bg-white shadow rounded-lg">
            <thead>
              <tr className="bg-blue-50 text-blue-800">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Laboratorio</th>
                <th className="px-4 py-2">Exámenes</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Monto/Porcentaje</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="px-4 py-2 text-gray-700">{m.fecha}</td>
                  <td className="px-4 py-2 text-gray-700">{m.laboratorio}</td>
                  <td className="px-4 py-2 text-gray-700">
                    <button
                      title="Ver detalles"
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-200"
                      onClick={() => {
                        let examenes = [];
                        try {
                          // Si observaciones es un JSON de array
                          examenes = JSON.parse(m.observaciones);
                          if (!Array.isArray(examenes)) examenes = [m.observaciones];
                        } catch {
                          // Si es string separado por comas
                          examenes = m.observaciones.split(',').map(e => e.trim());
                        }
                        setModalExamenes(examenes);
                        setModalMovimiento(m);
                        setModalOpen(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Detalles
                    </button>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{m.tipo === 'monto' ? 'Monto fijo' : 'Porcentaje'}</td>
                  <td className="px-4 py-2 text-gray-700">{m.tipo === 'monto' ? `S/ ${parseFloat(m.monto).toFixed(2)}` : `${parseFloat(m.monto).toFixed(2)} %`}</td>
                  <td className={`px-4 py-2 font-bold ${m.estado === 'pendiente' ? 'text-yellow-600' : 'text-green-700'}`}>{m.estado}</td>
                  <td className="px-4 py-2">
                    {m.estado === 'pendiente' && (
                      <button onClick={() => marcarPagado(m.id)} className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">Marcar como pagado</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Modal de detalles de exámenes */}
          {modalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full relative">
                <h3 className="text-xl font-bold text-blue-700 mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Detalle de Exámenes
                </h3>
                <ul className="divide-y divide-gray-100 mb-4">
                  {modalExamenes.map((ex, idx) => (
                    <li key={idx} className="py-2 text-gray-800 font-medium">{ex}</li>
                  ))}
                </ul>
                <button
                  onClick={() => setModalOpen(false)}
                  className="absolute top-2 right-2 bg-gray-200 text-gray-700 rounded-full p-2 hover:bg-gray-300"
                  title="Cerrar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('pagado') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
    </div>
  );
}
