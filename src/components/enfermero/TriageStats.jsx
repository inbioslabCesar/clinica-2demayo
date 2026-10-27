import { memo } from 'react';
import { Icon } from '@fluentui/react';

function TriageStats({ totalRows, triajeStatus }) {
  const total = Number.isFinite(Number(triajeStatus?.total)) ? Number(triajeStatus.total) : Number(totalRows || 0);
  const pendientes = Number.isFinite(Number(triajeStatus?.pendientes)) ? Number(triajeStatus.pendientes) : 0;
  const completados = Number.isFinite(Number(triajeStatus?.completados)) ? Number(triajeStatus.completados) : 0;
  const atrasados = Number.isFinite(Number(triajeStatus?.atrasados)) ? Number(triajeStatus.atrasados) : 0;
  const futuros = Number.isFinite(Number(triajeStatus?.futuros)) ? Number(triajeStatus.futuros) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="People" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-sm text-emerald-100">Total (filtro actual)</div>
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
              {pendientes}
            </div>
            <div className="text-sm text-yellow-100">Pendientes</div>
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
              {completados}
            </div>
            <div className="text-sm text-blue-100">Completados</div>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="PastDue" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">{atrasados}</div>
            <div className="text-sm text-red-100">Atrasados</div>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-purple-500 to-fuchsia-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl">
            <Icon iconName="CalendarMirrored" className="text-2xl" />
          </div>
          <div>
            <div className="text-2xl font-bold">{futuros}</div>
            <div className="text-sm text-purple-100">Futuros</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(TriageStats);
