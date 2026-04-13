import { useRef, useState } from "react";

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
  cursiva: false,
  alineacion: "left",
  color_texto: "#000000",
  color_fondo: "#ffffff",
  decimales: null,
  rows: null,
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
        let parsed = JSON.parse(data);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (Array.isArray(parsed)) items = parsed;
        else if (parsed && typeof parsed === 'object') items = [parsed];
      } else if (Array.isArray(data)) {
        items = data;
      } else if (data && typeof data === 'object') {
        items = [data];
      }
    } catch (e) {
      console.error('Error parsing valores_referenciales:', e);
      items = [];
    }
    // Ensure shape for each item
    return items.map((it, i) => ({
      tipo: it.tipo || 'Parámetro',
      nombre: typeof it.nombre === 'string' ? it.nombre : (it.titulo || ''),
      metodologia: it.metodologia || '',
      unidad: it.unidad || '',
      opciones: Array.isArray(it.opciones) ? it.opciones : [],
      referencias: Array.isArray(it.referencias)
        ? it.referencias.map((ref) => ({
          valor: ref?.valor || '',
          desc: ref?.desc || '',
          valor_min: ref?.valor_min || '',
          valor_max: ref?.valor_max || '',
          sexo: ref?.sexo || 'cualquiera',
          edad_min: ref?.edad_min || '',
          edad_max: ref?.edad_max || '',
        }))
        : [],
      formula: it.formula || '',
      negrita: !!it.negrita,
      cursiva: !!it.cursiva,
      alineacion: it.alineacion || 'left',
      color_texto: it.color_texto || '#000000',
      color_fondo: it.color_fondo || '#ffffff',
      decimales: (it.decimales !== undefined && it.decimales !== null && it.decimales !== '') ? Number(it.decimales) : null,
      rows: (it.rows !== undefined && it.rows !== null && it.rows !== '') ? Number(it.rows) : null,
      orden: typeof it.orden === 'number' ? it.orden : i + 1
    }));
  };

  const [items, setItems] = useState(() => normalize(initialData));
  const [highlightedRow, setHighlightedRow] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const rowRefs = useRef([]);

  const commitItems = (nextItems) => {
    const reindexed = nextItems.map((item, index) => ({
      ...item,
      orden: index + 1,
    }));
    setItems(reindexed);
    onChange && onChange(reindexed);
  };

  // Sincronizar items con initialData cuando cambie (por ejemplo, al editar otro examen)
  useEffect(() => {
    setItems(normalize(initialData));
  }, [initialData]);

  // Agregar nuevo parámetro o subtítulo
  const addItem = tipo => {
    commitItems([
      ...items,
      { ...defaultItem, tipo, nombre: "", orden: items.length + 1 }
    ]);
  };

  // Editar campo de un ítem
  const handleItemChange = (idx, field, value) => {
    const updated = items.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    commitItems(updated);
  };

  // Eliminar ítem
  const removeItem = idx => {
    const updated = items.filter((_, i) => i !== idx);
    commitItems(updated);
  };

  const moveItem = (idx, direction) => {
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= items.length) return;

    const updated = [...items];
    const temp = updated[idx];
    updated[idx] = updated[target];
    updated[target] = temp;
    commitItems(updated);
    setHighlightedRow(target);
  };

  const moveItemToIndex = (fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null) return;
    if (fromIndex < 0 || fromIndex >= items.length) return;
    if (toIndex < 0 || toIndex >= items.length) return;
    if (fromIndex === toIndex) return;

    const updated = [...items];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);
    commitItems(updated);
    setHighlightedRow(toIndex);
  };

  useEffect(() => {
    if (highlightedRow === null) return;
    const movedRow = rowRefs.current[highlightedRow];
    if (movedRow && typeof movedRow.scrollIntoView === "function") {
      movedRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const timeoutId = window.setTimeout(() => setHighlightedRow(null), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedRow]);

  const handleRowKeyDown = (idx, e) => {
    const hasMoveModifier = e.altKey || e.ctrlKey;
    if (!hasMoveModifier) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveItem(idx, "up");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveItem(idx, "down");
    }
  };

  const handleDragStart = (idx, event) => {
    setDraggedIndex(idx);
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(idx));
    }
  };

  const handleDragOver = (idx, event) => {
    event.preventDefault();
    setDragOverIndex(idx);
    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (idx, event) => {
    event.preventDefault();
    const sourceFromState = draggedIndex;
    const sourceFromTransfer = Number(event?.dataTransfer?.getData("text/plain"));
    const from = Number.isInteger(sourceFromState) ? sourceFromState : sourceFromTransfer;
    moveItemToIndex(from, idx);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Agregar referencia a un parámetro
  const addReferencia = idx => {
    const updated = items.map((item, i) =>
      i === idx ? { ...item, referencias: [...item.referencias, { valor: "", desc: "", valor_min: "", valor_max: "", sexo: "cualquiera", edad_min: "", edad_max: "" }] } : item
    );
    commitItems(updated);
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
    commitItems(updated);
  };

  // Eliminar referencia
  const removeReferencia = (itemIdx, refIdx) => {
    const updated = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const referencias = item.referencias.filter((_, j) => j !== refIdx);
      return { ...item, referencias };
    });
    commitItems(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-2">
        <button type="button" className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => addItem("Parámetro")}>+ Parámetro</button>
        <button type="button" className="bg-teal-600 text-white px-3 py-1 rounded" onClick={() => addItem("Campo")}>+ Campo</button>
        <button type="button" className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => addItem("Subtítulo")}>+ Subtítulo</button>
        <button type="button" className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={() => addItem("Título")}>+ Título</button>
        <button type="button" className="bg-orange-600 text-white px-3 py-1 rounded" onClick={() => addItem("Texto Largo")}>+ Texto Largo</button>
      </div>
      <p className="text-xs text-gray-500 -mt-1">Tip: use Alt/Ctrl + ↑ o Alt/Ctrl + ↓ para mover la fila seleccionada.</p>
      {items.map((item, idx) => (
        <div
          key={idx}
          ref={(el) => {
            rowRefs.current[idx] = el;
          }}
          className={`border rounded p-3 relative transition-colors ${highlightedRow === idx ? "bg-yellow-100 border-yellow-300" : "bg-gray-50"} ${dragOverIndex === idx ? "ring-2 ring-purple-300" : ""}`}
          onKeyDown={(e) => handleRowKeyDown(idx, e)}
          onDragOver={(e) => handleDragOver(idx, e)}
          onDrop={(e) => handleDrop(idx, e)}
          onDragEnd={handleDragEnd}
        >
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className="text-xs text-gray-600 font-semibold bg-white border border-gray-300 rounded px-2 py-1">
              #{idx + 1}
            </span>
            <button
              type="button"
              className="text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md px-2 py-1 transition-all cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragEnd={handleDragEnd}
              title="Arrastrar fila"
              aria-label="Arrastrar fila"
            >
              ⠿
            </button>
            <button
              type="button"
              className="text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md px-2 py-1 transition-all"
              onClick={() => moveItem(idx, "up")}
              disabled={idx === 0}
              title="Subir fila"
            >
              ↑
            </button>
            <button
              type="button"
              className="text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md px-2 py-1 transition-all"
              onClick={() => moveItem(idx, "down")}
              disabled={idx === items.length - 1}
              title="Bajar fila"
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            className="absolute top-2 right-2 text-red-600 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md px-2 py-1 transition-all flex items-center justify-center"
            style={{ minWidth: 56, fontSize: 13 }}
            onClick={() => removeItem(idx)}
          >
            Eliminar
          </button>
          <div className="flex flex-wrap gap-2 mb-2 items-center pt-10 sm:pt-0 sm:pl-36">
            <select value={item.tipo} onChange={e => handleItemChange(idx, "tipo", e.target.value)} className="border rounded px-2 py-1">
              <option value="Parámetro">Parámetro</option>
              <option value="Campo">Campo</option>
              <option value="Subtítulo">Subtítulo</option>
              <option value="Título">Título</option>
              <option value="Texto Largo">Texto Largo</option>
            </select>
            <input value={item.nombre} onChange={e => handleItemChange(idx, "nombre", e.target.value)} placeholder="Nombre" className="border rounded px-2 py-1 flex-1" />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={item.negrita} onChange={e => handleItemChange(idx, "negrita", e.target.checked)} /> Negrita
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={item.cursiva} onChange={e => handleItemChange(idx, "cursiva", e.target.checked)} /> Cursiva
            </label>
            <select
              value={item.alineacion || 'left'}
              onChange={e => handleItemChange(idx, "alineacion", e.target.value)}
              className="border rounded px-2 py-1"
              title="Alineación"
            >
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
            <input type="color" value={item.color_texto} onChange={e => handleItemChange(idx, "color_texto", e.target.value)} title="Color texto" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, border: 'none' }} />
            <input type="color" value={item.color_fondo} onChange={e => handleItemChange(idx, "color_fondo", e.target.value)} title="Color fondo" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, border: 'none', marginRight: 64 }} />
          </div>
          {item.tipo === "Parámetro" && (
            <>
              <div className="flex gap-2 mb-2">
                <input value={item.metodologia} onChange={e => handleItemChange(idx, "metodologia", e.target.value)} placeholder="Metodología" className="border rounded px-2 py-1 flex-1" />
                <input value={item.unidad} onChange={e => handleItemChange(idx, "unidad", e.target.value)} placeholder="Unidad" className="border rounded px-2 py-1 w-32" />
                <input value={item.formula} onChange={e => handleItemChange(idx, "formula", e.target.value)} placeholder="Fórmula (opcional)" className="border rounded px-2 py-1 flex-1" />
                <input
                  type="number"
                  value={item.decimales ?? ''}
                  onChange={e => handleItemChange(idx, "decimales", e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Dec"
                  className="border rounded px-2 py-1 w-20"
                  min="0"
                  max="6"
                  title="Decimales"
                />
              </div>
              <div>
                <b>Referencias:</b>
                <button type="button" className="ml-2 text-green-600" onClick={() => addReferencia(idx)}>+ Referencia</button>
                {item.referencias.map((ref, refIdx) => (
                  <div key={refIdx} className="grid grid-cols-1 md:grid-cols-10 gap-2 mt-2 items-center">
                    <input value={ref.valor} onChange={e => handleReferenciaChange(idx, refIdx, "valor", e.target.value)} placeholder="Valor" className="border rounded px-2 py-1 md:col-span-2" />
                    <input value={ref.valor_min} onChange={e => handleReferenciaChange(idx, refIdx, "valor_min", e.target.value)} placeholder="Min" className="border rounded px-2 py-1" />
                    <input value={ref.valor_max} onChange={e => handleReferenciaChange(idx, refIdx, "valor_max", e.target.value)} placeholder="Max" className="border rounded px-2 py-1" />
                    <input value={ref.desc} onChange={e => handleReferenciaChange(idx, refIdx, "desc", e.target.value)} placeholder="Descripción" className="border rounded px-2 py-1 md:col-span-2" />
                    <select
                      value={ref.sexo || 'cualquiera'}
                      onChange={e => handleReferenciaChange(idx, refIdx, "sexo", e.target.value)}
                      className="border rounded px-2 py-1"
                    >
                      <option value="cualquiera">Cualquiera</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                    </select>
                    <input value={ref.edad_min || ''} onChange={e => handleReferenciaChange(idx, refIdx, "edad_min", e.target.value)} placeholder="Edad min" className="border rounded px-2 py-1" />
                    <input value={ref.edad_max || ''} onChange={e => handleReferenciaChange(idx, refIdx, "edad_max", e.target.value)} placeholder="Edad max" className="border rounded px-2 py-1" />
                    <button
                      type="button"
                      className="text-red-600 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md px-2 py-1 transition-all flex items-center justify-center"
                      style={{ minWidth: 56, fontSize: 13 }}
                      onClick={() => removeReferencia(idx, refIdx)}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {item.tipo === "Campo" && (
            <div className="flex gap-2 mb-2 mt-2">
              <input value={item.metodologia} onChange={e => handleItemChange(idx, "metodologia", e.target.value)} placeholder="Metodología (opcional)" className="border rounded px-2 py-1 flex-1" />
              <input value={item.unidad} onChange={e => handleItemChange(idx, "unidad", e.target.value)} placeholder="Unidad (opcional)" className="border rounded px-2 py-1 w-40" />
            </div>
          )}

          {item.tipo === "Texto Largo" && (
            <div className="flex gap-2 mb-2 mt-2 items-center">
              <label className="text-sm text-gray-600">Filas:</label>
              <input
                type="number"
                value={item.rows ?? 4}
                onChange={e => handleItemChange(idx, "rows", e.target.value === '' ? null : Number(e.target.value))}
                className="border rounded px-2 py-1 w-24"
                min="2"
                max="12"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
