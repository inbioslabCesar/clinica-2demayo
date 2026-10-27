import { memo } from 'react';
import { Icon } from '@fluentui/react';

function TriageCards({ consultasPagina, onRealizarTriaje }) {
  const estadoConsultaNorm = (consulta) => String(consulta?.estado || "").toLowerCase().trim();
  const esCancelado = (consulta) => ["cancelada", "cancelado", "anulada", "anulado"].includes(estadoConsultaNorm(consulta));
  const esRealizado = (consulta) => Number(consulta?.triaje_realizado || 0) === 1 && !esCancelado(consulta);
  const esPendiente = (consulta) => !esRealizado(consulta) && !esCancelado(consulta);
  const esReprogramado = (consulta) => Number(consulta?.es_reprogramada || 0) === 1;

  const getContratoMeta = (consulta) => {
    const esContrato = Number(consulta?.es_contrato || 0) === 1;
    if (!esContrato) {
      return { visible: false, label: '', icon: '', className: '' };
    }
    return {
      visible: true,
      label: 'Contrato',
      icon: '📘',
      className: 'bg-emerald-100 text-emerald-800'
    };
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '-';
    const partes = String(fecha).split('-');
    if (partes.length !== 3) return fecha;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  };

  const formatearHora = (hora) => {
    if (!hora) return '-';
    return String(hora).slice(0, 5);
  };

  const estadoVisual = (consulta) => {
    if (esCancelado(consulta)) return "Cancelado";
    if (esRealizado(consulta)) return "Realizado";
    return "Pendiente";
  };
  return (
    <div className="lg:hidden p-4 space-y-4">
      {consultasPagina.map((c) => {
        const contratoMeta = getContratoMeta(c);
        const estado = estadoVisual(c);
        const fechaOperativa = String(c?.fecha_programada_operativa || c?.fecha || "");
        const horaOperativa = String(c?.hora_programada_operativa || c?.hora || "");
        const usaFallback = Number(c?.fecha_operativa_fallback_historico || 0) === 1;
        return (
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
                {contratoMeta.visible && (
                  <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${contratoMeta.className}`}>
                    {contratoMeta.icon} {contratoMeta.label}
                  </span>
                )}
              </div>
            </div>
            {estado === 'Realizado' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <Icon iconName="CheckMark" className="text-xs" />
                Realizado
              </span>
            ) : estado === 'Cancelado' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                <Icon iconName="Blocked2" className="text-xs" />
                Cancelado
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
                <div className="text-sm text-gray-800">{formatearFecha(fechaOperativa)} - {formatearHora(horaOperativa)}</div>
                {esReprogramado(c) && (
                  <div className="text-xs font-semibold text-blue-700 mt-1" title={`Reprogramado en: ${String(c?.reprogramada_en || "-")}`}>
                    🔄 Reprogramado
                  </div>
                )}
                {usaFallback && (
                  <div className="text-xs text-amber-700 mt-1">⚠ usando fecha histórica</div>
                )}
              </div>
            </div>
          </div>
          <button
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            disabled={!esPendiente(c)}
            style={!esPendiente(c) ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
            onClick={() => onRealizarTriaje(c)}
          >
            <Icon iconName="Health" className="text-xl" />
            Realizar Triaje
          </button>
        </div>
      );})}
    </div>
  );
}

export default memo(TriageCards);
