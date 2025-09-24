
import React, { useEffect, useState } from "react";
import Spinner from "../Spinner";
import { BASE_URL } from "../../config/config";
import TriageForm from "./TriageForm";

function TriageList() {
  const [consultas, setConsultas] = useState([]);
  const [triajeStatus, setTriajeStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [triajeActual, setTriajeActual] = useState(null);
  const [triajeData, setTriajeData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargandoTriaje, setCargandoTriaje] = useState(false);
  // Paginación
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  // Buscador dinámico
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Refrescar lista de consultas y estados de triaje
  const recargarConsultas = () => {
    setLoading(true);
    fetch(BASE_URL + "api_consultas.php", {credentials: "include"})
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          setConsultas(data.consultas);
          // Consultar estado de triaje para cada consulta
          const statusObj = {};
          await Promise.all(data.consultas.map(async (c) => {
            try {
              const res = await fetch(BASE_URL + `api_triaje.php?consulta_id=${c.id}`);
              const data = await res.json();
              statusObj[c.id] = (data.success && data.triaje) ? 'Completado' : 'Pendiente';
            } catch {
              statusObj[c.id] = 'Pendiente';
            }
          }));
          setTriajeStatus(statusObj);
        } else {
          setError(data.error || "Error al cargar consultas");
        }
        setLoading(false);
      })
      .catch((_err) => {
        setError("Error de red");
        setLoading(false);
      });
  };

  useEffect(() => {
    recargarConsultas();
  }, []);

  if (loading) return <Spinner message="Cargando pacientes en triaje..." />;
  if (error) return <div className="text-red-600">{error}</div>;

  // Filtrar por búsqueda y fechas
  let consultasFiltradas = consultas.filter(c => {
    // Filtro de búsqueda (historia_clinica, paciente, médico)
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (c.historia_clinica && c.historia_clinica.toLowerCase().includes(texto)) ||
                   (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(texto)) ||
                   (c.paciente_apellido && c.paciente_apellido.toLowerCase().includes(texto)) ||
                   (c.medico_nombre && c.medico_nombre.toLowerCase().includes(texto));
      if (!match) return false;
    }
    // Filtro de fechas (por campo fecha)
    if (!fechaDesde && !fechaHasta) return true;
    if (!c.fecha) return false;
    if (fechaDesde && c.fecha < fechaDesde) return false;
    if (fechaHasta && c.fecha > fechaHasta) return false;
    return true;
  });
  // Calcular paginación
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const consultasPagina = consultasFiltradas.slice(startIdx, endIdx);

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">Pacientes pendientes de triaje</h2>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          type="text"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPage(1); }}
          placeholder="Buscar paciente, médico o historia clínica..."
          className="border rounded p-1 text-xs min-w-[180px]"
        />
        <label className="text-xs">Desde:</label>
        <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1); }} className="border rounded p-1 text-xs" />
        <label className="text-xs">Hasta:</label>
        <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1); }} className="border rounded p-1 text-xs" />
        {(fechaDesde || fechaHasta) && (
          <button onClick={() => { setFechaDesde(""); setFechaHasta(""); setPage(1); }} className="text-blue-600 underline text-xs">Limpiar</button>
        )}
        <label className="text-xs">Filas por página:</label>
        <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded p-1 text-xs">
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
        </select>
      </div>
      {triajeActual ? (
        <div className="bg-white rounded shadow p-4 mb-4">
          <h3 className="font-semibold mb-2">Triaje de {triajeActual.paciente_nombre} {triajeActual.paciente_apellido}</h3>
          {cargandoTriaje ? (
            <div>Cargando datos de triaje...</div>
          ) : (
            <TriageForm
              consulta={triajeActual}
              initialData={triajeData}
              onGuardar={async (datos) => {
                setGuardando(true);
                await fetch(BASE_URL + "api_triaje.php", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ consulta_id: triajeActual.id, datos })
                });
                setGuardando(false);
                setTriajeActual(null);
                setTriajeData(null);
                recargarConsultas();
              }}
              onCancelar={() => { setTriajeActual(null); setTriajeData(null); }}
              guardando={guardando}
            />
          )}
        </div>
      ) : (
  <table className="w-full bg-white rounded shadow text-sm">
          <thead>
            <tr className="bg-blue-100">
              <th className="p-2">Historia Clínica</th>
              <th className="p-2">Paciente</th>
              <th className="p-2">Médico</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Hora</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {consultasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No hay pacientes pendientes de triaje.</td>
              </tr>
            ) : (
              consultasPagina.map((c) => (
                <tr key={c.id}>
                  <td className="p-2">{c.historia_clinica || '-'}</td>
                  <td className="p-2">{c.paciente_nombre} {c.paciente_apellido}</td>
                  <td className="p-2">{c.medico_nombre || '-'}</td>
                  <td className="p-2">{c.fecha}</td>
                  <td className="p-2">{c.hora}</td>
                  <td className="p-2 font-semibold">
                    {triajeStatus[c.id] === 'Completado' ? (
                      <span className="text-green-600">Completado</span>
                    ) : (
                      <span className="text-yellow-600">Pendiente</span>
                    )}
                  </td>
                  <td className="p-2">
                    <button
                      className="bg-blue-600 text-white px-2 py-1 rounded"
                      onClick={async () => {
                        setTriajeActual(c);
                        setCargandoTriaje(true);
                        setTriajeData(null);
                        try {
                          const res = await fetch(BASE_URL + `api_triaje.php?consulta_id=${c.id}`);
                          const data = await res.json();
                          if (data.success && data.triaje && data.triaje.datos) {
                            setTriajeData(data.triaje.datos);
                          } else {
                            setTriajeData(null);
                          }
                        } catch {
                          setTriajeData(null);
                        }
                        setCargandoTriaje(false);
                      }}
                    >
                      Realizar triaje
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
      {/* Controles de paginación */}
      {consultas.length > 0 && (
        <div className="flex justify-end items-center gap-2 mt-2">
          <button onClick={() => setPage(page - 1)} disabled={page === 1} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Anterior</button>
          <span className="text-sm">Página {page} de {totalPages}</span>
          <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Siguiente</button>
        </div>
      )}
    </div>
  );
}

export default TriageList;
