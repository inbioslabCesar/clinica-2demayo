import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/apiClient";

export default function useTriageConsultas() {
  const [consultas, setConsultas] = useState([]);
  const [triajeStatus, setTriajeStatus] = useState({});
  const [triajeStats, setTriajeStats] = useState({ pendientes: 0, completados: 0 });
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
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const recargarConsultas = () => {
    setLoading(true);
    const params = new URLSearchParams({
      vista: "triaje_panel",
      solo_activas: "1",
      incluir_completadas_sin_triaje: "1",
      page: String(page),
      per_page: String(rowsPerPage),
      search: busqueda.trim(),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      _t: String(Date.now()),
    });

    authFetch(`api_consultas.php?${params.toString()}`)
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

          const pendientes = Number(data?.stats?.pendientes ?? Math.max(0, Number(data?.pagination?.total || 0) - Number(data?.stats?.completados || 0)));
          const completados = Number(data?.stats?.completados ?? 0);
          setTriajeStats({ pendientes, completados });

          const total = Number(data?.pagination?.total ?? listaConsultas.length ?? 0);
          const totalPagesSrv = Math.max(1, Number(data?.pagination?.total_pages ?? 1));
          setTotalRows(total);
          setTotalPages(totalPagesSrv);
          setError(null);
        } else {
          setError(data.error || "Error al cargar consultas");
          setConsultas([]);
          setTriajeStatus({});
          setTriajeStats({ pendientes: 0, completados: 0 });
          setTotalRows(0);
          setTotalPages(1);
        }
        setLoading(false);
      })
      .catch((_err) => {
        setError("Error de red");
        setConsultas([]);
        setTriajeStatus({});
        setTriajeStats({ pendientes: 0, completados: 0 });
        setTotalRows(0);
        setTotalPages(1);
        setLoading(false);
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      recargarConsultas();
    }, 220);
    return () => clearTimeout(timer);
  }, [page, rowsPerPage, busqueda, fechaDesde, fechaHasta]);

  const consultasFiltradas = consultas;
  const consultasPagina = consultas;
  const startIdx = useMemo(() => Math.max(0, (page - 1) * rowsPerPage), [page, rowsPerPage]);
  const endIdx = useMemo(() => startIdx + consultasPagina.length, [startIdx, consultasPagina.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return {
    consultas,
    triajeStatus,
    triajeStats,
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
