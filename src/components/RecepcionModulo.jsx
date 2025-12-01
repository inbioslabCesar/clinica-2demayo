import { useState } from "react";
import PacienteSearch from "./paciente/PacienteSearch";
import PacienteResumen from "./paciente/PacienteResumen";
import ServiciosSelector from "./ServiciosSelector";
import PacienteForm from "./paciente-list/PacienteListForm";


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
    <div className="space-y-6">
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
