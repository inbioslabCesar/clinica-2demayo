import { useState, useEffect } from "react";
import CobroModuloFinal from "../components/CobroModuloFinal";
import { useNavigate } from "react-router-dom";
// import Swal from "sweetalert2";
// import withReactContent from "sweetalert2-react-content";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function CotizarLaboratorioPage() {
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  // Estado para configuración de derivación por examen
  const [derivaciones, setDerivaciones] = useState({}); // { [examenId]: { derivado: bool, tipo: 'monto'|'porcentaje', valor: number, laboratorio: string } }
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  // const [cotizacionReady, setCotizacionReady] = useState(false);
  const navigate = useNavigate();
  const { pacienteId } = useParams();
  const [examenes, setExamenes] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [comprobante, setComprobante] = useState(null);
  const [paciente, setPaciente] = useState(null);

  useEffect(() => {
    // Cargar exámenes, tarifas, ranking y paciente
    Promise.all([
      fetch(`${BASE_URL}api_examenes_laboratorio.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_examenes_laboratorio_ranking.php`, { credentials: "include" }).then(res => res.json()),
      pacienteId ? fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, { credentials: "include" }).then(res => res.json()) : Promise.resolve({ success: false })
    ]).then(([examenesData, tarifasData, rankingData, pacienteData]) => {
      setExamenes(examenesData.examenes || []);
      setTarifas(tarifasData.tarifas || []);
      setRanking(rankingData.ranking || []);
      if (pacienteData && pacienteData.success && pacienteData.paciente) {
        setPaciente(pacienteData.paciente);
      }
      setLoading(false);
      // Depuración: mostrar tarifas y examenes en consola
      console.log('Tarifas:', tarifasData.tarifas);
      console.log('Examenes:', examenesData.examenes);
    });
  }, [pacienteId]);

  const toggleSeleccion = (id) => {
    setSeleccionados(sel =>
      sel.includes(id) ? sel.filter(eid => eid !== id) : [...sel, id]
    );
    setMensaje("");
  };

  const calcularTotal = () => {
    return seleccionados.reduce((total, exId) => {
      const ex = examenes.find(e => e.id === exId);
      const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && t.examen_id === exId && t.activo === 1);
      const precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
      return total + precio;
    }, 0);
  };

  if (loading) return <div>Cargando exámenes y tarifas...</div>;
  // Obtener categorías únicas
  const categorias = Array.from(new Set(examenes.map(ex => ex.categoria).filter(Boolean)));
  // Filtrar exámenes por búsqueda y categoría
  // Ordenar por ranking (más solicitados primero)
  const rankingIds = ranking.map(r => parseInt(r.id));
  const examenesOrdenados = [...examenes].sort((a, b) => {
    const idxA = rankingIds.indexOf(a.id);
    const idxB = rankingIds.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return a.nombre.localeCompare(b.nombre);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const examenesFiltrados = examenesOrdenados.filter(ex => {
    const matchBusqueda = busqueda.trim().length === 0 || ex.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const matchCategoria = categoriaFilter === "" || ex.categoria === categoriaFilter;
    return matchBusqueda && matchCategoria;
  });

  // Paginación
  const totalPages = Math.max(1, Math.ceil(examenesFiltrados.length / rowsPerPage));
  const paginated = examenesFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const limpiarSeleccion = () => {
    setSeleccionados([]);
    setMensaje("");
  };

  const generarCotizacion = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un examen para cobrar.");
      return;
    }
    // Construir detalles para el Módulo de Cobros, incluyendo derivación
    const detalles = seleccionados.map(exId => {
      const ex = examenes.find(e => e.id === exId);
      const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && t.examen_id === exId && t.activo === 1);
      let descripcion = (ex && typeof ex.nombre === 'string' && ex.nombre.trim() !== "" && ex.nombre !== "0") ? ex.nombre : "Examen sin nombre";
      const derivacion = derivaciones[exId] || { derivado: false };
      // Usar precio_publico si no hay tarifa
      let precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
      return {
        servicio_tipo: "laboratorio",
        servicio_id: exId,
        descripcion,
        cantidad: 1,
        precio_unitario: precio,
        subtotal: precio,
        derivado: derivacion.derivado || false,
        tipo_derivacion: derivacion.tipo || '',
        valor_derivacion: derivacion.valor || 0,
        laboratorio_referencia: derivacion.laboratorio || ''
      };
    });
    setDetallesCotizacion(detalles);
    setTotalCotizacion(detalles.reduce((total, d) => total + d.subtotal, 0));
    setMostrarCobro(true);
  };

  return (
  <div className="max-w-6xl mx-auto p-4 md:p-8 bg-white rounded-xl shadow-lg mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔬</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotización de Laboratorio</h2>
        </div>
  <button onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver</button>
      </div>
  <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-gray-600"><b>ID Paciente:</b> {pacienteId}</div>
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar examen..."
          className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        />
      </div>
  <div className="mb-4 flex flex-col sm:flex-row gap-2 items-center">
        <label className="font-semibold text-gray-700">Filtrar por categoría:</label>
        <select
          value={categoriaFilter}
          onChange={e => setCategoriaFilter(e.target.value)}
          className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        >
          <option value="">Todas</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Selecciona los exámenes:</h4>
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="w-full bg-white shadow-md rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                <div className="text-sm text-gray-700 flex gap-4 items-center">
                  <span className="bg-gray-100 rounded px-2 py-1">Total exámenes: <b>{examenesFiltrados.length}</b></span>
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
                  </select>
                </div>
              </div>
            </div>
            {examenesFiltrados.length === 0 ? (
              <div className="text-center text-gray-500">No hay exámenes para mostrar.</div>
            ) : (
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {paginated.map(ex => {
                    const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && t.examen_id === ex.id && t.activo === 1);
                    const isSelected = seleccionados.includes(ex.id);
                    const derivacion = derivaciones[ex.id] || { derivado: false, tipo: '', valor: '', laboratorio: '' };
                    // Usar precio_publico si no hay tarifa
                    const precio = tarifa ? tarifa.precio_particular : (ex.precio_publico ? parseFloat(ex.precio_publico) : "-");
                    const precioMostrar = precio !== "-" ? Number(precio).toFixed(2) : "-";
                    return (
                      <li key={ex.id} className="flex flex-col px-4 py-3 hover:bg-blue-50 transition-colors border-b">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSeleccion(ex.id)}
                            className="mr-3 accent-blue-600 w-5 h-5"
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800">{ex.nombre}</div>
                            {ex.categoria && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mt-1 inline-block">{ex.categoria}</span>
                            )}
                          </div>
                          <div className="font-bold text-green-700 text-lg">S/ {precioMostrar}</div>
                        </div>
                        {/* Configuración de derivación solo si está seleccionado */}
                        {isSelected && (
                          <div className="mt-2 bg-gray-50 p-3 rounded flex flex-col gap-2">
                            <label className="font-semibold text-sm mb-1">¿Se deriva a laboratorio externo?</label>
                            <select
                              value={derivacion.derivado ? 'si' : 'no'}
                              onChange={e => setDerivaciones(prev => ({
                                ...prev,
                                [ex.id]: {
                                  ...prev[ex.id],
                                  derivado: e.target.value === 'si'
                                }
                              }))}
                              className="border rounded px-2 py-1 w-32"
                            >
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                            {derivacion.derivado && (
                              <div className="flex flex-col gap-2">
                                <label className="font-semibold text-sm">Laboratorio de referencia</label>
                                <input
                                  type="text"
                                  value={derivacion.laboratorio || ""}
                                  onChange={e => setDerivaciones(prev => ({
                                    ...prev,
                                    [ex.id]: {
                                      ...prev[ex.id],
                                      laboratorio: e.target.value
                                    }
                                  }))}
                                  className="border rounded px-2 py-1"
                                  placeholder="Nombre del laboratorio"
                                />
                                <label className="font-semibold text-sm">¿Monto fijo o porcentaje?</label>
                                <select
                                  value={derivacion.tipo || ""}
                                  onChange={e => setDerivaciones(prev => ({
                                    ...prev,
                                    [ex.id]: {
                                      ...prev[ex.id],
                                      tipo: e.target.value
                                    }
                                  }))}
                                  className="border rounded px-2 py-1 w-32"
                                >
                                  <option value="">Seleccionar</option>
                                  <option value="monto">Monto fijo</option>
                                  <option value="porcentaje">Porcentaje</option>
                                </select>
                                {derivacion.tipo === 'monto' && (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={derivacion.valor !== undefined ? derivacion.valor : ""}
                                    onChange={e => setDerivaciones(prev => ({
                                      ...prev,
                                      [ex.id]: {
                                        ...prev[ex.id],
                                        valor: e.target.value
                                      }
                                    }))}
                                    className="border rounded px-2 py-1"
                                    placeholder="Monto S/"
                                  />
                                )}
                                {derivacion.tipo === 'porcentaje' && (
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={derivacion.valor !== undefined ? derivacion.valor : ""}
                                    onChange={e => setDerivaciones(prev => ({
                                      ...prev,
                                      [ex.id]: {
                                        ...prev[ex.id],
                                        valor: e.target.value
                                      }
                                    }))}
                                    className="border rounded px-2 py-1"
                                    placeholder="Porcentaje %"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
        {/* Cotización en tiempo real en columna derecha */}
        <div className="w-full md:w-96 md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && !mostrarCobro && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-2">Lista de Cotización</h4>
              <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(exId => {
                  const ex = examenes.find(e => e.id === exId);
                  const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && t.examen_id === exId && t.activo === 1);
                  const precio = tarifa ? tarifa.precio_particular : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : "-");
                  const precioMostrar = precio !== "-" ? Number(precio).toFixed(2) : "-";
                  return (
                    <li key={exId} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-gray-900">{ex?.nombre}</span>
                        {ex?.condicion_paciente && (
                          <span className="block text-xs text-gray-400 mt-1">Condición: {ex.condicion_paciente}</span>
                        )}
                        {ex?.tiempo_resultado && (
                          <span className="block text-xs text-gray-400">Tiempo: {ex.tiempo_resultado}</span>
                        )}
                      </div>
                      <div className="font-bold text-green-700 text-right">S/ {precioMostrar}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={limpiarSeleccion} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={generarCotizacion} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">Cobrar</button>
              </div>
            </div>
          )}

          {mostrarCobro && paciente && (
            <CobroModuloFinal
              paciente={paciente}
              servicio={{ key: "laboratorio", label: "Laboratorio" }}
              detalles={detallesCotizacion}
              total={totalCotizacion}
              onCobroCompleto={() => {
                setMostrarCobro(false);
                // setCotizacionReady(true);
                setMensaje("Cotización procesada correctamente.");
              }}
              onCancelar={() => setMostrarCobro(false)}
            />
          )}
        </div>
      </div>
      {/* Eliminado control de paginación duplicado */}
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
      {comprobante && (
        <div className="mt-8 mx-auto max-w-lg bg-white rounded-xl shadow-lg border border-blue-200 p-6">
          <h3 className="text-xl font-bold text-blue-700 mb-2">Comprobante de Cotización</h3>
          <div className="mb-2 text-blue-800 font-semibold">Nº comprobante: {comprobante.numero}</div>
          <div className="mb-2 text-gray-600 text-sm">Fecha: {comprobante.fecha}</div>
          <ul className="divide-y divide-gray-100 mb-4">
            {comprobante.detalles.map((det, idx) => (
              <li key={idx} className="py-2 flex justify-between items-center">
                <span className="font-medium text-gray-800">{det.descripcion}</span>
                <span className="text-green-700 font-bold">S/ {det.precio_unitario.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="text-right text-lg font-bold text-blue-700 border-t pt-2">Total: S/ {comprobante.total.toFixed(2)}</div>
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Imprimir</button>
            <button onClick={() => setComprobante(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
