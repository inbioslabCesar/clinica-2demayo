
import { useState } from "react";
import { BASE_URL } from "../../config/config";


function PacienteSearch({ onPacienteEncontrado, onNoEncontrado, onNuevaBusqueda }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("dni");

  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!busqueda.trim()) return;
    setBuscando(true);
    setResultados([]);
    try {
      const res = await fetch(BASE_URL + 'api_pacientes_buscar.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, valor: busqueda })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.pacientes) && data.pacientes.length > 0) {
        setResultados(data.pacientes);
        setNoEncontrado(false);
        // Selección automática si solo hay un resultado
        if (data.pacientes.length === 1 && onPacienteEncontrado) {
          setNoEncontrado(false);
          onPacienteEncontrado(data.pacientes[0]);
        }
      } else {
        setResultados([]);
        setNoEncontrado(true);
        onNoEncontrado();
      }
    } catch {
      setResultados([]);
      onNoEncontrado();
    }
    setBuscando(false);
  };

  // Limpiar paciente anterior al cambiar input o tipo
  const handleInputChange = (e) => {
  setBusqueda(e.target.value);
  setNoEncontrado(false);
  if (onNuevaBusqueda) onNuevaBusqueda();
  };
  const handleTipoChange = (e) => {
  setTipo(e.target.value);
  setNoEncontrado(false);
  if (onNuevaBusqueda) onNuevaBusqueda();
  };

  return (
    <div className="mb-4">
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2 mb-4">
        <select value={tipo} onChange={handleTipoChange} className="border rounded px-2 py-1">
          <option value="dni">DNI</option>
          <option value="nombre">Nombre y Apellido</option>
          <option value="historia">Historia Clínica</option>
        </select>
        <input
          type="text"
          value={busqueda}
          onChange={handleInputChange}
          placeholder={`Buscar por ${tipo}`}
          className="border rounded px-2 py-1 flex-1"
        />
        <button type="submit" className="bg-blue-500 text-white rounded px-4 py-1 font-bold" disabled={buscando}>Buscar</button>
      </form>
      {buscando && <div className="text-blue-600">Buscando...</div>}
  {resultados.length > 0 && (
        <div className="mt-2 bg-blue-50 rounded-lg p-2">
          <div className="font-bold mb-2">Selecciona un paciente:</div>
          <ul className="divide-y divide-blue-100">
            {resultados.length === 1 ? (
              <li key={resultados[0].id} className="py-2 flex flex-col md:flex-row md:items-center gap-2">
                <span className="w-full px-3 py-2 rounded bg-blue-100 font-semibold text-blue-900">
                  {resultados[0].nombre} {resultados[0].apellido} | DNI: {resultados[0].dni} | HC: {resultados[0].historia_clinica}
                </span>
              </li>
            ) : (
              resultados.map(p => (
                <li key={p.id} className="py-2 flex flex-col md:flex-row md:items-center gap-2">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded bg-blue-100 hover:bg-blue-200 font-semibold text-blue-900"
                    onClick={() => {
                      setNoEncontrado(false);
                      onPacienteEncontrado(p);
                    }}
                  >
                    {p.nombre} {p.apellido} | DNI: {p.dni} | HC: {p.historia_clinica}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
      {noEncontrado && (
        <div className="mt-2">
          <button className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 text-sm" disabled>
            Paciente no encontrado
          </button>
        </div>
      )}
    </div>
  );
}

export default PacienteSearch;
