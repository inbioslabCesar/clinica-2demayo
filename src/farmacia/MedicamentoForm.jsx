import React, { useState } from "react";
import Swal from "sweetalert2";

export default function MedicamentoForm({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState({
    codigo: initialData?.codigo || "",
    nombre: initialData?.nombre || "",
    presentacion: initialData?.presentacion || "",
    concentracion: initialData?.concentracion || "",
    laboratorio: initialData?.laboratorio || "",
    stock: initialData?.stock ?? 0,
    fecha_vencimiento: initialData?.fecha_vencimiento || "",
    estado: initialData?.estado || "activo",
    precio_compra: initialData?.precio_compra !== undefined && initialData?.precio_compra !== null ? String(initialData.precio_compra) : "",
    margen_ganancia: initialData?.margen_ganancia !== undefined && initialData?.margen_ganancia !== null ? String(initialData.margen_ganancia) : "30",
    id: initialData?.id || undefined,
  });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      if (name === "stock") return { ...f, [name]: Number(value) };
      return { ...f, [name]: value };
    });
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
    setError("");
    // Convertir a número antes de guardar
    const formToSave = {
      ...form,
      precio_compra: parseFloat(form.precio_compra) || 0,
      margen_ganancia: parseFloat(form.margen_ganancia) || 0,
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
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow max-w-lg mx-auto">
      <h2 className="text-lg font-bold mb-4 text-center">{initialData ? "Editar Medicamento" : "Nuevo Medicamento"}</h2>
      {error && <div className="text-red-500 text-center mb-2">{error}</div>}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block font-medium">Código *</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={30} required />
        </div>
        <div>
          <label className="block font-medium">Nombre *</label>
          <input name="nombre" value={form.nombre} onChange={handleChange} className="w-full border rounded px-2 py-1" maxLength={100} required />
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
          <label className="block font-medium">Stock</label>
          <input name="stock" type="number" min={0} value={form.stock} onChange={handleChange} className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block font-medium">Fecha de vencimiento *</label>
          <input name="fecha_vencimiento" type="date" value={form.fecha_vencimiento} onChange={handleChange} className="w-full border rounded px-2 py-1" required />
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
          <input name="margen_ganancia" type="number" min={0} max={100} step="0.1" value={form.margen_ganancia !== undefined && form.margen_ganancia !== null ? String(form.margen_ganancia) : ''} onChange={handleChange} className="w-full border rounded px-2 py-1" required />
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
  );
}
