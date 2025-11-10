import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TendenciasIngresos = ({ tendencias }) => (
  <div className="bg-white rounded-lg shadow-md p-6 col-span-1 md:col-span-2 lg:col-span-3">
    <h2 className="text-lg font-semibold text-gray-800 mb-2">Tendencias de Ingresos</h2>
    <div className="w-full">
      {tendencias && tendencias.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={tendencias} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={value => `S/ ${value}`} labelFormatter={label => `Fecha: ${label}`} />
            <Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={3} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400">No hay datos suficientes</div>
      )}
    </div>
  </div>
);

export default TendenciasIngresos;
