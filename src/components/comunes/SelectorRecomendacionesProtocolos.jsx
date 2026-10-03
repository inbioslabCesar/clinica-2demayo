import { useEffect, useState } from "react";
import { authFetch } from "../../utils/apiClient";

function parseNonEmptyLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripListPrefix(line) {
  return String(line || "")
    .replace(/^(\d+)[\.)]\s+/, "")
    .replace(/^([a-zA-Z])[\.)]\s+/, "")
    .replace(/^[-*•]\s+/, "")
    .trim();
}

function detectListStyle(existingLines) {
  let maxNumeric = 0;
  let maxLetterCode = 96;
  let hasBullet = false;

  existingLines.forEach((line) => {
    const numericMatch = line.match(/^(\d+)[\.)]\s+/);
    if (numericMatch) {
      maxNumeric = Math.max(maxNumeric, Number(numericMatch[1]) || 0);
      return;
    }

    const letterMatch = line.match(/^([a-zA-Z])[\.)]\s+/);
    if (letterMatch) {
      const code = letterMatch[1].toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) {
        maxLetterCode = Math.max(maxLetterCode, code);
      }
      return;
    }

    if (/^[-*•]\s+/.test(line)) {
      hasBullet = true;
    }
  });

  if (maxNumeric > 0) {
    return { type: "numeric", start: maxNumeric + 1 };
  }
  if (maxLetterCode >= 97) {
    return { type: "letter", startCode: Math.min(maxLetterCode + 1, 122) };
  }
  if (hasBullet) {
    return { type: "bullet" };
  }
  return { type: "bullet" };
}

function resolveStyle(existingLines, forcedStyle) {
  const forced = String(forcedStyle || "auto").trim().toLowerCase();
  if (forced === "numeric") {
    let maxNumeric = 0;
    existingLines.forEach((line) => {
      const numericMatch = String(line || "").match(/^(\d+)[\.)]\s+/);
      if (numericMatch) {
        maxNumeric = Math.max(maxNumeric, Number(numericMatch[1]) || 0);
      }
    });
    return { type: "numeric", start: maxNumeric > 0 ? maxNumeric + 1 : 1 };
  }
  if (forced === "letter") {
    let maxLetterCode = 96;
    existingLines.forEach((line) => {
      const letterMatch = String(line || "").match(/^([a-zA-Z])[\.)]\s+/);
      if (!letterMatch) return;
      const code = letterMatch[1].toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) {
        maxLetterCode = Math.max(maxLetterCode, code);
      }
    });
    return { type: "letter", startCode: maxLetterCode >= 97 ? Math.min(maxLetterCode + 1, 122) : 97 };
  }
  if (forced === "bullet") {
    return { type: "bullet" };
  }
  return detectListStyle(existingLines);
}

function formatLinesByStyle(lines, style) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  if (style.type === "numeric") {
    let n = Number(style.start || 1);
    return lines.map((line) => `${n++}. ${line}`);
  }

  if (style.type === "letter") {
    let code = Number(style.startCode || 97);
    return lines.map((line) => {
      const mark = String.fromCharCode(Math.min(code, 122));
      code += 1;
      return `${mark}) ${line}`;
    });
  }

  return lines.map((line) => `* ${line}`);
}

