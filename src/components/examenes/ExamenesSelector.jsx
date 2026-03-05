import React, { useEffect, useState, useMemo, useRef } from "react";
import { BASE_URL } from "../../config/config";

// Forzar el uso de React para evitar warning de importación no usada
const _jsx = React.createElement;

export default function ExamenesSelector({ selected, setSelected }) {
  const [examenes, setExamenes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(BASE_URL + "api_examenes_laboratorio.php", { credentials: 'include' })
      .then(res => res.json())
      .then(data => setExamenes(data.examenes || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return examenes.filter(ex =>
      ex.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (ex.metodologia && ex.metodologia.toLowerCase().includes(search.toLowerCase()))
    );
  }, [examenes, search]);

  useEffect(() => {
    if (filtered.length > 0) {
      setHighlightedId(filtered[0].id);
    } else {
      setHighlightedId(null);
    }
  }, [filtered]);

  const handleCheck = (id) => {
    setSelected(sel =>
      sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    );
  };

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!highlightedId) return;
    handleCheck(highlightedId);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }, 0);
  };

  return (
    <div className="mb-2">
      <input
        ref={searchInputRef}
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={handleSearchKeyDown}
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
            <label
              key={ex.id}
              className={`flex items-center gap-2 px-2 py-1 border-b last:border-b-0 cursor-pointer hover:bg-blue-50 text-xs ${highlightedId === ex.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''}`}
            >
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
