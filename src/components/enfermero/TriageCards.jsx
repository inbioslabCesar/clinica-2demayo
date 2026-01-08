import { Icon } from '@fluentui/react';

export default function TriageCards({ consultasPagina, triajeStatus, onRealizarTriaje }) {
  // Ordenar por fecha y hora descendente (último primero)
  const consultasOrdenadas = [...consultasPagina].sort((a, b) => {
    const fechaA = new Date(`${a.fecha}T${a.hora}`);
    const fechaB = new Date(`${b.fecha}T${b.hora}`);
    return fechaB - fechaA;
  });
  return (
    <div className="lg:hidden p-4 space-y-4">
      {consultasOrdenadas.map((c) => (
        <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full">
                <Icon iconName="Contact" className="text-xl text-emerald-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-800 text-lg">
                  {c.paciente_nombre} {c.paciente_apellido}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Icon iconName="NumberField" className="text-sm" />
                  HC: {c.historia_clinica || 'N/A'}
                </div>
              </div>
            </div>
            {triajeStatus[c.id] === 'Completado' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <Icon iconName="CheckMark" className="text-xs" />
                Completado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <Icon iconName="Clock" className="text-xs" />
                Pendiente
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Icon iconName="Health" className="text-lg text-blue-500" />
              <div>
                <div className="text-xs text-gray-500">Médico</div>
                <div className="text-sm text-gray-800">{c.medico_nombre} {c.medico_apellido || 'N/A'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Icon iconName="Calendar" className="text-lg text-gray-400" />
              <div>
                <div className="text-xs text-gray-500">Fecha y Hora</div>
                <div className="text-sm text-gray-800">{c.fecha} - {c.hora}</div>
              </div>
            </div>
          </div>
          <button
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            onClick={() => onRealizarTriaje(c)}
          >
            <Icon iconName="Health" className="text-xl" />
            Realizar Triaje
          </button>
        </div>
      ))}
    </div>
  );
}
