import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";

export function useTarifasCrud(cargarTarifas, setNuevaTarifa, setTarifaEditando, setMostrarModal) {
  // Guardar tarifa (crear/editar)
  const guardarTarifa = async (nuevaTarifa, tarifaEditando) => {
    if (!nuevaTarifa.descripcion.trim()) {
      Swal.fire("Error", "La descripción es obligatoria", "error");
      return;
    }
    if (!nuevaTarifa.precio_particular || parseFloat(nuevaTarifa.precio_particular) <= 0) {
      Swal.fire("Error", "El precio particular debe ser mayor a 0", "error");
      return;
    }
    try {
      const url = BASE_URL + "api_tarifas.php";
      const method = tarifaEditando ? "PUT" : "POST";
      const data = tarifaEditando
        ? { ...nuevaTarifa, id: tarifaEditando.id, servicio_tipo: nuevaTarifa.servicio_tipo || tarifaEditando.servicio_tipo }
        : nuevaTarifa;
      // Normalizar: evitar enviar cadenas vacías para porcentajes (backend interpreta '' -> 0)
      const payload = { ...data };
      if (payload.porcentaje_medico === "" || payload.porcentaje_medico === null) payload.porcentaje_medico = null;
      if (payload.porcentaje_clinica === "" || payload.porcentaje_clinica === null) payload.porcentaje_clinica = null;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        Swal.fire({
          title: "¡Éxito!",
          text: tarifaEditando ? "Tarifa actualizada correctamente" : "Tarifa creada correctamente",
          icon: "success",
          confirmButtonText: "OK",
        });
        setMostrarModal(false);
        setTarifaEditando(null);
        setNuevaTarifa({
          servicio_tipo: "consulta",
          medico_id: "general",
          descripcion: "",
          precio_particular: "",
          precio_seguro: "",
          precio_convenio: "",
          activo: 1,
          porcentaje_medico: "",
          porcentaje_clinica: "",
          monto_medico: "",
          monto_clinica: "",
        });
        cargarTarifas();
      } else {
        Swal.fire("Error", result.error || "Error al guardar la tarifa", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión", "error");
    }
  };

  // Eliminar tarifa
  const eliminarTarifa = async (id, descripcion) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: `¿Deseas eliminar la tarifa "${descripcion}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });
    if (result.isConfirmed) {
      try {
        const url = BASE_URL + "api_tarifas.php";
        const response = await fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id }),
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire("¡Eliminado!", "La tarifa ha sido eliminada", "success");
          cargarTarifas();
        } else {
          Swal.fire("Error", data.error || "Error al eliminar la tarifa", "error");
        }
      } catch {
        Swal.fire("Error", "Error de conexión", "error");
      }
    }
  };

  // Cambiar estado de tarifa
  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      const url = BASE_URL + "api_tarifas.php";
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, activo: nuevoEstado }),
      });
      const data = await response.json();
      if (data.success) {
        cargarTarifas();
      } else {
        Swal.fire("Error", data.error || "Error al cambiar estado", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión", "error");
    }
  };

  return { guardarTarifa, eliminarTarifa, cambiarEstado };
}
