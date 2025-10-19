import { useState } from "react";

// Estructura inicial de un parámetro o subtítulo
const defaultItem = {
  tipo: "Parámetro", // o "Subtítulo"
  nombre: "",
  metodologia: "",
  unidad: "",
  opciones: [],
  referencias: [],
  formula: "",
  negrita: false,
  color_texto: "#000000",
  color_fondo: "#ffffff",
  orden: 1
};

import { useEffect } from "react";

export default function ExamenEditorForm({ initialData = [], onChange }) {
  // Normalizar initialData: aceptar string JSON o array
  const normalize = (data) => {
    let items = [];
    try {
      if (!data) return [];
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) items = parsed;
      } else if (Array.isArray(data)) {
        items = data;
      }
    } catch (e) {
      console.error('Error parsing valores_referenciales:', e);
      items = [];
    }
    // Ensure shape for each item
    return items.map((it, i) => ({
      tipo: it.tipo || 'Parámetro',
      nombre: it.nombre || (it.titulo || '') || `Item ${i + 1}`,
      metodologia: it.metodologia || '',
      unidad: it.unidad || '',
      opciones: Array.isArray(it.opciones) ? it.opciones : [],
      referencias: Array.isArray(it.referencias) ? it.referencias : [],
      formula: it.formula || '',
      negrita: !!it.negrita,
      color_texto: it.color_texto || '#000000',
      color_fondo: it.color_fondo || '#ffffff',
      orden: typeof it.orden === 'number' ? it.orden : i + 1
    }));
  };

  const [items, setItems] = useState(() => normalize(initialData));

  // Sincronizar items con initialData cuando cambie (por ejemplo, al editar otro examen)
  useEffect(() => {
    setItems(normalize(initialData));
  }, [initialData]);

  // Agregar nuevo parámetro o subtítulo
  const addItem = tipo => {
    setItems([
      ...items,
      { ...defaultItem, tipo, nombre: tipo === "Parámetro" ? "Nuevo parámetro" : "Nuevo subtítulo", orden: items.length + 1 }
    ]);
  };

  // Editar campo de un ítem
  const handleItemChange = (idx, field, value) => {
    const updated = items.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    setItems(updated);
    onChange && onChange(updated);
  };

  // Eliminar ítem
  const removeItem = idx => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    onChange && onChange(updated);
  };

  // Agregar referencia a un parámetro
  const addReferencia = idx => {
    const updated = items.map((item, i) =>
      i === idx ? { ...item, referencias: [...item.referencias, { valor: "", desc: "", valor_min: "", valor_max: "" }] } : item
    );
    setItems(updated);
    onChange && onChange(updated);
  };

  // Editar referencia
  const handleReferenciaChange = (itemIdx, refIdx, field, value) => {
    const updated = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const referencias = item.referencias.map((ref, j) =>
        j === refIdx ? { ...ref, [field]: value } : ref
      );
      return { ...item, referencias };
    });
    setItems(updated);
    onChange && onChange(updated);
  };

  // Eliminar referencia
  const removeReferencia = (itemIdx, refIdx) => {
    const updated = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const referencias = item.referencias.filter((_, j) => j !== refIdx);
      return { ...item, referencias };
    });
    setItems(updated);
    onChange && onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-2">
        <button type="button" className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => addItem("Parámetro")}>+ Parámetro</button>
        <button type="button" className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => addItem("Subtítulo")}>+ Subtítulo</button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="border rounded p-3 bg-gray-50 relative">
          <button
            type="button"
            className="absolute top-2 right-2 text-red-600 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md px-2 py-1 transition-all flex items-center justify-center"
            style={{ minWidth: 56, fontSize: 13 }}
            onClick={() => removeItem(idx)}
          >
            Eliminar
          </button>
          <div className="flex flex-wrap gap-2 mb-2 items-center">
            <select value={item.tipo} onChange={e => handleItemChange(idx, "tipo", e.target.value)} className="border rounded px-2 py-1">
              <option value="Parámetro">Parámetro</option>
              <option value="Subtítulo">Subtítulo</option>
            </select>
            <input value={item.nombre} onChange={e => handleItemChange(idx, "nombre", e.target.value)} placeholder="Nombre" className="border rounded px-2 py-1 flex-1" />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={item.negrita} onChange={e => handleItemChange(idx, "negrita", e.target.checked)} /> Negrita
            </label>
            <input type="color" value={item.color_texto} onChange={e => handleItemChange(idx, "color_texto", e.target.value)} title="Color texto" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, border: 'none' }} />
            <input type="color" value={item.color_fondo} onChange={e => handleItemChange(idx, "color_fondo", e.target.value)} title="Color fondo" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, border: 'none', marginRight: 64 }} />
          </div>
          {item.tipo === "Parámetro" && (
            <>
              <div className="flex gap-2 mb-2">
                <input value={item.metodologia} onChange={e => handleItemChange(idx, "metodologia", e.target.value)} placeholder="Metodología" className="border rounded px-2 py-1 flex-1" />
                <input value={item.unidad} onChange={e => handleItemChange(idx, "unidad", e.target.value)} placeholder="Unidad" className="border rounded px-2 py-1 w-32" />
                <input value={item.formula} onChange={e => handleItemChange(idx, "formula", e.target.value)} placeholder="Fórmula (opcional)" className="border rounded px-2 py-1 flex-1" />
              </div>
              <div>
                <b>Referencias:</b>
                <button type="button" className="ml-2 text-green-600" onClick={() => addReferencia(idx)}>+ Referencia</button>
                {item.referencias.map((ref, refIdx) => (
                  <div key={refIdx} className="flex gap-2 mt-1 items-center flex-wrap relative">
                    <input value={ref.valor} onChange={e => handleReferenciaChange(idx, refIdx, "valor", e.target.value)} placeholder="Valor texto" className="border rounded px-2 py-1 w-28" />
                    <input value={ref.valor_min} onChange={e => handleReferenciaChange(idx, refIdx, "valor_min", e.target.value)} placeholder="Min" className="border rounded px-2 py-1 w-16" />
                    <input value={ref.valor_max} onChange={e => handleReferenciaChange(idx, refIdx, "valor_max", e.target.value)} placeholder="Max" className="border rounded px-2 py-1 w-16" />
                    <input value={ref.desc} onChange={e => handleReferenciaChange(idx, refIdx, "desc", e.target.value)} placeholder="Descripción" className="border rounded px-2 py-1 flex-1" />
                    <button
                      type="button"
                      className="text-red-600 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md px-2 py-1 ml-6 transition-all flex items-center justify-center"
                      style={{ minWidth: 56, fontSize: 13, alignSelf: 'center' }}
                      onClick={() => removeReferencia(idx, refIdx)}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