export default function SelectorRecomendacionesProtocolos({ recomendaciones, setRecomendaciones, consultaId }) {
  const INITIAL_VISIBLE = 12;
  const QUICK_ACCESS_LIMIT = 5;
  const [protocolos, setProtocolos] = useState([]);
  const [loadingProtocolos, setLoadingProtocolos] = useState(false);
  const [deletingProtocoloId, setDeletingProtocoloId] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [estiloLista, setEstiloLista] = useState("auto");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [contextoMedicoId, setContextoMedicoId] = useState(0);
  const [favoritosMap, setFavoritosMap] = useState({});
  const [usoMap, setUsoMap] = useState({});

  const storageKey = `reco_protocolos_pref_v1_medico_${Number(contextoMedicoId || 0)}`;

  const protocolosFiltrados = protocolos.filter((p) => {
    const q = String(filtro || "").trim().toLowerCase();
    if (!q) return true;
    const nombre = String(p?.nombre || "").toLowerCase();
    const contenido = String(p?.contenido || "").toLowerCase();
    return nombre.includes(q) || contenido.includes(q);
  });

  const protocolosVisibles = protocolosFiltrados.slice(0, visibleCount);
  const hasMore = protocolosFiltrados.length > visibleCount;
  const protocolosAccesoRapido = protocolos
    .map((p) => {
      const key = String(Number(p?.id || 0));
      return {
        ...p,
        _favorito: Boolean(favoritosMap[key]),
        _uso: Number(usoMap[key] || 0),
      };
    })
    .filter((p) => p._favorito || p._uso > 0)
    .sort((a, b) => {
      const favDiff = Number(b._favorito) - Number(a._favorito);
      if (favDiff !== 0) return favDiff;
      const usoDiff = Number(b._uso) - Number(a._uso);
      if (usoDiff !== 0) return usoDiff;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })
    .slice(0, QUICK_ACCESS_LIMIT);

  useEffect(() => {
    const consulta = Number(consultaId || 0);
    if (consulta <= 0) {
      setProtocolos([]);
      return;
    }

    let cancelled = false;
    setLoadingProtocolos(true);

    authFetch(`api_recomendaciones_protocolos.php?consulta_id=${consulta}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        setProtocolos(rows);
        setContextoMedicoId(Number(data?.contexto?.medico_id || 0));
      })
      .catch(() => {
        if (cancelled) return;
        setProtocolos([]);
        setContextoMedicoId(0);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingProtocolos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [consultaId]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [filtro, protocolos.length]);

  useEffect(() => {
    if (Number(contextoMedicoId || 0) <= 0) {
      setFavoritosMap({});
      setUsoMap({});
      return;
    }

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setFavoritosMap({});
        setUsoMap({});
        return;
      }

      const parsed = JSON.parse(raw);
      setFavoritosMap(parsed?.favoritosMap && typeof parsed.favoritosMap === "object" ? parsed.favoritosMap : {});
      setUsoMap(parsed?.usoMap && typeof parsed.usoMap === "object" ? parsed.usoMap : {});
    } catch {
      setFavoritosMap({});
      setUsoMap({});
    }
  }, [contextoMedicoId, storageKey]);

  useEffect(() => {
    if (Number(contextoMedicoId || 0) <= 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ favoritosMap, usoMap }));
    } catch {
      // Ignorar errores de storage para no bloquear el flujo clinico.
    }
  }, [contextoMedicoId, favoritosMap, usoMap, storageKey]);

  const marcarUso = (protocoloId) => {
    const key = String(Number(protocoloId || 0));
    if (!key || key === "0") return;
    setUsoMap((prev) => ({
      ...prev,
      [key]: Number(prev[key] || 0) + 1,
    }));
  };

  const toggleFavorito = (protocoloId) => {
    const key = String(Number(protocoloId || 0));
    if (!key || key === "0") return;
    setFavoritosMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const limpiarRankingUso = () => {
    const ok = window.confirm("¿Limpiar ranking de mas usados? Se conservaran los favoritos.");
    if (!ok) return;
    setUsoMap({});
  };

  const aplicarProtocolo = (protocolo) => {
    const actualLines = parseNonEmptyLines(recomendaciones || "");
    const contenidoLines = parseNonEmptyLines(protocolo?.contenido || "");
    if (contenidoLines.length === 0) return;

    if (actualLines.length === 0) {
      const styleInicial = resolveStyle([], estiloLista);
      const contenidoPlanoInicial = contenidoLines.map(stripListPrefix).filter(Boolean);
      const formateadasInicial = formatLinesByStyle(contenidoPlanoInicial, styleInicial);
      setRecomendaciones(formateadasInicial.join("\n"));
      return;
    }

    const style = resolveStyle(actualLines, estiloLista);
    const contenidoPlano = contenidoLines.map(stripListPrefix).filter(Boolean);
    const formateadas = formatLinesByStyle(contenidoPlano, style);
    setRecomendaciones(formateadas.join("\n"));
    marcarUso(protocolo?.id || 0);
  };

  const anexarProtocolo = (protocolo) => {
    const contenidoLines = parseNonEmptyLines(protocolo?.contenido || "");
    if (contenidoLines.length === 0) return;

    const actualLines = parseNonEmptyLines(recomendaciones || "");
    const style = resolveStyle(actualLines, estiloLista);
    const contenidoPlano = contenidoLines.map(stripListPrefix).filter(Boolean);
    const anexadas = formatLinesByStyle(contenidoPlano, style);

    if (actualLines.length === 0) {
      setRecomendaciones(anexadas.join("\n"));
      marcarUso(protocolo?.id || 0);
      return;
    }

    setRecomendaciones([...actualLines, ...anexadas].join("\n"));
    marcarUso(protocolo?.id || 0);
  };

  const guardarComoProtocolo = async () => {
    const contenido = String(recomendaciones || "").trim();
    if (!contenido) {
      window.alert("Escribe una recomendacion antes de guardarla como protocolo");
      return;
    }

    const nombre = window.prompt("Nombre del protocolo de recomendacion");
    if (!nombre || !String(nombre).trim()) return;

    const res = await authFetch("api_recomendaciones_protocolos.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        consulta_id: Number(consultaId || 0),
        nombre: String(nombre).trim(),
        scope: "medico",
        contenido,
      }),
    });

    const data = await res.json();
    if (!data?.success) {
      window.alert(data?.error || "No se pudo guardar el protocolo");
      return;
    }

    const consulta = Number(consultaId || 0);
    if (consulta > 0) {
      const refresh = await authFetch(`api_recomendaciones_protocolos.php?consulta_id=${consulta}`, { cache: "no-store" });
      const payload = await refresh.json();
      setProtocolos(Array.isArray(payload?.data) ? payload.data : []);
    }
  };

  const eliminarProtocolo = async (protocolo) => {
    const id = Number(protocolo?.id || 0);
    if (id <= 0) return;

    const nombre = String(protocolo?.nombre || "este protocolo");
    const ok = window.confirm(`¿Eliminar protocolo "${nombre}"?`);
    if (!ok) return;

    setDeletingProtocoloId(id);
    try {
      const res = await authFetch("api_recomendaciones_protocolos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });

      const data = await res.json();
      if (!data?.success) {
        window.alert(data?.error || "No se pudo eliminar el protocolo");
        return;
      }

      setProtocolos((prev) => prev.filter((p) => Number(p?.id || 0) !== id));
    } catch {
      window.alert("No se pudo eliminar el protocolo");
    } finally {
      setDeletingProtocoloId(0);
    }
  };

  return (
    <div className="mb-3 border rounded p-3 bg-sky-50">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-sky-900">Protocolos de recomendacion</h4>
        <button
          type="button"
          className="text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded"
          onClick={guardarComoProtocolo}
          disabled={!String(recomendaciones || "").trim()}
        >
          Guardar recomendacion actual como protocolo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-sky-800">Formato al aplicar/anexar:</span>
        <select
          className="text-xs sm:text-sm border border-sky-300 rounded px-2 py-1 bg-white text-sky-900"
          value={estiloLista}
          onChange={(e) => setEstiloLista(e.target.value)}
        >
          <option value="auto">Automatico</option>
          <option value="numeric">Numerico (1,2,3)</option>
          <option value="letter">Letras (a,b,c)</option>
          <option value="bullet">Vinetas (*)</option>
        </select>
      </div>

      {loadingProtocolos && <p className="text-xs text-sky-700">Cargando protocolos...</p>}
      {!loadingProtocolos && protocolos.length === 0 && (
        <p className="text-xs text-sky-700">Sin protocolos aun para este contexto.</p>
      )}

      {!loadingProtocolos && protocolos.length > 0 && (
        <div className="mb-2">
          <input
            type="text"
            className="w-full sm:w-80 border border-sky-300 rounded px-2 py-1 text-xs sm:text-sm"
            placeholder="Buscar protocolo por nombre o contenido"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-sky-700">
            Mostrando {Math.min(protocolosVisibles.length, protocolosFiltrados.length)} de {protocolosFiltrados.length} protocolos
          </p>
        </div>
      )}

      {!loadingProtocolos && protocolosAccesoRapido.length > 0 && (
        <div className="mb-2 rounded border border-sky-200 bg-white/70 p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] font-semibold text-sky-800">Acceso rapido (favoritos y mas usados)</p>
            <button
              type="button"
              className="text-[11px] px-2 py-0.5 rounded border border-sky-300 bg-white text-sky-800 hover:bg-sky-50"
              onClick={limpiarRankingUso}
            >
              Limpiar ranking
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {protocolosAccesoRapido.map((p) => (
              <div key={`quick-${p.id}`} className="inline-flex items-center rounded border border-sky-300 bg-white overflow-hidden">
                <button
                  type="button"
                  className="text-xs hover:bg-sky-100 text-sky-800 px-2 py-1"
                  onClick={() => aplicarProtocolo(p)}
                  title={`Aplicar ${p.nombre}`}
                >
                  {p.nombre}
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border-l border-sky-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => anexarProtocolo(p)}
                  title={`Anexar ${p.nombre}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingProtocolos && protocolos.length > 0 && protocolosFiltrados.length === 0 && (
        <p className="text-xs text-sky-700">No se encontraron protocolos con ese termino.</p>
      )}

      {!loadingProtocolos && protocolosFiltrados.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {protocolosVisibles.map((p) => (
            <div key={p.id} className="rounded border border-sky-300 bg-white p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-sky-900 truncate" title={String(p?.nombre || "")}>
                    {String(p?.nombre || "Protocolo sin nombre")}
                  </p>
                  <p className="text-[11px] text-slate-600 truncate" title={String(p?.contenido || "")}>
                    {String(p?.contenido || "").slice(0, 120) || "Sin contenido"}
                    {String(p?.contenido || "").length > 120 ? "..." : ""}
                  </p>
                </div>
                <div className="shrink-0 inline-flex items-center rounded border border-sky-300 overflow-hidden">
                  <button
                    type="button"
                    className="text-xs hover:bg-sky-100 text-sky-800 px-2 py-1"
                    onClick={() => aplicarProtocolo(p)}
                    title={`Aplicar ${p.nombre}`}
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 border-l border-sky-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => anexarProtocolo(p)}
                    title={`Anexar ${p.nombre}`}
                  >
                    Anexar
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 border-l border-sky-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => toggleFavorito(p?.id || 0)}
                    title={favoritosMap[String(Number(p?.id || 0))] ? `Quitar favorito ${p.nombre}` : `Marcar favorito ${p.nombre}`}
                  >
                    {favoritosMap[String(Number(p?.id || 0))] ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 border-l border-sky-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    onClick={() => eliminarProtocolo(p)}
                    title={`Eliminar ${p.nombre}`}
                    disabled={deletingProtocoloId === Number(p.id)}
                  >
                    {deletingProtocoloId === Number(p.id) ? "..." : "X"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="pt-1">
              <button
                type="button"
                className="text-xs sm:text-sm border border-sky-300 bg-white text-sky-800 hover:bg-sky-50 px-3 py-1 rounded"
                onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}
              >
                Mostrar mas ({protocolosFiltrados.length - protocolosVisibles.length} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
