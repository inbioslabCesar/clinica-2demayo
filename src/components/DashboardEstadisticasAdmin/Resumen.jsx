import React from 'react';

const Resumen = ({ resumen }) => (
  <div className="bg-white rounded-lg shadow-md p-6 flex flex-col gap-2">
    <h2 className="text-lg font-semibold text-gray-800 mb-2">Resumen</h2>
    <div className="flex flex-col gap-1">
      <span>Ganancia hoy: <span className="font-bold text-green-600">S/ {resumen.gananciaDia}</span></span>
      <span>Ganancia mes: <span className="font-bold text-blue-600">S/ {resumen.gananciaMes}</span></span>
      <span>Ganancia trimestre: <span className="font-bold text-indigo-600">S/ {resumen.gananciaTrimestre}</span></span>
      <span>Ganancia año: <span className="font-bold text-pink-600">S/ {resumen.gananciaAnio}</span></span>
      <span>Crecimiento: <span className={`font-bold ${resumen.crecimiento === null ? 'text-gray-500' : (resumen.crecimiento >= 0 ? 'text-green-600' : 'text-red-600')}`}>{resumen.crecimiento === null ? '-' : `${Number(resumen.crecimiento).toFixed(2)}%`}</span></span>
      <span>Pacientes atendidos: <span className="font-bold text-purple-600">{resumen.pacientes}</span></span>
      <span>Ticket promedio: <span className="font-bold text-yellow-600">S/ {resumen.ticketPromedio}</span></span>
    </div>
  </div>
);

export default Resumen;
