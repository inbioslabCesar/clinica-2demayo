
import { useState } from "react";
import { authFetch } from "../../utils/apiClient";

const TIPO_META = {
  dni: { label: "DNI", placeholder: "Ej: 71609118" },
  carnet_extranjeria: { label: "Carnet de Extranjeria", placeholder: "Ej: 001234567890" },
  nombre: { label: "Nombre y Apellido", placeholder: "Ej: Juan Perez" },
  historia: { label: "Historia Clinica", placeholder: "Ej: HC000937" },
};


function PacienteListSearch({ onPacienteEncontrado, onNoEncontrado, onNuevaBusqueda }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("dni");

  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [sugerenciaExterna, setSugerenciaExterna] = useState(null);

  const normalizeText = (value) => String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!busqueda.trim()) return;
    setBuscando(true);
    setResultados([]);
    setSugerenciaExterna(null);
    try {
      const res = await authFetch('api_pacientes_buscar.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, valor: busqueda })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.pacientes) && data.pacientes.length > 0) {
        setResultados(data.pacientes);
        setSugerenciaExterna(null);
        const esBusquedaNombre = String(tipo || "").toLowerCase() === "nombre";
        const buscadoNormalizado = normalizeText(busqueda);
        const existeCoincidenciaExactaNombre = esBusquedaNombre
          ? data.pacientes.some((p) => normalizeText(`${p?.nombre || ""} ${p?.apellido || ""}`) === buscadoNormalizado)
          : false;

        // Si por nombre solo hay sugerencias parciales (sin match exacto),
        // habilitamos el flujo de "continuar como particular" sin perder las sugerencias.
        const mostrarNoEncontradoConSugerencias = esBusquedaNombre && !existeCoincidenciaExactaNombre;
        setNoEncontrado(mostrarNoEncontradoConSugerencias);

        if (mostrarNoEncontradoConSugerencias && onNoEncontrado) {
          onNoEncontrado({
            tipo,
            valor: String(busqueda || "").trim(),
          });
        }

        // Selección automática solo cuando no estamos en escenario de sugerencias parciales.
        if (!mostrarNoEncontradoConSugerencias && data.pacientes.length === 1 && onPacienteEncontrado) {
          setNoEncontrado(false);
          onPacienteEncontrado(data.pacientes[0]);
        }
      } else {
        setResultados([]);
        setNoEncontrado(true);
        const externa = data?.fuente === "externa" && data?.sugerencia_externa
          ? data.sugerencia_externa
          : null;
        setSugerenciaExterna(externa);
        if (onNoEncontrado) {
          onNoEncontrado({
            tipo,
            valor: String(busqueda || "").trim(),
            sugerencia_externa: externa,
            proveedor_externo: data?.proveedor_externo || null,
          });
        }
      }
    } catch {
      setResultados([]);
      setSugerenciaExterna(null);
      if (onNoEncontrado) {
        onNoEncontrado({
          tipo,
          valor: String(busqueda || "").trim(),
        });
      }
    }
    setBuscando(false);
  };

  // Limpiar paciente anterior al cambiar input o tipo
  const handleInputChange = (e) => {
  setBusqueda(e.target.value);
  setNoEncontrado(false);
  setSugerenciaExterna(null);
  if (onNuevaBusqueda) onNuevaBusqueda();
  };
  const handleTipoChange = (e) => {
  setTipo(e.target.value);
  setNoEncontrado(false);
  setSugerenciaExterna(null);
  if (onNuevaBusqueda) onNuevaBusqueda();
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    setResultados([]);
    setNoEncontrado(false);
    setSugerenciaExterna(null);
    if (onNuevaBusqueda) onNuevaBusqueda();
  };

  const tipoActual = TIPO_META[tipo] || TIPO_META.dni;

  return (
    <div className="mb-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-sky-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-indigo-900">Paso 1: Buscar paciente</h3>
          <p className="text-xs text-indigo-700">Busca y selecciona para cotizar en segundos.</p>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700">
          Cotizador rapido
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-[170px_1fr_auto_auto]">
        <select
          value={tipo}
          onChange={handleTipoChange}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-900"
        >
          <option value="dni">DNI</option>
          <option value="carnet_extranjeria">Carnet de Extranjeria</option>
          <option value="nombre">Nombre y Apellido</option>
          <option value="historia">Historia Clinica</option>
        </select>

        <input
          type="text"
          value={busqueda}
          onChange={handleInputChange}
          placeholder={`Buscar por ${tipoActual.label} (${tipoActual.placeholder})`}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={buscando || !busqueda.trim()}
        >
          {buscando ? "Buscando..." : "Buscar"}
        </button>

        <button
          type="button"
          onClick={limpiarBusqueda}
          className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          Limpiar
        </button>
      </form>

      {resultados.length > 0 && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-indigo-900">
            {resultados.length === 1 ? "Paciente encontrado" : `Selecciona un paciente (${resultados.length} resultados)`}
          </div>
          <ul className="space-y-2">
            {resultados.length === 1 ? (
              <li key={resultados[0].id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                {resultados[0].nombre} {resultados[0].apellido} | {tipoActual.label}: {resultados[0].dni} | HC: {resultados[0].historia_clinica}
              </li>
            ) : (
              resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                    onClick={() => {
                      setNoEncontrado(false);
                      onPacienteEncontrado(p);
                    }}
                  >
                    {p.nombre} {p.apellido} | {tipoActual.label}: {p.dni} | HC: {p.historia_clinica}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {noEncontrado && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {sugerenciaExterna
            ? "Paciente no encontrado en base local. Encontramos datos en RENIEC/SUNAT para prellenar el registro."
            : "Paciente no encontrado. Puedes registrarlo en el siguiente paso."}
        </div>
      )}
    </div>
  );
}

export default PacienteListSearch;
