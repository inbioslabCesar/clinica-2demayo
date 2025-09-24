import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";

// Forzar el uso de React para evitar warning de importación no usada
const _jsx = React.createElement;

export default function ExamenesSelector({ selected, setSelected }) {
  const [examenes, setExamenes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(BASE_URL + "api_examenes_laboratorio.php", { credentials: 'include' })
      .then(res => res.json())
      .then(data => setExamenes(data.examenes || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = examenes.filter(ex =>
    ex.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (ex.metodologia && ex.metodologia.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCheck = (id) => {
    setSelected(sel =>
      sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    );
  };

  return (
    <div className="mb-2">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar examen..."
        className="border rounded p-2 text-xs w-full mb-2"
      />
      <div className="max-h-48 overflow-y-auto border rounded bg-white">
        {loading ? (
          <div className="p-2 text-center text-gray-500 text-xs">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-2 text-center text-gray-500 text-xs">Sin exámenes</div>
        ) : (
          filtered.map(ex => (
            <label key={ex.id} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0 cursor-pointer hover:bg-blue-50 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(ex.id)}
                onChange={() => handleCheck(ex.id)}
              />
              <span className="font-medium">{ex.nombre}</span>
              <span className="text-gray-400">{ex.metodologia}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
