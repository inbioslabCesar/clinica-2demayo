import React from "react";

export default function TriajePaciente({ triaje }) {
  if (!triaje) return null;
  return (
    <>
      <h3 className="text-lg font-semibold mb-2">Triaje</h3>
      <div className="mb-2 flex flex-wrap gap-4">
        <div><b>P/A:</b> {triaje.presion_arterial || ""}</div>
        <div><b>FC:</b> {triaje.frecuencia_cardiaca || ""}</div>
        <div><b>FR:</b> {triaje.frecuencia_respiratoria || ""}</div>
        <div><b>T:</b> {triaje.temperatura || ""}</div>
        <div><b>SAT O2:</b> {triaje.saturacion || ""}</div>
        <div><b>Peso:</b> {triaje.peso || ""}</div>
        <div><b>Talla:</b> {triaje.talla || ""}</div>
      </div>
    </>
  );
}
