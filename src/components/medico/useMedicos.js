import { useState, useEffect } from "react";
import { BASE_URL } from "../../config/config";

export default function useMedicos({ initialBusqueda = "", initialPage = 1, initialRowsPerPage = 5 } = {}) {
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(initialPage);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busqueda, setBusqueda] = useState(initialBusqueda);

  // Fetch medicos
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: rowsPerPage,
      busqueda: busqueda.trim(),
    });
    fetch(`${BASE_URL}api_medicos.php?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMedicos(data.medicos);
          setTotalRows(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setError(data.error || "Error al cargar médicos");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [page, rowsPerPage, busqueda]);

  // Guardar o editar médico
  const guardarMedico = async (medico) => {
    setLoading(true);
    setError("");
    let result;
    try {
      const res = await fetch(`${BASE_URL}api_medicos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(medico),
        credentials: "include"
      });
      const data = await res.json();
      if (data.success && data.medico) {
        setMedicos(prev => {
          if (medico.id) {
            return prev.map(m => m.id === data.medico.id ? data.medico : m);
          }
          const existe = prev.find(m => m.id === data.medico.id);
          if (!existe) {
            return [data.medico, ...prev];
          }
          return prev;
        });
        setTotalRows(prev => prev + (medico.id ? 0 : 1));
        result = { success: true, medico: data.medico };
      } else {
        setError(data.error || "Error al guardar médico");
        result = { success: false, error: data.error };
      }
    } catch {
      setError("Error de conexión con el servidor");
      result = { success: false, error: "Error de conexión" };
    }
    setLoading(false);
    return result;
  };

  // Eliminar médico
  const eliminarMedico = async (medico) => {
    setLoading(true);
    let result;
    try {
      const res = await fetch(`${BASE_URL}api_medicos.php`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: medico.id })
      });
      const data = await res.json();
      if (data.success) {
        setMedicos(prev => prev.filter(m => m.id !== medico.id));
        setTotalRows(prev => prev - 1);
        result = { success: true };
      } else {
        setError(data.error || "Error al eliminar médico");
        result = { success: false, error: data.error };
      }
    } catch {
      setError("Error de conexión con el servidor");
      result = { success: false, error: "Error de conexión" };
    }
    setLoading(false);
    return result;
  };

  // Puedes agregar aquí funciones para disponibilidad, firma digital, etc.

  return {
    medicos,
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
    guardarMedico,
    eliminarMedico,
    // Agrega aquí funciones extra
  };
}
