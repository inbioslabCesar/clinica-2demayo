import { useState } from "react";
import PacienteListSearch from "../paciente-list/PacienteListSearch.jsx";
import PacienteListResumen from "../paciente-list/PacienteListResumen.jsx";
import ServiciosSelector from "../comunes/ServiciosSelector.jsx";
import PacienteForm from "../paciente-list/PacienteListForm.jsx";


function RecepcionModulo({ onPacienteRegistrado }) {
  const [paciente, setPaciente] = useState(null);
  const [showRegistro, setShowRegistro] = useState(false);

  const hayPacienteSeleccionado = Boolean(paciente && paciente.id);

  // Limpiar paciente y registro cuando se inicia una nueva búsqueda
  const handleNuevaBusqueda = () => {
    setPaciente(null);
    setShowRegistro(false);
  };

  // Callback para cuando se registra un paciente
  const handleRegistroExitoso = (nuevoPaciente) => {
    setPaciente(nuevoPaciente);
    setShowRegistro(false);
    if (onPacienteRegistrado) onPacienteRegistrado();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Flujo de Cotizacion Rapida</h3>
          {(hayPacienteSeleccionado || showRegistro) && (
            <button
              type="button"
              onClick={handleNuevaBusqueda}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Nueva busqueda
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
          <div className={`rounded-lg px-3 py-2 ${hayPacienteSeleccionado || showRegistro ? "bg-emerald-50 text-emerald-800" : "bg-indigo-50 text-indigo-800"}`}>
            1. Buscar paciente
          </div>
          <div className={`rounded-lg px-3 py-2 ${hayPacienteSeleccionado ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            2. Confirmar paciente
          </div>
          <div className={`rounded-lg px-3 py-2 ${hayPacienteSeleccionado ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            3. Cotizar servicio
          </div>
        </div>
      </div>

      <PacienteListSearch 
        onPacienteEncontrado={setPaciente}
        onNoEncontrado={() => setShowRegistro(true)}
        onNuevaBusqueda={handleNuevaBusqueda}
      />

      {paciente && (
        <>
          <PacienteListResumen paciente={paciente} />
          <ServiciosSelector paciente={paciente} />
        </>
      )}

      {showRegistro && !paciente && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm font-semibold text-amber-900">Paciente no encontrado. Registrelo para continuar con la cotizacion.</p>
          <PacienteForm initialData={{}} onRegistroExitoso={handleRegistroExitoso} />
        </div>
      )}
    </div>
  );
}

export default RecepcionModulo;
