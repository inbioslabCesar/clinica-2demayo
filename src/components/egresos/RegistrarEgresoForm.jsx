import React from "react";

const CATEGORIA_LABELS = {
  pasaje: "Pasaje",
  servicios: "Pago de servicios",
  sueldo: "Pago de sueldo",
  otros: "Otros",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100";

const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-slate-600";

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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className={labelClass}>
        Descripción
        <input
          name="descripcion"
          required
          placeholder="¿En qué se gastó?"
          value={form.descripcion}
          onChange={onChange}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Monto
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
              S/
            </span>
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              value={form.monto}
              onChange={onChange}
              onWheel={(e) => e.currentTarget.blur()}
              className={`${inputClass} pl-9`}
            />
          </div>
        </label>
        <label className={labelClass}>
          Fecha
          <input name="fecha" type="date" required value={form.fecha} onChange={onChange} className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Hora
          <input name="hora" type="time" required value={form.hora} onChange={onChange} className={inputClass} />
        </label>
        <label className={labelClass}>
          Turno
          <select name="turno" required value={form.turno} onChange={onChange} className={inputClass}>
            <option value="">Selecciona</option>
            <option value="mañana">Mañana</option>
            <option value="tarde">Tarde</option>
            <option value="noche">Noche</option>
          </select>
        </label>
      </div>

      <label className={labelClass}>
        Método de pago
        <select name="metodo_pago" required value={form.metodo_pago} onChange={onChange} className={inputClass}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
        </select>
      </label>

      <label className={labelClass}>
        Categoría
        <select name="categoria" value={form.categoria} onChange={onChange} className={inputClass}>
          <option value="">Categoría sugerida automática</option>
          <option value="pasaje">Pasaje</option>
          <option value="servicios">Pago de servicios</option>
          <option value="sueldo">Pago de sueldo</option>
          <option value="otros">Otros</option>
        </select>
      </label>

      {!!categoriaSugerida && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3.5 py-2.5 text-xs text-cyan-800">
          <span>
            Sugerida: <strong>{CATEGORIA_LABELS[categoriaSugerida] || "Otros"}</strong>
            {isCategoriaManual ? " · manual activa" : " · automática"}
          </span>
          {isCategoriaManual && (
            <button
              type="button"
              onClick={onUseCategoriaSugerida}
              className="shrink-0 rounded-full bg-cyan-600 px-3 py-1 font-semibold text-white transition hover:bg-cyan-700"
            >
              Usar sugerida
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-sm text-blue-800">
        <span className="text-base">🏷️</span>
        <span>
          Tipo de egreso: <strong>{form.tipo_egreso === "otros" ? "Otros" : "Operativo"}</strong>
        </span>
        <span className="ml-auto shrink-0 text-[11px] font-medium text-blue-500">automático</span>
      </div>

      <label className={labelClass}>
        Observaciones
        <textarea
          name="observaciones"
          placeholder="Opcional"
          value={form.observaciones}
          onChange={onChange}
          className={`${inputClass} min-h-[80px] resize-none`}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Guardando...
          </>
        ) : editId ? (
          <>💾 Actualizar egreso</>
        ) : (
          <>➕ Registrar egreso</>
        )}
      </button>
    </form>
  );
}
