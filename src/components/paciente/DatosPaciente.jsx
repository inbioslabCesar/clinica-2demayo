import React from "react";

export default function DatosPaciente({ paciente }) {
  if (!paciente) return null;
  const acompanantes = Array.isArray(paciente.acompanantes) ? paciente.acompanantes.slice(0, 2) : [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-4">
      <div><b>Nombre:</b> {paciente.nombre} {paciente.apellido}</div>
      <div><b>DNI:</b> {paciente.dni}</div>
      <div><b>Historia Clínica:</b> {paciente.historia_clinica}</div>
      <div><b>Edad:</b> {paciente.edad} {paciente.edad_unidad}</div>
      <div><b>Sexo:</b> {paciente.sexo}</div>
      <div><b>Grupo Sanguíneo:</b> {paciente.grupo_sanguineo || 'No especificado'}</div>
      <div><b>Factor RH:</b> {paciente.factor_rh || 'No especificado'}</div>
      <div><b>Dirección:</b> {paciente.direccion}</div>
      <div><b>Teléfono:</b> {paciente.telefono}</div>
      <div><b>Email:</b> {paciente.email}</div>
      <div className="sm:col-span-2">
        <b>Acompañantes:</b>{' '}
        {acompanantes.length === 0
          ? 'No registrados'
          : acompanantes.map((a) => `${a.nombre_completo} (${a.parentesco}${a.telefono ? ` - ${a.telefono}` : ''})`).join(' | ')}
      </div>
    </div>
  );
}
