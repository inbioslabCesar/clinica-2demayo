import React from "react";

const CATEGORIA_LABELS = {
  pasaje: "Pasaje",
  servicios: "Pago de servicios",
  sueldo: "Pago de sueldo",
  otros: "Otros",
};

export default function RegistrarEgresoForm({
  form,
  onChange,
  onSubmit,
  loading,
  editId,
  categoriaSugerida,
  isCategoriaManual,
  onUseCategoriaSugerida,
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input name="monto" type="number" required placeholder="Monto" value={form.monto} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 transition" />
      <input name="descripcion" required placeholder="Descripción" value={form.descripcion} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 placeholder-gray-400 transition" />
      <select name="categoria" value={form.categoria} onChange={onChange}
        className="w-full px-4 py-2 rounded border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-800 transition">
        <option value="">Categoría sugerida automática</option>
        <option value="pasaje">Pasaje</option>
        <option value="servicios">Pago de servicios</option>
        <option value="sueldo">Pago de sueldo</option>
        <option value="otros">Otros</option>
      </select>
      {!!categoriaSugerida && (
        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm text-gray-600">
          <span>
            Categoría sugerida: <strong>{CATEGORIA_LABELS[categoriaSugerida] || "Otros"}</strong>
            {isCategoriaManual ? " (manual activa)" : " (automática)"}
          </span>
          {isCategoriaManual && (
            <button
              type="button"
              onClick={onUseCategoriaSugerida}
              className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
            >
              Usar sugerida
            </button>
          )}
        </div>
      )}
      <div className="w-full px-4 py-2 rounded border border-blue-200 bg-blue-50 text-blue-800 text-sm">
        Tipo de egreso: <strong>{form.tipo_egreso === "otros" ? "Otros" : "Operativo"}</strong> (automático según categoría)
      </div>
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
