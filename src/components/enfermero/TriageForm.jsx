import React, { useState, useEffect } from "react";

function TriageForm({ consulta, initialData, onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    presion_arterial: "",
    frecuencia_cardiaca: "",
    frecuencia_respiratoria: "",
    temperatura: "",
    saturacion: "",
    peso: "",
    talla: "",
    motivo: "",
    sintomas: "",
    nivel_conciencia: "Alerta",
    hidratacion: "Normal",
    coloracion: "Normal",
    clasificacion: "No urgente",
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        presion_arterial: initialData.presion_arterial || "",
        frecuencia_cardiaca: initialData.frecuencia_cardiaca || "",
        frecuencia_respiratoria: initialData.frecuencia_respiratoria || "",
        temperatura: initialData.temperatura || "",
        saturacion: initialData.saturacion || "",
        peso: initialData.peso || "",
        talla: initialData.talla || "",
        motivo: initialData.motivo || "",
        sintomas: initialData.sintomas || "",
        nivel_conciencia: initialData.nivel_conciencia || "Alerta",
        hidratacion: initialData.hidratacion || "Normal",
        coloracion: initialData.coloracion || "Normal",
        clasificacion: initialData.clasificacion || "No urgente",
      });
    }
  }, [initialData]);
  const [guardando, setGuardando] = useState(false);
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    setGuardando(true);
    // Siempre enviar clasificacion, por defecto "No urgente" si está vacío o nulo
    const datos = {
      ...form,
      clasificacion: form.clasificacion && form.clasificacion.trim() ? form.clasificacion : "No urgente"
    };
    onGuardar(datos);
    setGuardando(false);
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-2">
      <div className="grid grid-cols-2 gap-2">
        <input name="presion_arterial" value={form.presion_arterial} onChange={handleChange} placeholder="Presión arterial (mmHg)" className="border rounded px-2 py-1" />
        <input name="frecuencia_cardiaca" value={form.frecuencia_cardiaca} onChange={handleChange} placeholder="Frecuencia cardíaca (lpm)" className="border rounded px-2 py-1" />
        <input name="frecuencia_respiratoria" value={form.frecuencia_respiratoria} onChange={handleChange} placeholder="Frecuencia respiratoria (rpm)" className="border rounded px-2 py-1" />
        <input name="temperatura" value={form.temperatura} onChange={handleChange} placeholder="Temperatura (°C)" className="border rounded px-2 py-1" />
        <input name="saturacion" value={form.saturacion} onChange={handleChange} placeholder="Saturación O₂ (%)" className="border rounded px-2 py-1" />
        <input name="peso" value={form.peso} onChange={handleChange} placeholder="Peso (kg)" className="border rounded px-2 py-1" />
        <input name="talla" value={form.talla} onChange={handleChange} placeholder="Talla (cm)" className="border rounded px-2 py-1" />
      </div>
      <textarea name="motivo" value={form.motivo} onChange={handleChange} placeholder="Motivo de consulta" className="border rounded px-2 py-1 w-full" />
      <textarea name="sintomas" value={form.sintomas} onChange={handleChange} placeholder="Síntomas principales" className="border rounded px-2 py-1 w-full" />
      <div className="grid grid-cols-3 gap-2">
        <select name="nivel_conciencia" value={form.nivel_conciencia} onChange={handleChange} className="border rounded px-2 py-1">
          <option value="Alerta">Alerta</option>
          <option value="Somnoliento">Somnoliento</option>
          <option value="Inconsciente">Inconsciente</option>
        </select>
        <select name="hidratacion" value={form.hidratacion} onChange={handleChange} className="border rounded px-2 py-1">
          <option value="Normal">Hidratación normal</option>
          <option value="Deshidratado">Deshidratado</option>
        </select>
        <select name="coloracion" value={form.coloracion} onChange={handleChange} className="border rounded px-2 py-1">
          <option value="Normal">Coloración normal</option>
          <option value="Cianosis">Cianosis</option>
          <option value="Palidez">Palidez</option>
          <option value="Ictericia">Ictericia</option>
        </select>
      </div>
      <select name="clasificacion" value={form.clasificacion} onChange={handleChange} className="border rounded px-2 py-1 w-full">
        <option value="No urgente">No urgente</option>
        <option value="Urgente">Urgente</option>
        <option value="Emergencia">Emergencia</option>
      </select>
      <div className="flex gap-2 justify-end mt-2">
        <button type="button" onClick={onCancelar} className="bg-gray-300 px-3 py-1 rounded">Cancelar</button>
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded" disabled={guardando}>Guardar triaje</button>
      </div>
    </form>
  );
}

export default TriageForm;
