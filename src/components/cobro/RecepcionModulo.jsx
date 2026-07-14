import { useState } from "react";
import PacienteListSearch from "../paciente-list/PacienteListSearch.jsx";
import PacienteListResumen from "../paciente-list/PacienteListResumen.jsx";
import ServiciosSelector from "../comunes/ServiciosSelector.jsx";
import PacienteForm from "../paciente-list/PacienteListForm.jsx";


function RecepcionModulo({ onPacienteRegistrado }) {
  const [paciente, setPaciente] = useState(null);
  const [showRegistro, setShowRegistro] = useState(false);
  const [registroInicial, setRegistroInicial] = useState({});
  const [pacienteNoEncontrado, setPacienteNoEncontrado] = useState(null);

  const parseNombreApellido = (texto) => {
    const limpio = String(texto || "").trim().replace(/\s+/g, " ");
    if (!limpio) return { nombre: "", apellido: "" };
    const partes = limpio.split(" ");
    if (partes.length === 1) {
      return { nombre: partes[0], apellido: "" };
    }
    return {
      nombre: partes.slice(0, -1).join(" "),
      apellido: partes.slice(-1).join(" "),
    };
  };

  const hayPacienteSeleccionado = Boolean(paciente && paciente.id);

  // Limpiar paciente y registro cuando se inicia una nueva búsqueda
  const handleNuevaBusqueda = () => {
    setPaciente(null);
    setShowRegistro(false);
    setRegistroInicial({});
    setPacienteNoEncontrado(null);
  };

  const handleNoEncontrado = (payload = {}) => {
    const tipoBusqueda = String(payload?.tipo || "").toLowerCase();
    const valorBusqueda = String(payload?.valor || "").trim();
    const esDocumento = tipoBusqueda === "dni" || tipoBusqueda === "carnet_extranjeria";
    const dniSugerido = esDocumento ? valorBusqueda : "";
    const tipoDocumentoSugerido = tipoBusqueda === "carnet_extranjeria" ? "carnet_extranjeria" : "dni";
    const nombreApellidoSugerido = tipoBusqueda === "nombre" ? parseNombreApellido(valorBusqueda) : { nombre: "", apellido: "" };

    if (dniSugerido) {
      setRegistroInicial({ dni: dniSugerido, tipo_documento: tipoDocumentoSugerido });
    } else if (tipoBusqueda === "nombre" && (nombreApellidoSugerido.nombre || nombreApellidoSugerido.apellido)) {
      setRegistroInicial({
        nombre: nombreApellidoSugerido.nombre,
        apellido: nombreApellidoSugerido.apellido,
      });
    } else {
      setRegistroInicial({});
    }
    setPacienteNoEncontrado({
      tipo: tipoBusqueda,
      valor: valorBusqueda,
    });
    setShowRegistro(true);
  };

  const handleContinuarComoParticular = () => {
    const valor = String(pacienteNoEncontrado?.valor || "").trim();
    const tipo = String(pacienteNoEncontrado?.tipo || "").toLowerCase();
    const esDoc = tipo === "dni" || tipo === "carnet_extranjeria";
    const nombreApellido = tipo === "nombre" ? parseNombreApellido(valor) : { nombre: "", apellido: "" };

    const nombreTemporal = nombreApellido.nombre || "Particular";
    const apellidoTemporal = nombreApellido.apellido || "";

    setPaciente({
      id: 0,
      nombre: nombreTemporal,
      apellido: apellidoTemporal,
      dni: esDoc ? valor : "",
      historia_clinica: "",
      es_temporal: true,
      tipo_documento: tipo || "dni",
      busqueda_origen: valor,
    });
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
        onNoEncontrado={handleNoEncontrado}
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
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleContinuarComoParticular}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Continuar como particular (solo cotizacion)
            </button>
          </div>
          <PacienteForm initialData={registroInicial} onRegistroExitoso={handleRegistroExitoso} />
        </div>
      )}
    </div>
  );
}

export default RecepcionModulo;
