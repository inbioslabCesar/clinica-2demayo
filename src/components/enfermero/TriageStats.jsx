import { Icon } from '@fluentui/react';

export default function TriageStats({ totalRows, triajeStatus }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="People" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalRows}</div>
            <div className="text-sm text-emerald-100">Total Pacientes</div>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="Clock" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">
              {Object.values(triajeStatus).filter(status => status === 'Pendiente').length}
            </div>
            <div className="text-sm text-yellow-100">Triajes Pendientes</div>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="CheckMark" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">
              {Object.values(triajeStatus).filter(status => status === 'Completado').length}
            </div>
            <div className="text-sm text-blue-100">Triajes Completados</div>
          </div>
        </div>
      </div>
    </div>
  );
}
