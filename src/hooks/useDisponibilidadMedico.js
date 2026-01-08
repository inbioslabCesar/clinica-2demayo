import { useState, useEffect } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";

/**
 * Hook centralizado para gestionar la disponibilidad de médicos
 * Permite obtener, crear, editar y eliminar bloques de disponibilidad
 * Puede usarse para un médico específico o para todos
 */
export default function useDisponibilidadMedico(medicoId = null) {
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch disponibilidad (todos o por médico)
  const fetchDisponibilidad = async () => {
    setLoading(true);
    try {
      const url = medicoId
        ? `${BASE_URL}api_disponibilidad_medicos.php?medico_id=${medicoId}`
        : `${BASE_URL}api_disponibilidad_medicos.php`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data.disponibilidad || []);
      setError(null);
    } catch (err) {
      setError("Error al obtener disponibilidad");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDisponibilidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicoId]);

  // Crear o editar bloque
  const saveDisponibilidad = async (bloque, editId = null) => {
    setLoading(true);
    try {
      const method = editId ? "PUT" : "POST";
      const body = editId ? { ...bloque, id: editId } : { ...bloque, medico_id: medicoId };
      const res = await fetch(`${BASE_URL}api_disponibilidad_medicos.php`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        Swal.fire({
          icon: "success",
          title: editId ? "Disponibilidad actualizada" : "Disponibilidad agregada",
          showConfirmButton: false,
          timer: 1400
        });
        fetchDisponibilidad();
      } else {
        throw new Error();
      }
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error al guardar",
        text: "No se pudo guardar la disponibilidad",
      });
    }
    setLoading(false);
  };

  // Eliminar bloque
  const deleteDisponibilidad = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api_disponibilidad_medicos.php`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        Swal.fire({
          icon: "success",
          title: "Disponibilidad eliminada",
          showConfirmButton: false,
          timer: 1400
        });
        fetchDisponibilidad();
      } else {
        throw new Error();
      }
    } catch {
      Swal.fire({
        icon: "error",
        title: "Error al eliminar",
        text: "No se pudo eliminar la disponibilidad",
      });
    }
    setLoading(false);
  };

  return {
    disponibilidad,
    loading,
    error,
    fetchDisponibilidad,
    saveDisponibilidad,
    deleteDisponibilidad
  };
}
