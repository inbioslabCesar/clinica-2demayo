import React from 'react';

const RankingRecepcionistas = ({ ranking }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <h2 className="text-lg font-semibold text-gray-800 mb-2">Ranking Recepcionistas</h2>
    <ul className="space-y-2">
      {ranking.map((r, i) => (
        <li key={r.nombre} className="flex items-center gap-2">
          <span className={`text-xl ${i === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
          <span className="font-semibold">{r.nombre}</span>
          <span className="ml-auto text-green-700 font-bold">S/ {r.ingresos}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default RankingRecepcionistas;
