import React, { useState } from "react";
import PacienteSearch from "./PacienteSearch";
import PacienteResumen from "./PacienteResumen";
import ServiciosSelector from "./ServiciosSelector";
import PacienteForm from "./PacienteForm";


function RecepcionModulo({ onPacienteRegistrado }) {
  const [paciente, setPaciente] = useState(null);
  const [showRegistro, setShowRegistro] = useState(false);

  // Limpiar paciente y registro cuando se inicia una nueva búsqueda
  const handleNuevaBusqueda = () => {
    setPaciente(null);
    setShowRegistro(false);
  };

  // Callback para cuando se registra un paciente
  const handleRegistroExitoso = (nuevoPaciente) => {
    setPaciente(nuevoPaciente);
    if (onPacienteRegistrado) onPacienteRegistrado();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4 text-purple-800">Atención en Recepción</h2>
      <PacienteSearch 
        onPacienteEncontrado={setPaciente}
        onNoEncontrado={() => setShowRegistro(true)}
        onNuevaBusqueda={handleNuevaBusqueda}
      />
      {paciente && (
        <>
          <PacienteResumen paciente={paciente} />
          <ServiciosSelector paciente={paciente} />
        </>
      )}
      {showRegistro && !paciente && (
        <div className="mt-4">
          <p className="mb-2 text-blue-700">Paciente no encontrado. ¿Desea registrarlo?</p>
          <PacienteForm initialData={{}} onRegistroExitoso={handleRegistroExitoso} />
        </div>
      )}
    </div>
  );
}

export default RecepcionModulo;
