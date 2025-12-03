import { Icon } from '@fluentui/react';

export default function TriageTable({ consultasPagina, triajeStatus, onRealizarTriaje }) {
  return (
    <div className="hidden lg:block">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Historia Clínica</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Paciente</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Médico</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Fecha y Hora</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Estado</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {consultasPagina.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors duration-200">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Icon iconName="NumberField" className="text-lg text-gray-400" />
                  <span className="font-mono text-sm">{c.historia_clinica || '-'}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 rounded-full">
                    <Icon iconName="Contact" className="text-lg text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {c.paciente_nombre} {c.paciente_apellido}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Icon iconName="Health" className="text-lg text-blue-500" />
                  <span className="text-sm text-gray-700">{c.medico_nombre} {c.medico_apellido || ''}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Icon iconName="Calendar" className="text-lg text-gray-400" />
                  <div className="text-sm">
                    <div className="text-gray-800">{c.fecha}</div>
                    <div className="text-gray-500">{c.hora}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                {triajeStatus[c.id] === 'Completado' ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    <Icon iconName="CheckMark" className="text-sm" />
                    Completado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                    <Icon iconName="Clock" className="text-sm" />
                    Pendiente
                  </span>
                )}
              </td>
              <td className="px-6 py-4">
                <button
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  onClick={() => onRealizarTriaje(c)}
                >
                  <Icon iconName="Health" className="text-lg" />
                  Realizar Triaje
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
