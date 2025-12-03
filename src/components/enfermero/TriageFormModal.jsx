import TriageForm from "./TriageForm";
import { Icon } from '@fluentui/react';

export default function TriageFormModal({ triajeActual, triajeData, cargandoTriaje, guardando, onGuardar, onCancelar }) {
  if (!triajeActual) return null;
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
              <Icon iconName="Health" className="text-2xl text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">
                Triaje: {triajeActual.paciente_nombre} {triajeActual.paciente_apellido}
              </h3>
              <p className="text-emerald-100">
                Historia Clínica: {triajeActual.historia_clinica || 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm bg-white/20 rounded-xl px-3 py-2">
            <Icon iconName="Calendar" className="text-lg" />
            <span>{triajeActual.fecha} - {triajeActual.hora}</span>
          </div>
        </div>
      </div>
      <div className="p-6">
        {cargandoTriaje ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="text-gray-600">Cargando datos de triaje...</p>
            </div>
          </div>
        ) : (
          <TriageForm
            consulta={triajeActual}
            initialData={triajeData}
            onGuardar={onGuardar}
            onCancelar={onCancelar}
            guardando={guardando}
          />
        )}
      </div>
    </div>
  );
}
