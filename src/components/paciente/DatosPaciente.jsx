import React from "react";

export default function DatosPaciente({ paciente }) {
  if (!paciente) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-4">
      <div><b>Nombre:</b> {paciente.nombre} {paciente.apellido}</div>
      <div><b>DNI:</b> {paciente.dni}</div>
      <div><b>Historia Clínica:</b> {paciente.historia_clinica}</div>
      <div><b>Edad:</b> {paciente.edad} {paciente.edad_unidad}</div>
      <div><b>Sexo:</b> {paciente.sexo}</div>
      <div><b>Dirección:</b> {paciente.direccion}</div>
      <div><b>Teléfono:</b> {paciente.telefono}</div>
      <div><b>Email:</b> {paciente.email}</div>
    </div>
  );
}
