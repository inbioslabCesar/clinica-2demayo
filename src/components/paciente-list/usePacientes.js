
import { useState, useEffect } from "react";
import { authFetch } from "../../utils/apiClient";

export default function usePacientes({ initialBusqueda = "", initialPage = 1, initialRowsPerPage = 5, initialFechaDesde = "", initialFechaHasta = "" } = {}) {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(initialPage);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busqueda, setBusqueda] = useState(initialBusqueda);
  // debouncedBusqueda: se actualiza 400 ms después de que el usuario deja de escribir
  const [debouncedBusqueda, setDebouncedBusqueda] = useState(initialBusqueda);
  const [fechaDesde, setFechaDesde] = useState(initialFechaDesde);
  const [fechaHasta, setFechaHasta] = useState(initialFechaHasta);

  // Debounce: cuando busqueda cambia, esperar 400 ms antes de disparar la petición
  // y resetear la página a 1 para que los resultados sean consistentes
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedBusqueda(busqueda);
    }, 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Petición principal: solo dispara cuando los filtros "estabilizados" cambian
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: rowsPerPage,
      busqueda: debouncedBusqueda.trim(),
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta
    });
    let cancelled = false;
    authFetch(`api_pacientes.php?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) {
          setPacientes(data.pacientes);
          setTotalRows(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.error || "Error al cargar pacientes");
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, rowsPerPage, debouncedBusqueda, fechaDesde, fechaHasta]);

  // Función para recargar pacientes desde el backend (tras crear/editar/eliminar)
  const recargarPacientes = (filtros = {}) => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: rowsPerPage,
      busqueda: debouncedBusqueda.trim(),
      fecha_desde: filtros.fechaDesde || fechaDesde,
      fecha_hasta: filtros.fechaHasta || fechaHasta
    });
    authFetch(`api_pacientes.php?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPacientes(data.pacientes);
          setTotalRows(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.error || "Error al cargar pacientes");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  };


  // Crear o editar paciente
  const guardarPaciente = async (paciente) => {
    setLoading(true);
    setError("");
    let result;
    try {
      const res = await authFetch("api_pacientes.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paciente),
      });
      const data = await res.json();
      if (data.success && data.paciente) {
        setPacientes(prev => {
          // Si es edición, reemplazar el paciente por ID
          if (paciente.id) {
            return prev.map(p => p.id === data.paciente.id ? data.paciente : p);
          }
          // Si es alta, agregar solo si no existe el ID
          const existe = prev.find(p => p.id === data.paciente.id);
          if (!existe) {
            return [data.paciente, ...prev];
          }
          return prev;
        });
        setTotalRows(prev => prev + (paciente.id ? 0 : 1));
        result = { success: true, paciente: data.paciente };
      } else {
        setError(data.error || "Error al guardar paciente");
        result = { success: false, error: data.error };
      }
    } catch {
      setError("Error de conexión con el servidor");
      result = { success: false, error: "Error de conexión" };
    }
    setLoading(false);
    return result;
  };

  // Eliminar paciente
  const eliminarPaciente = async (paciente) => {
    setLoading(true);
    let result;
    try {
      const res = await authFetch("api_pacientes.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paciente.id })
      });
      const data = await res.json();
      if (data.success) {
        setPacientes(prev => prev.filter(p => p.id !== paciente.id));
        setTotalRows(prev => prev - 1);
        result = { success: true };
      } else {
        // Mensaje estético con SweetAlert2 si el paciente tiene atenciones
        if (data.error && data.error.toLowerCase().includes('atenciones')) {
          import('sweetalert2').then(Swal => {
            Swal.default.fire({
              icon: 'warning',
              title: 'No se puede eliminar',
              html: `<div style='font-size:1.1em'><b>El paciente tiene atenciones registradas.</b><br>No es posible eliminarlo por seguridad e integridad de datos.</div>`,
              confirmButtonText: 'Aceptar',
              showClass: { popup: 'animate__animated animate__fadeInDown' },
              hideClass: { popup: 'animate__animated animate__fadeOutUp' }
            });
          });
          setError(""); // No mostrar mensaje sin estilo en la tabla
        } else {
          setError(data.error || "Error al eliminar paciente");
        }
        result = { success: false, error: data.error };
      }
    } catch {
      setError("Error de conexión con el servidor");
      result = { success: false, error: "Error de conexión" };
    }
    setLoading(false);
    return result;
  };

  // Puedes agregar aquí funciones para exportar a Excel/PDF si lo necesitas

  return {
    pacientes,
    loading,
    error,
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    totalRows,
    totalPages,
    busqueda,
    setBusqueda,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    guardarPaciente,
    eliminarPaciente,
    recargarPacientes
  };
}
