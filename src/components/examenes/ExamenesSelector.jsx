import React, { useEffect, useState, useMemo, useRef } from "react";
import { BASE_URL } from "../../config/config";

// Forzar el uso de React para evitar warning de importación no usada
const _jsx = React.createElement;

function toSafeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) {
    return value.map((item) => toSafeText(item, "")).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return fallback;
  }
  return String(value).trim() || fallback;
}

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
    const query = search.toLowerCase();
    return examenes.filter(ex =>
      toSafeText(ex?.nombre).toLowerCase().includes(query) ||
      toSafeText(ex?.metodologia).toLowerCase().includes(query)
    );
  }, [examenes, search]);

  const selectedIds = useMemo(() => new Set((selected || []).map((id) => String(id))), [selected]);

  useEffect(() => {
    if (filtered.length > 0) {
      setHighlightedId(filtered[0].id);
    } else {
      setHighlightedId(null);
    }
  }, [filtered]);

  const handleCheck = (id) => {
    const normalizedId = String(id);
    setSelected(sel =>
      sel.map((item) => String(item)).includes(normalizedId)
        ? sel.filter((item) => String(item) !== normalizedId)
        : [...sel, id]
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
              key={String(ex?.id ?? `${toSafeText(ex?.nombre, 'sin-nombre')}-${toSafeText(ex?.metodologia)}`)}
              className={`flex items-center gap-2 px-2 py-1 border-b last:border-b-0 cursor-pointer hover:bg-blue-50 text-xs ${String(highlightedId) === String(ex?.id) ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(String(ex?.id ?? ""))}
                onChange={() => handleCheck(ex.id)}
              />
              <span className="font-medium">{toSafeText(ex?.nombre, "Examen sin nombre")}</span>
              <span className="text-gray-400">{toSafeText(ex?.metodologia)}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
