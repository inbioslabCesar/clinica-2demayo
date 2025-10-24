import React from "react";

function PacienteTable({ pacientes, onEditar, onEliminar, onDescargarCaratula, onNavigate, sortBy, sortDir, handleSort }) {
  return (
    <div className="hidden lg:block overflow-x-auto w-full">
      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-blue-100">
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("historia_clinica")}>HC {sortBy === "historia_clinica" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("nombre")}>Nombre {sortBy === "nombre" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("apellido")}>Apellido {sortBy === "apellido" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("edad")}>Edad {sortBy === "edad" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("dni")}>DNI {sortBy === "dni" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("tipo_seguro")}>Tipo de seguro {sortBy === "tipo_seguro" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map(p => (
            <tr key={p.id} className="hover:bg-blue-50">
              <td className="border px-2 py-1">{p.historia_clinica}</td>
              <td className="border px-2 py-1">{p.nombre}</td>
              <td className="border px-2 py-1">{p.apellido}</td>
              <td className="border px-2 py-1">{p.edad !== null ? p.edad : '-'}</td>
              <td className="border px-2 py-1">{p.dni}</td>
              <td className="border px-2 py-1">{p.tipo_seguro || '-'}</td>
              <td className="border py-1">
                <div className="flex gap-1">
                  <button onClick={() => onEditar(p)} className="bg-yellow-400 text-white px-1 py-1 rounded text-xs hover:bg-yellow-500">Editar</button>
                  <button onClick={() => onEliminar(p)} className="bg-red-500 text-white px-1 py-1 rounded text-xs hover:bg-red-600">Eliminar</button>
                  <button onClick={() => onNavigate(`/consumo-paciente/${p.id}`)} className="bg-blue-600 text-white px-1 py-1 rounded text-xs hover:bg-blue-700" title="Ver consumo total">Consumo</button>
                  <button onClick={() => onDescargarCaratula(p)} className="bg-purple-600 text-white px-1 py-1 rounded text-xs hover:bg-purple-700" title="Descargar carátula">Carátula</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PacienteTable;
