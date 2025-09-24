import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import { BASE_URL } from "../config/config";

function OrdenesLaboratorioList({ onSeleccionarOrden }) {
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(0);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [examenesDisponibles, setExamenesDisponibles] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(BASE_URL + "api_ordenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        console.log('Órdenes recibidas:', data);
        if (data.success) setOrdenes(data.ordenes);
        else setError(data.error || "Error al cargar órdenes");
        setLoading(false);
      })
      .catch((err) => {
        setError("Error de conexión con el servidor");
        setLoading(false);
        console.error('Error al cargar órdenes:', err);
      });
    // Cargar lista de exámenes disponibles para mapear IDs a nombres
    fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setExamenesDisponibles(data.examenes || []);
        console.log('Exámenes disponibles:', data.examenes);
      });
  }, []);

  if (loading || examenesDisponibles.length === 0) return <Spinner message="Cargando órdenes de laboratorio..." />;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  // Filtrado por rango de fecha, médico y paciente
  const filtrarOrdenes = (lista) => {
    return lista.filter(orden => {
      // Filtrar por fecha
      if ((fechaInicio || fechaFin) && orden.fecha) {
        const fechaOrden = new Date(orden.fecha);
        const desde = fechaInicio ? new Date(fechaInicio) : null;
        const hasta = fechaFin ? new Date(fechaFin) : null;
        if (desde && fechaOrden < desde) return false;
        if (hasta && fechaOrden > new Date(hasta + 'T23:59:59')) return false;
      }
      // Filtrar por búsqueda general (paciente o médico)
      if (busqueda.trim() !== "") {
        const texto = busqueda.toLowerCase();
        const paciente = (orden.paciente_nombre + ' ' + orden.paciente_apellido).toLowerCase();
        const medico = (orden.medico_nombre || '').toLowerCase();
        if (!paciente.includes(texto) && !medico.includes(texto)) return false;
      }
      return true;
    });
  };
  const ordenesFiltradas = filtrarOrdenes(ordenes);
  // Paginación
  const totalPages = Math.ceil(ordenesFiltradas.length / rowsPerPage);
  const paginated = ordenesFiltradas.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <div className="max-w-3xl mx-auto p-4 bg-white rounded shadow mt-6">
      <h2 className="text-xl font-bold mb-4 text-center">Órdenes de Laboratorio</h2>
      {/* Buscador por rango de fecha, médico y paciente */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs">Desde:</label>
          <input type="date" value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); setPage(0); }} className="border rounded p-1 text-xs" />
          <label className="text-xs">Hasta:</label>
          <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(0); }} className="border rounded p-1 text-xs" />
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(0); }}
            placeholder="Buscar paciente o médico..."
            className="border rounded p-1 text-xs ml-2"
            style={{ minWidth: 180 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs">Filas por página:</label>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }} className="border rounded p-1 text-xs">
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&lt;</button>
          <span>Página {page + 1} de {totalPages || 1}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&gt;</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[400px] w-full text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="p-2 whitespace-nowrap">ID Orden</th>
              <th className="p-2 whitespace-nowrap">Paciente</th>
              <th className="p-2 whitespace-nowrap hidden sm:table-cell">Médico</th>
              <th className="p-2 whitespace-nowrap hidden md:table-cell">Consulta</th>
              <th className="p-2 whitespace-nowrap hidden md:table-cell">Fecha</th>
              <th className="p-2 whitespace-nowrap">Estado</th>
              <th className="p-2 whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenesFiltradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">No hay órdenes registradas.</td>
              </tr>
            ) : (
              paginated.map(orden => (
                <tr key={orden.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{orden.id}</td>
                  <td className="p-2 whitespace-nowrap">{orden.paciente_nombre} {orden.paciente_apellido}</td>
                  <td className="p-2 whitespace-nowrap hidden sm:table-cell">{orden.medico_nombre}</td>
                  <td className="p-2 whitespace-nowrap hidden md:table-cell">{orden.consulta_id}</td>
                  <td className="p-2 whitespace-nowrap hidden md:table-cell">{orden.fecha?.slice(0,16).replace("T"," ")}</td>
                  <td className="p-2 whitespace-nowrap">
                    <span className={orden.estado === 'completado' ? 'text-green-600 font-semibold' : 'text-yellow-700 font-semibold'}>
                      {orden.estado === 'completado' ? 'Completado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <button
                      onClick={() => onSeleccionarOrden(orden)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-base md:text-sm min-w-[40px]"
                      title={orden.estado === 'completado' ? 'Editar resultado' : 'Llenar resultados'}
                    >
                      {orden.estado === 'completado' ? '✏️' : '📝'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OrdenesLaboratorioList;
