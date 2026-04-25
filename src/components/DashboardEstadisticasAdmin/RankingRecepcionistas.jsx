import React, { useMemo } from 'react';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BAR_COLORS = [
  'bg-amber-400',
  'bg-slate-400',
  'bg-orange-400',
];
const MEDAL_TEXT_COLORS = [
  'text-amber-600',
  'text-slate-500',
  'text-orange-500',
];

const RankingRecepcionistas = ({ ranking }) => {
  const maxIngresos = useMemo(
    () => Math.max(...(ranking.map(r => Number(r.ingresos || 0))), 1),
    [ranking]
  );

  if (!ranking || ranking.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">🏆 Ranking Recepcionistas</h2>
        <p className="text-gray-400 text-sm">Sin datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        🏆 Ranking Recepcionistas
        <span className="text-xs font-normal text-gray-400">este mes</span>
      </h2>
      <ol className="space-y-3">
        {ranking.map((r, i) => {
          const pct = Math.round((Number(r.ingresos || 0) / maxIngresos) * 100);
          const medal = MEDALS[i] ?? null;
          const barColor = MEDAL_BAR_COLORS[i] ?? 'bg-purple-400';
          const numColor = MEDAL_TEXT_COLORS[i] ?? 'text-purple-600';

          return (
            <li key={r.nombre} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center text-base" aria-label={`Posición ${i + 1}`}>
                  {medal ?? <span className={`font-bold ${numColor}`}>#{i + 1}</span>}
                </span>
                <span className="font-medium text-gray-800 flex-1 truncate">{r.nombre}</span>
                <span className={`font-bold ${numColor} whitespace-nowrap`}>S/ {Number(r.ingresos || 0).toFixed(2)}</span>
              </div>
              {/* Progress bar */}
              <div className="ml-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default RankingRecepcionistas;
