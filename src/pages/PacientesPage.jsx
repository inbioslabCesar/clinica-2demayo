import React, { useState } from "react";
import PacienteList from "../components/paciente-list/PacienteList";
import QuickAccessNav from "../components/comunes/QuickAccessNav";

function PacientesPage() {
  const [pacientes] = useState([]);


  return (
    <div>
      <QuickAccessNav keys={["recordatorios", "listaConsultas", "cotizaciones", "reporteCaja"]} className="mb-4" />
      <PacienteList pacientes={pacientes} />
    </div>
  );
}

export default PacientesPage;
