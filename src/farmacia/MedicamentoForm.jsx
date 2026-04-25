
import { useState } from "react";
import Swal from "sweetalert2";

export default function MedicamentoForm({ initialData, onSave, onCancel }) {
  const CRITICAL_EXPIRY_DAYS = 90;

  function diasHasta(fecha) {
    if (!fecha) return null;
    const hoy = new Date();
    const venc = new Date(fecha);
    return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
  }

  function splitStock(totalStock, unidadesPorCaja) {
    const total = Math.max(0, Number(totalStock) || 0);
    const porCaja = Math.max(1, Number(unidadesPorCaja) || 1);
    return {
      cajas: Math.floor(total / porCaja),
      unidades: total % porCaja,
    };
  }

  function joinStock(cajas, unidades, unidadesPorCaja) {
    const c = Math.max(0, Number(cajas) || 0);
    const u = Math.max(0, Number(unidades) || 0);
    const porCaja = Math.max(1, Number(unidadesPorCaja) || 1);
    return c * porCaja + u;
  }

  function formatStockEquivalencia(totalStock, unidadesPorCaja) {
    const normalizado = splitStock(totalStock, unidadesPorCaja);
    return `${normalizado.cajas} cajas + ${normalizado.unidades} unidades sueltas`;
  }

  function generarCodigoAutomatico() {
    // Genera un código tipo MED + 5 dígitos aleatorios
    return "MED" + Math.floor(10000 + Math.random() * 90000);
  }

  const [form, setForm] = useState({
    codigo: initialData?.codigo || (!initialData ? generarCodigoAutomatico() : ""),
    nombre: initialData?.nombre || "",
    presentacion: initialData?.presentacion || "",
    concentracion: initialData?.concentracion || "",
    laboratorio: initialData?.laboratorio || "",
    stock: initialData?.stock ?? 0,
    unidades_por_caja: initialData?.unidades_por_caja ?? 30,
    fecha_vencimiento: initialData?.fecha_vencimiento || "",
    estado: initialData?.estado || "activo",
    precio_compra: initialData?.precio_compra !== undefined && initialData?.precio_compra !== null ? String(initialData.precio_compra) : "",
    margen_ganancia: initialData?.margen_ganancia !== undefined && initialData?.margen_ganancia !== null ? String(initialData.margen_ganancia) : "30",
    id: initialData?.id || undefined,
  });
  const stockInicial = splitStock(form.stock, form.unidades_por_caja);
  const [stockCajas, setStockCajas] = useState(stockInicial.cajas);
  const [stockUnidades, setStockUnidades] = useState(stockInicial.unidades);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      if (name === "unidades_por_caja") {
        const unidadesCaja = Math.max(1, Number(value) || 1);
        const totalActual = joinStock(stockCajas, stockUnidades, f.unidades_por_caja);
        const normalizado = splitStock(totalActual, unidadesCaja);
        setStockCajas(normalizado.cajas);
        setStockUnidades(normalizado.unidades);
        return {
          ...f,
          unidades_por_caja: unidadesCaja,
          stock: totalActual,
        };
      }
      if (name === "stock") return { ...f, [name]: Number(value) };
      return { ...f, [name]: value };
    });
  };

  const handleStockCajasChange = (value) => {
    const cajas = Math.max(0, Number(value) || 0);
    setStockCajas(cajas);
    setForm((f) => ({
      ...f,
      stock: joinStock(cajas, stockUnidades, f.unidades_por_caja),
    }));
  };

  const handleStockUnidadesChange = (value) => {
    const unidadesIngresadas = Math.max(0, Number(value) || 0);
    const totalNormalizado = joinStock(stockCajas, unidadesIngresadas, form.unidades_por_caja);
    const normalizado = splitStock(totalNormalizado, form.unidades_por_caja);
    setStockCajas(normalizado.cajas);
    setStockUnidades(normalizado.unidades);
    setForm((f) => ({
      ...f,
      stock: totalNormalizado,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validación básica
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError("El código y el nombre son obligatorios");
      return;
    }
    if (!form.fecha_vencimiento) {
      setError("La fecha de vencimiento es obligatoria");
      return;
    }
    if (!form.unidades_por_caja || form.unidades_por_caja < 1) {
      setError("Las unidades por caja deben ser mayor a 0");
      return;
    }
    if (stockUnidades >= Number(form.unidades_por_caja || 1)) {
      setError("Las unidades sueltas deben ser menores a las unidades por caja.");
      return;
    }

    const diasVencimiento = diasHasta(form.fecha_vencimiento);
    if (typeof diasVencimiento === "number" && diasVencimiento < CRITICAL_EXPIRY_DAYS) {
      const confirm = await Swal.fire({
        icon: diasVencimiento < 0 ? "error" : "warning",
        title: diasVencimiento < 0 ? "Fecha vencida" : "Vencimiento próximo",
        text:
          diasVencimiento < 0
            ? "La fecha de vencimiento ya pasó. ¿Deseas guardar de todas formas?"
            : `El medicamento vence en ${diasVencimiento} días. ¿Deseas guardar de todas formas?`,
        showCancelButton: true,
        confirmButtonText: "Sí, guardar",
        cancelButtonText: "Cancelar",
      });
      if (!confirm.isConfirmed) return;
    }

    setError("");
    // Convertir a numero antes de guardar
    const formToSave = {
      ...form,
      stock: joinStock(stockCajas, stockUnidades, form.unidades_por_caja),
      precio_compra: parseFloat(form.precio_compra) || 0,
      margen_ganancia: parseFloat(form.margen_ganancia) || 0,
      unidades_por_caja: parseInt(form.unidades_por_caja) || 1,
    };
    if (onSave) {
      const result = await onSave(formToSave);
      if (result && result.error && result.error.toLowerCase().includes("código ya existe")) {
        Swal.fire({
          icon: "error",
          title: "Código duplicado",
          text: result.error,
          confirmButtonColor: "#e53e3e"
        });
      }
    }
  };

  return (
  <div className="flex justify-center items-start w-full">
    <form onSubmit={handleSubmit} className="p-4 sm:p-8 md:p-10 bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-auto max-h-[calc(100vh-2.5rem)] overflow-y-auto">
      <h2 className="text-lg font-bold mb-4 text-center">{initialData ? "Editar Medicamento" : "Nuevo Medicamento"}</h2>
      {error && <div className="text-red-500 text-center mb-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block font-medium">Código *</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={30} required />
        </div>
        <div>
          <label className="block font-medium">Nombre *</label>
          <input
            name="nombre"
            value={form.nombre}
            onChange={handleChange}
            className="w-full border rounded px-2 py-1"
            maxLength={100}
            required
          />
        </div>
        <div>
          <label className="block font-medium">Presentación</label>
          <input name="presentacion" value={form.presentacion} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={50} />
        </div>
        <div>
          <label className="block font-medium">Concentración</label>
          <input name="concentracion" value={form.concentracion} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={50} />
        </div>
        <div>
          <label className="block font-medium">Laboratorio</label>
          <input name="laboratorio" value={form.laboratorio} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={100} />
        </div>
        <div>
          <label className="block font-medium">Stock en cajas</label>
          <input
            name="stock_cajas"
            type="number"
            min={0}
            value={stockCajas}
            onChange={(e) => handleStockCajasChange(e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
          <span className="text-xs text-gray-500">Ingresa solo cajas cerradas.</span>
        </div>
        <div>
          <label className="block font-medium">Stock en unidades sueltas</label>
          <input
            name="stock_unidades"
            type="number"
            min={0}
            value={stockUnidades}
            onChange={(e) => handleStockUnidadesChange(e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
          <span className="text-xs text-gray-500">
            Si supera las unidades por caja, se convierte automaticamente en cajas.
          </span>
          <div className="text-xs mt-1 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 inline-block">
            Equivale a: {formatStockEquivalencia(joinStock(stockCajas, stockUnidades, form.unidades_por_caja), form.unidades_por_caja)}
          </div>
        </div>
        <div>
          <label className="block font-medium">Unidades por caja *</label>
          <input name="unidades_por_caja" type="number" min={1} value={form.unidades_por_caja !== undefined && form.unidades_por_caja !== null ? form.unidades_por_caja : ''} onChange={handleChange} className="w-full border rounded px-2 py-1" required />
          <span className="text-xs text-gray-500">Ayuda: 1 caja = {Number(form.unidades_por_caja || 1)} unidades.</span>
          <div className="text-xs mt-1 text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 inline-block">
            Stock total calculado: {joinStock(stockCajas, stockUnidades, form.unidades_por_caja)} unidades
          </div>
        </div>
        <div>
          <label className="block font-medium">Fecha de vencimiento *</label>
          <input
            name="fecha_vencimiento"
            type="date"
            value={form.fecha_vencimiento}
            onChange={handleChange}
            className={`w-full border rounded px-2 py-1 ${
              typeof diasHasta(form.fecha_vencimiento) === "number" && diasHasta(form.fecha_vencimiento) < CRITICAL_EXPIRY_DAYS
                ? "border-red-500 bg-red-50 text-red-700"
                : ""
            }`}
            required
          />
          {typeof diasHasta(form.fecha_vencimiento) === "number" && diasHasta(form.fecha_vencimiento) < CRITICAL_EXPIRY_DAYS && (
            <span className="text-xs text-red-600 font-medium">
              Advertencia: vencimiento próximo o pasado. Verifica antes de guardar.
            </span>
          )}
        </div>
        <div>
          <label className="block font-medium">Estado</label>
          <select name="estado" value={form.estado} onChange={handleChange} className="w-full border rounded px-2 py-1">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        <div>
          <label className="block font-medium">Precio de compra (S/)</label>
          <input name="precio_compra" type="number" min={0} step="0.01" value={form.precio_compra !== undefined && form.precio_compra !== null ? String(form.precio_compra) : ''} onChange={handleChange} className="w-full border rounded px-2 py-1" required />
        </div>
        <div>
          <label className="block font-medium">Margen de ganancia (%)</label>
          <input name="margen_ganancia" type="number" min={0} step="0.1" value={form.margen_ganancia !== undefined && form.margen_ganancia !== null ? String(form.margen_ganancia) : ''} onChange={handleChange} className="w-full border rounded px-2 py-1" required />
        </div>
        <div>
          <label className="block font-medium">Precio de venta sugerido (S/)</label>
          <input value={Number(form.precio_compra) + (Number(form.precio_compra) * Number(form.margen_ganancia) / 100)} readOnly className="w-full border rounded px-2 py-1 bg-gray-100 text-gray-700" />
        </div>
      </div>
      <div className="flex justify-center mt-6 gap-2">
        <button type="button" onClick={onCancel} className="bg-gray-400 text-white px-4 py-2 rounded">Cancelar</button>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Guardar</button>
      </div>
    </form>
    </div>
  );
}
