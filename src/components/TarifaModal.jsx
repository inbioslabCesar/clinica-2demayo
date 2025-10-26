import React from "react";

function TarifaModal({ mostrarModal, cerrarModal, tarifaEditando, nuevaTarifa, setNuevaTarifa, medicos, serviciosMedicos, generarDescripcion, guardarTarifa }) {
  // ...renderizar modal de tarifa...
  return mostrarModal ? (
    <div>Modal de tarifa aquí</div>
  ) : null;
}

export default TarifaModal;
