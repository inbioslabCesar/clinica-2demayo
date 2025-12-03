import { useEffect, useState } from "react";
import { BASE_URL } from "../../config/config";

export default function useTriageConsultas() {
  const [consultas, setConsultas] = useState([]);
  const [triajeStatus, setTriajeStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [triajeActual, setTriajeActual] = useState(null);
  const [triajeData, setTriajeData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargandoTriaje, setCargandoTriaje] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const recargarConsultas = () => {
    setLoading(true);
    fetch(BASE_URL + "api_consultas.php", {credentials: "include"})
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          setConsultas(data.consultas);
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

  // Filtrar por búsqueda y fechas
  let consultasFiltradas = consultas.filter(c => {
    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      const match = (c.historia_clinica && c.historia_clinica.toLowerCase().includes(texto)) ||
                   (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(texto)) ||
                   (c.paciente_apellido && c.paciente_apellido.toLowerCase().includes(texto)) ||
                   (c.medico_nombre && c.medico_nombre.toLowerCase().includes(texto));
      if (!match) return false;
    }
    if (!fechaDesde && !fechaHasta) return true;
    if (!c.fecha) return false;
    if (fechaDesde && c.fecha < fechaDesde) return false;
    if (fechaHasta && c.fecha > fechaHasta) return false;
    return true;
  });

  // Paginación
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const consultasPagina = consultasFiltradas.slice(startIdx, endIdx);

  return {
    consultas,
    triajeStatus,
    loading,
    error,
    triajeActual,
    setTriajeActual,
    triajeData,
    setTriajeData,
    guardando,
    setGuardando,
    cargandoTriaje,
    setCargandoTriaje,
    rowsPerPage,
    setRowsPerPage,
    page,
    setPage,
    busqueda,
    setBusqueda,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    recargarConsultas,
    consultasFiltradas,
    consultasPagina,
    totalRows,
    totalPages,
    startIdx,
    endIdx
  };
}
