import React from "react";
import CobroModuloFinal from "../cobro/CobroModuloFinal";

function ResumenConsultaAgendada({ consultaCreada, pacienteInfo, detallesConsulta, totalConsulta, manejarCobroCompleto, manejarCancelarCobro }) {
  if (!consultaCreada || !pacienteInfo) return null;
  return (
    <div className="w-full max-w-[1500px] mx-auto px-2 md:px-4 lg:px-6 py-2 md:py-4">
      <div className="bg-blue-50 p-4 md:p-5 rounded-xl mb-4 border border-blue-200 max-w-[980px]">
        <h3 className="font-semibold text-blue-800 mb-2">✅ Consulta Agendada Exitosamente</h3>
        <div className="text-sm text-blue-600">
          <p><strong>Médico:</strong> {consultaCreada.medico_nombre} ({consultaCreada.medico_especialidad})</p>
          <p><strong>Fecha:</strong> {consultaCreada.fecha} - <strong>Hora:</strong> {consultaCreada.hora}</p>
          <p><strong>Paciente:</strong> {pacienteInfo.nombre} {pacienteInfo.apellido}</p>
        </div>
      </div>
      <CobroModuloFinal
        paciente={pacienteInfo}
        servicio={{
          key: "consulta",
          label: `Consulta - ${consultaCreada.medico_nombre}`,
          medico_id: consultaCreada.medico_id,
          consulta_id: consultaCreada.id,
          tipo_consulta: consultaCreada.tipo_consulta,
          hora: consultaCreada.hora
        }}
        detalles={detallesConsulta.map(d => ({ ...d, hora: consultaCreada.hora }))}
        total={totalConsulta}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={manejarCancelarCobro}
      />
    </div>
  );
}

export default ResumenConsultaAgendada;
