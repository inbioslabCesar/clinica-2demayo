import React from "react";

export default function EgresosDiariosList({ egresos }) {
  if (!egresos.length) return <div className="text-gray-500 text-center py-4">No hay egresos registrados.</div>;
  // Diccionario para mostrar el label legible de la categoría
  const categoriaLabels = {
    pasaje: "Pasaje",
    servicio: "Servicio",
    compra: "Compra",
    otro: "Otro",
    planilla: "Planilla",
    servicio_admin: "Servicio administrativo",
    compra_admin: "Compra administrativa",
    otro_admin: "Otro administrativo",
    infraestructura: "Infraestructura",
    equipo: "Equipo",
    tecnologia: "Tecnología",
    otro_inversion: "Otro inversión"
  };

  return (
    <table className="min-w-full text-sm font-medium">
      <thead>
        <tr className="bg-gradient-to-r from-purple-100 to-purple-200 sticky top-0 z-10">
          <th className="py-3 px-4 text-left font-bold text-purple-800">Tipo</th>
          <th className="py-3 px-4 text-left font-bold text-purple-800">Categoría</th>
          <th className="py-3 px-4 text-left font-bold text-purple-800">Concepto</th>
          <th className="py-3 px-4 text-left font-bold text-purple-800">Monto (S/)</th>
          <th className="py-3 px-4 text-left font-bold text-purple-800">Responsable</th>
          <th className="py-3 px-4 text-left font-bold text-purple-800">Observaciones</th>
        </tr>
      </thead>
      <tbody>
        {egresos.map((e, idx) => (
          <tr key={e.id || idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50 border-b"}>
            <td className="py-2 px-4 whitespace-nowrap">{e.tipo.charAt(0).toUpperCase() + e.tipo.slice(1)}</td>
            <td className="py-2 px-4 whitespace-nowrap">{categoriaLabels[e.categoria] || e.categoria}</td>
            <td className="py-2 px-4 whitespace-nowrap">{e.concepto}</td>
            <td className="py-2 px-4 font-semibold text-purple-700 whitespace-nowrap">S/ {parseFloat(e.monto).toFixed(2)}</td>
            <td className="py-2 px-4 whitespace-nowrap">{e.responsable}</td>
            <td className="py-2 px-4 whitespace-nowrap">{e.observaciones}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
