import { useEffect, useMemo, useState } from "react";
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

  const normalizarHora = (hora) => {
    const valor = String(hora || '').trim();
    if (!valor) return '00:00:00';
    if (valor.length === 5) return `${valor}:00`;
    return valor;
  };

  const recargarConsultas = () => {
    setLoading(true);
    fetch(BASE_URL + "api_consultas.php?solo_activas=1", {credentials: "include"})
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const listaConsultas = Array.isArray(data.consultas) ? data.consultas : [];
          setConsultas(listaConsultas);

          const statusObj = {};
          listaConsultas.forEach((c) => {
            const realizado = String(c?.triaje_realizado ?? '0') === '1';
            statusObj[c.id] = realizado ? 'Completado' : 'Pendiente';
          });
          setTriajeStatus(statusObj);
          setError(null);
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

  const consultasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    const filtradas = consultas.filter((c) => {
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

    return filtradas.sort((a, b) => {
      const fechaHoraA = `${a.fecha || ''} ${normalizarHora(a.hora)}`;
      const fechaHoraB = `${b.fecha || ''} ${normalizarHora(b.hora)}`;
      return fechaHoraB.localeCompare(fechaHoraA);
    });
  }, [consultas, busqueda, fechaDesde, fechaHasta]);

  const totalRows = consultasFiltradas.length;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalRows / rowsPerPage)), [totalRows, rowsPerPage]);
  const startIdx = useMemo(() => (page - 1) * rowsPerPage, [page, rowsPerPage]);
  const endIdx = startIdx + rowsPerPage;
  const consultasPagina = useMemo(
    () => consultasFiltradas.slice(startIdx, endIdx),
    [consultasFiltradas, startIdx, endIdx]
  );

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
