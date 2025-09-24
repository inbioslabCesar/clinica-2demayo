
import React, { useState } from "react";
import { BASE_URL } from "../config/config";


function PacienteSearch({ onPacienteEncontrado, onNoEncontrado, onNuevaBusqueda }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("dni");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!busqueda.trim()) return;
    try {
  const res = await fetch(BASE_URL + 'api_pacientes_buscar.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, valor: busqueda })
      });
      const data = await res.json();
      console.log('Respuesta backend:', data);
      if (data.success && data.paciente) {
        onPacienteEncontrado(data.paciente);
      } else {
        onNoEncontrado();
      }
    } catch {
      onNoEncontrado();
    }
  };

  // Limpiar paciente anterior al cambiar input o tipo
  const handleInputChange = (e) => {
    setBusqueda(e.target.value);
    if (onNuevaBusqueda) onNuevaBusqueda();
  };
  const handleTipoChange = (e) => {
    setTipo(e.target.value);
    if (onNuevaBusqueda) onNuevaBusqueda();
  };

  return (
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
      <button type="submit" className="bg-blue-500 text-white rounded px-4 py-1 font-bold">Buscar</button>
    </form>
  );
}

export default PacienteSearch;
