import React from "react";

export default function RegistrarEgresoForm({ form, onChange, onSubmit, loading, editId }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input name="monto" type="number" required placeholder="Monto" value={form.monto} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 transition" />
      <input name="descripcion" required placeholder="Descripción" value={form.descripcion} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 transition" />
      <select name="categoria" required value={form.categoria} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition">
        <option value="">Categoría</option>
        <option value="pasaje">Pasaje</option>
        <option value="servicios">Pago de servicios</option>
        <option value="sueldo">Pago de sueldo</option>
        <option value="otros">Otros</option>
      </select>
      <select name="tipo_egreso" required value={form.tipo_egreso} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition">
        <option value="">Tipo de Egreso</option>
        <option value="operativo">Operativo</option>
        <option value="otros">Otros</option>
      </select>
      <select name="turno" required value={form.turno} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition">
        <option value="">Turno</option>
        <option value="mañana">Mañana</option>
        <option value="tarde">Tarde</option>
        <option value="noche">Noche</option>
      </select>
      <select name="metodo_pago" required value={form.metodo_pago} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="tarjeta">Tarjeta</option>
        <option value="yape">Yape</option>
        <option value="plin">Plin</option>
      </select>
      <input name="fecha" type="date" required value={form.fecha} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition" />
      <input name="hora" type="time" required value={form.hora} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition" />
      <textarea name="observaciones" placeholder="Observaciones" value={form.observaciones} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 min-h-[80px] transition" />
      <button type="submit"
        className="w-full py-2 rounded bg-gradient-to-r from-blue-600 to-blue-400 text-white font-bold shadow hover:from-blue-700 hover:to-blue-500 transition disabled:opacity-60"
        disabled={loading}
      >
        {editId ? "Actualizar" : "Registrar"}
      </button>
    </form>
  );
}
