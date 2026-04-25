import React from 'react';

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const CARDS = [
  { key: 'gananciaDia',        label: 'Hoy',        icon: '☀️',  bg: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', bold: 'text-emerald-800' },
  { key: 'gananciaMes',        label: 'Este mes',   icon: '📅',  bg: 'from-blue-50 to-blue-100',       border: 'border-blue-200',    text: 'text-blue-700',    bold: 'text-blue-800'   },
  { key: 'gananciaTrimestre',  label: 'Trimestre',  icon: '📆',  bg: 'from-indigo-50 to-indigo-100',   border: 'border-indigo-200',  text: 'text-indigo-700',  bold: 'text-indigo-800' },
  { key: 'gananciaAnio',       label: 'Este año',   icon: '🗓️', bg: 'from-violet-50 to-violet-100',   border: 'border-violet-200',  text: 'text-violet-700',  bold: 'text-violet-800' },
  { key: 'pacientes',          label: 'Pacientes',  icon: '🧑‍⚕️', bg: 'from-purple-50 to-purple-100', border: 'border-purple-200',  text: 'text-purple-700',  bold: 'text-purple-800', raw: true },
  { key: 'ticketPromedio',     label: 'Ticket prom.',icon: '🎫', bg: 'from-amber-50 to-amber-100',    border: 'border-amber-200',   text: 'text-amber-700',   bold: 'text-amber-800'  },
];

const Resumen = ({ resumen }) => {
  const crecimiento = resumen.crecimiento;
  const crecDir = crecimiento === null ? null : (crecimiento >= 0 ? 'up' : 'down');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CARDS.map(({ key, label, icon, bg, border, text, bold, raw }) => (
          <div
            key={key}
            className={`bg-gradient-to-br ${bg} border ${border} rounded-xl p-4 flex flex-col gap-1 shadow-sm hover:shadow-md transition-shadow`}
          >
            <span className={`text-xs font-medium ${text} flex items-center gap-1`}>
              <span>{icon}</span> {label}
            </span>
            <span className={`text-xl sm:text-2xl font-bold ${bold} leading-tight`}>
              {raw ? resumen[key] : fmt(resumen[key])}
            </span>
          </div>
        ))}
      </div>

      {/* Crecimiento badge */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-medium">Crecimiento vs mes anterior:</span>
        {crecimiento === null ? (
          <span className="text-gray-400">N/A</span>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${crecDir === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {crecDir === 'up' ? '▲' : '▼'} {Math.abs(Number(crecimiento)).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
};

export default Resumen;
