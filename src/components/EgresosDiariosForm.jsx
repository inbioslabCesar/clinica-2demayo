import React, { useState } from "react";

export default function EgresosDiariosForm({ onAddEgreso }) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [tipo, setTipo] = useState("operativo");
  const [categoria, setCategoria] = useState("");

  // Categorías según tipo
  const categoriasPorTipo = {
    operativo: [
      { value: "pasaje", label: "Pasaje" },
      { value: "servicio", label: "Servicio" },
      { value: "compra", label: "Compra" },
      { value: "otro", label: "Otro" }
    ],
    administrativo: [
      { value: "planilla", label: "Planilla" },
      { value: "servicio_admin", label: "Servicio administrativo" },
      { value: "compra_admin", label: "Compra administrativa" },
      { value: "otro_admin", label: "Otro administrativo" }
    ],
    inversion: [
      { value: "infraestructura", label: "Infraestructura" },
      { value: "equipo", label: "Equipo" },
      { value: "tecnologia", label: "Tecnología" },
      { value: "otro_inversion", label: "Otro inversión" }
    ]
  };
  const [observaciones, setObservaciones] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!monto || !concepto || !tipo || !categoria) return;
    onAddEgreso({
      monto: parseFloat(monto),
      concepto,
      tipo,
      categoria,
      observaciones
    });
    setMonto("");
    setConcepto("");
    setCategoria("");
    setObservaciones("");
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold mb-1">Tipo de egreso</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="operativo">Operativo</option>
            <option value="administrativo">Administrativo</option>
            <option value="inversion">Inversión</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Categoría</label>
          <input
            type="text"
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Ejemplo: Pasaje, Servicio, Compra, etc."
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Descripción / Concepto</label>
        <input
          type="text"
          value={concepto}
          onChange={e => setConcepto(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Ejemplo: Pago de pasaje, compra de insumos, etc."
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold mb-1">Monto (S/)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Observaciones</label>
        <textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="Notas adicionales, detalles, etc."
        />
      </div>
      <button
        type="submit"
        className="w-full bg-red-500 text-white py-2 rounded font-semibold hover:bg-red-600"
      >
        Registrar Egreso
      </button>
    </form>
  );
}
