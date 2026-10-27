import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/apiClient";

export default function useTriageConsultas() {
  const [consultas, setConsultas] = useState([]);
  const [triajeStatus, setTriajeStatus] = useState({});
  const [triajeStats, setTriajeStats] = useState({
    total: 0,
    pendientes: 0,
    completados: 0,
    cancelados: 0,
    reprogramados: 0,
    atrasados: 0,
    futuros: 0,
    hoy: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [triajeActual, setTriajeActual] = useState(null);
  const [triajeData, setTriajeData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargandoTriaje, setCargandoTriaje] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [filtroProgramacion, setFiltroProgramacion] = useState("hoy");
  const [estadoTriaje, setEstadoTriaje] = useState("pendiente");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const lastRequestRef = useRef(0);

  const limpiarListado = () => {
    setConsultas([]);
    setTriajeStatus({});
    setTriajeStats({
      total: 0,
      pendientes: 0,
      completados: 0,
      cancelados: 0,
      reprogramados: 0,
      atrasados: 0,
      futuros: 0,
      hoy: 0,
    });
    setTotalRows(0);
    setTotalPages(1);
  };

  const esErrorConexionBD = (mensaje) => /error de conexión a la base de datos/i.test(String(mensaje || ""));

  const recargarConsultas = (intento = 0) => {
    const requestId = Date.now();
    lastRequestRef.current = requestId;
    if (intento === 0) {
      setLoading(true);
    }
    const params = new URLSearchParams({
      vista: "triaje_panel",
      solo_activas: "1",
      incluir_completadas_sin_triaje: "1",
      page: String(page),
      per_page: String(rowsPerPage),
      search: busqueda.trim(),
      filtro_programacion: filtroProgramacion,
      estado_triaje: estadoTriaje,
      fecha_desde: filtroProgramacion === "rango" ? fechaDesde : "",
      fecha_hasta: filtroProgramacion === "rango" ? fechaHasta : "",
      _t: String(Date.now()),
    });

    authFetch(`api_consultas.php?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (lastRequestRef.current !== requestId) {
          return;
        }
        if (data.success) {
          const listaConsultas = Array.isArray(data.consultas) ? data.consultas : [];
          setConsultas(listaConsultas);

          const statusObj = {};
          listaConsultas.forEach((c) => {
            const realizado = String(c?.triaje_realizado ?? '0') === '1';
            statusObj[c.id] = realizado ? 'Completado' : 'Pendiente';
          });
          setTriajeStatus(statusObj);

          const pendientes = Number(data?.stats?.pendientes ?? 0);
          const completados = Number(data?.stats?.completados ?? 0);
          const cancelados = Number(data?.stats?.cancelados ?? 0);
          const reprogramados = Number(data?.stats?.reprogramados ?? 0);
          const atrasados = Number(data?.stats?.atrasados ?? 0);
          const futuros = Number(data?.stats?.futuros ?? 0);
          const hoy = Number(data?.stats?.hoy ?? 0);
          setTriajeStats({
            total: Number(data?.stats?.total ?? data?.pagination?.total ?? listaConsultas.length ?? 0),
            pendientes,
            completados,
            cancelados,
            reprogramados,
            atrasados,
            futuros,
            hoy,
          });

          const total = Number(data?.pagination?.total ?? listaConsultas.length ?? 0);
          const totalPagesSrv = Math.max(1, Number(data?.pagination?.total_pages ?? 1));
          setTotalRows(total);
          setTotalPages(totalPagesSrv);
          setError(null);
        } else {
          const mensaje = data.error || "Error al cargar consultas";
          if (esErrorConexionBD(mensaje) && intento < 2) {
            setTimeout(() => recargarConsultas(intento + 1), 550 * (intento + 1));
            return;
          }
          setError(mensaje);
          limpiarListado();
        }
        setLoading(false);
      })
      .catch((_err) => {
        if (lastRequestRef.current !== requestId) {
          return;
        }
        if (intento < 2) {
          setTimeout(() => recargarConsultas(intento + 1), 450 * (intento + 1));
          return;
        }
        setError("Error de red");
        limpiarListado();
        setLoading(false);
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      recargarConsultas();
    }, 220);
    return () => clearTimeout(timer);
  }, [page, rowsPerPage, busqueda, fechaDesde, fechaHasta, filtroProgramacion, estadoTriaje]);

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
    filtroProgramacion,
    setFiltroProgramacion,
    estadoTriaje,
    setEstadoTriaje,
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
