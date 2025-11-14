import { useState } from "react";

export function useTarifaModal() {
  const [mostrarModal, setMostrarModal] = useState(false);
  const [tarifaEditando, setTarifaEditando] = useState(null);
  const [nuevaTarifa, setNuevaTarifa] = useState({
    servicio_tipo: "consulta",
    medico_id: "general",
    // ...existing code...
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

  // Abrir modal para crear/editar tarifa
  const abrirModal = (tarifa = null) => {
    if (tarifa) {
      setTarifaEditando(tarifa);
      setNuevaTarifa({
        servicio_tipo: tarifa.servicio_tipo,
        medico_id: tarifa.medico_id ? tarifa.medico_id.toString() : "general",
        // ...existing code...
        descripcion: tarifa.descripcion,
        precio_particular: tarifa.precio_particular,
        precio_seguro: tarifa.precio_seguro || "",
        precio_convenio: tarifa.precio_convenio || "",
        activo: tarifa.activo,
        porcentaje_medico: tarifa.porcentaje_medico || "",
        porcentaje_clinica: tarifa.porcentaje_clinica || "",
        monto_medico: tarifa.monto_medico || "",
        monto_clinica: tarifa.monto_clinica || "",
      });
    } else {
      setTarifaEditando(null);
      setNuevaTarifa({
        servicio_tipo: "consulta",
        medico_id: "general",
        // ...existing code...
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
    }
    setMostrarModal(true);
  };

  // Cerrar modal y resetear estado
  const cerrarModal = () => {
    setMostrarModal(false);
    setTarifaEditando(null);
    setNuevaTarifa({
      servicio_tipo: "consulta",
      medico_id: "general",
      // ...existing code...
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
  };

  return {
    mostrarModal,
    setMostrarModal,
    tarifaEditando,
    setTarifaEditando,
    nuevaTarifa,
    setNuevaTarifa,
    abrirModal,
    cerrarModal,
  };
}
