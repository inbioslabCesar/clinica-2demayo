import React from "react";

function PacienteListResumen({ paciente }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
      <div className="font-bold text-blue-800 mb-2">Paciente encontrado:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Columna 1: Datos personales */}
        <div>
          <div><span className="font-semibold">Nombre:</span> {paciente.nombre}</div>
          <div><span className="font-semibold">Apellido:</span> {paciente.apellido}</div>
          <div><span className="font-semibold">DNI:</span> {paciente.dni}</div>
          {paciente.fecha_nacimiento && (
            <div><span className="font-semibold">Fecha de nacimiento:</span> {paciente.fecha_nacimiento}</div>
          )}
          {paciente.sexo && (
            <div><span className="font-semibold">Sexo:</span> {paciente.sexo}</div>
          )}
          {paciente.direccion && (
            <div><span className="font-semibold">Dirección:</span> {paciente.direccion}</div>
          )}
          {paciente.telefono && (
            <div><span className="font-semibold">Teléfono:</span> {paciente.telefono}</div>
          )}
          {paciente.email && (
            <div><span className="font-semibold">Email:</span> {paciente.email}</div>
          )}
          {paciente.tipo_seguro && (
            <div><span className="font-semibold">Tipo de seguro:</span> {paciente.tipo_seguro}</div>
          )}
        </div>
        {/* Columna 2: Datos clínicos */}
        <div>
          <div><span className="font-semibold">Historia Clínica:</span> {paciente.historia_clinica}</div>
          {paciente.edad && (
            <div><span className="font-semibold">Edad:</span> {paciente.edad} {paciente.edad_unidad || ''}</div>
          )}
          {paciente.procedencia && (
            <div><span className="font-semibold">Procedencia:</span> {paciente.procedencia}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PacienteListResumen;
