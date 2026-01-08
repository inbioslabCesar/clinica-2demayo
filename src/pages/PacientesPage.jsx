import React, { useState } from "react";
import PacienteList from "../components/paciente-list/PacienteList";

function PacientesPage() {
  const [pacientes] = useState([]);


  return (
    <div>
      <PacienteList pacientes={pacientes} />
    </div>
  );
}

export default PacientesPage;
