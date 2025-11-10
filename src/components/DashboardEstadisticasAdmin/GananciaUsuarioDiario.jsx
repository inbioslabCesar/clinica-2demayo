import React from 'react';

const GananciaUsuarioDiario = ({ gananciaUsuarios }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <h2 className="text-lg font-semibold text-gray-800 mb-2">Ganancia por Usuario (Diario)</h2>
    <div className="max-h-64 overflow-y-auto border rounded">
      <ul className="space-y-2">
        {Array.isArray(gananciaUsuarios) && gananciaUsuarios.map((g) => (
          <li key={g.fecha + '-' + g.usuario_id} className="flex items-center gap-2">
            <span className="text-gray-500">{g.fecha}</span>
            <span className="font-semibold">{g.usuario_nombre} ({g.rol})</span>
            <span className="ml-auto text-green-700 font-bold">S/ {g.ganancia}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export default GananciaUsuarioDiario;
