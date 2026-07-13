import { useEffect, useState } from "react";
import { authFetch } from "../../utils/apiClient";
import { calcularCantidadTotalReceta } from "../../utils/calcularCantidadReceta";

const emptyDetalle = {
  dosis: "",
  frecuenciaTipo: "intervalo_horas",
  frecuenciaValor: "8",
  frecuenciaHoras: "",
  duracionValor: "5",
  duracionUnidad: "dias",
  observaciones: "",
};

function parsePositiveInteger(value) {
  const num = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseFixedTimes(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(part))
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .sort();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function inferUnidadDispensacion(presentacion) {
  const p = normalizeText(presentacion);
  if (!p) return "unidad";

  if (p.includes("tableta") || p.includes("comprimido")) return "tableta";
  if (p.includes("capsula")) return "capsula";
  if (p.includes("ampolla") || p.includes("vial") || p.includes("inyectable")) return "ampolla";
  if (p.includes("tubo") || p.includes("crema") || p.includes("gel") || p.includes("unguento")) return "tubo";
  if (p.includes("jarabe") || p.includes("gota") || p.includes("suspension") || p.includes("solucion") || p.includes("frasco")) return "frasco";
  if (p.includes("caja") || p.includes("blister")) return "caja";

  return "unidad";
}

function buildFrequencyText({ frecuenciaTipo, frecuenciaValor, frecuenciaHoras }) {
  if (frecuenciaTipo === "intervalo_horas") {
    return `Cada ${frecuenciaValor} horas`;
  }
  if (frecuenciaTipo === "veces_dia") {
    return `${frecuenciaValor} veces al día`;
  }
  if (frecuenciaTipo === "horarios_fijos") {
    return `Horarios fijos: ${frecuenciaHoras.join(", ")}`;
  }
  return "Según indicación / PRN";
}

function buildDurationText({ duracionValor, duracionUnidad }) {
  if (duracionUnidad === "semanas") {
    return `${duracionValor} semana${duracionValor === 1 ? "" : "s"}`;
  }
  return `${duracionValor} día${duracionValor === 1 ? "" : "s"}`;
}

export default function SelectorMedicamentosReceta({ receta, setReceta, sugerenciasReceta, consultaId }) {
  const recetaArray = Array.isArray(receta) ? receta : [];
  const sugerencias = sugerenciasReceta && typeof sugerenciasReceta === "object" ? sugerenciasReceta : {};
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [medicamentoSel, setMedicamentoSel] = useState(null);
  const [modoManual, setModoManual] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [detalle, setDetalle] = useState(emptyDetalle);
  const [seleccionSugeridos, setSeleccionSugeridos] = useState({});
  const [cantidadDispensacion, setCantidadDispensacion] = useState("");
  const [unidadDispensacion, setUnidadDispensacion] = useState("unidad");
  const [protocolos, setProtocolos] = useState([]);
  const [loadingProtocolos, setLoadingProtocolos] = useState(false);
  const [deletingProtocoloId, setDeletingProtocoloId] = useState(0);

  useEffect(() => {
    if (modoManual) {
      setUnidadDispensacion("unidad");
      return;
    }

    const presentacion = medicamentoSel?.presentacion || "";
    setUnidadDispensacion(inferUnidadDispensacion(presentacion));
  }, [medicamentoSel, modoManual]);

  useEffect(() => {
    const consulta = Number(consultaId || 0);
    if (consulta <= 0) {
      setProtocolos([]);
      return;
    }

    let cancelled = false;
    setLoadingProtocolos(true);

    authFetch(`api_receta_protocolos.php?consulta_id=${consulta}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        setProtocolos(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setProtocolos([]);
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
    if (busqueda.length < 2) {
      setResultados([]);
      return;
    }

    setLoading(true);
    authFetch(`api_medicamentos.php?busqueda=${encodeURIComponent(busqueda)}`)
      .then((res) => res.json())
      .then((data) => setResultados(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [busqueda]);

  const resetFormulario = () => {
    setMedicamentoSel(null);
    setModoManual(false);
    setManualNombre("");
    setDetalle(emptyDetalle);
    setCantidadDispensacion("");
    setUnidadDispensacion("unidad");
    setBusqueda("");
    setResultados([]);
  };

  const agregarMedicamento = () => {
    const nombreManual = manualNombre.trim();
    if (!medicamentoSel && !modoManual) return;
    if (modoManual && !nombreManual) return;

    const duracionValor = parsePositiveInteger(detalle.duracionValor) || 5;

    let frecuenciaValor = null;
    let frecuenciaHoras = [];

    const frecuenciaTipo = detalle.frecuenciaTipo || "intervalo_horas";

    if (frecuenciaTipo === "intervalo_horas" || frecuenciaTipo === "veces_dia") {
      const value = parsePositiveInteger(detalle.frecuenciaValor) || 8;
      frecuenciaValor = value;
    }

    if (frecuenciaTipo === "horarios_fijos") {
      frecuenciaHoras = parseFixedTimes(detalle.frecuenciaHoras);
      if (frecuenciaHoras.length === 0) {
        frecuenciaHoras = ["08:00", "16:00", "00:00"];
      }
    }

    const cantidadDispensacionFinal = parsePositiveInteger(cantidadDispensacion) || 1;
    const unidadDispensacionFinal = unidadDispensacion || inferUnidadDispensacion(medicamentoSel?.presentacion || "");

    const frecuencia = buildFrequencyText({
      frecuenciaTipo,
      frecuenciaValor,
      frecuenciaHoras,
    });

    const duracion = buildDurationText({
      duracionValor,
      duracionUnidad: detalle.duracionUnidad,
    });

    const cantidad_total = calcularCantidadTotalReceta({
      frecuencia_tipo: frecuenciaTipo,
      frecuencia_valor: frecuenciaValor,
      frecuencia_horas: frecuenciaHoras,
      duracion_valor: duracionValor,
      duracion_unidad: detalle.duracionUnidad
    });

    const nuevo = {
      codigo: modoManual ? `MANUAL-${Date.now()}` : medicamentoSel.codigo,
      nombre: modoManual ? nombreManual : medicamentoSel.nombre,
      presentacion: !modoManual ? (medicamentoSel.presentacion || "") : "",
      concentracion: !modoManual ? (medicamentoSel.concentracion || "") : "",
      laboratorio: !modoManual ? (medicamentoSel.laboratorio || "") : "",
      dosis: detalle.dosis,
      frecuencia,
      frecuencia_tipo: frecuenciaTipo,
      frecuencia_valor: frecuenciaValor,
      frecuencia_horas: frecuenciaHoras,
      duracion,
      duracion_valor: duracionValor,
      duracion_unidad: detalle.duracionUnidad,
      cantidad_total: cantidad_total,
      observaciones: detalle.observaciones,
      cantidad_dispensacion: cantidadDispensacionFinal,
      unidad_dispensacion: unidadDispensacionFinal,
      manual: modoManual,
      origen: modoManual ? "manual" : "catalogo",
    };

    setReceta((prev) => [nuevo, ...prev]);
    resetFormulario();
  };

  const eliminarMedicamento = (idxEliminar) => {
    setReceta((prev) => prev.filter((_, idx) => idx !== idxEliminar));
  };

  const ordenarPorFrecuencia = (items) => {
    const arr = Array.isArray(items) ? [...items] : [];
    arr.sort((a, b) => Number(b?.uso_count || 0) - Number(a?.uso_count || 0));
    return arr;
  };

  const actualizarIndicaciones = (idxEditar, indicaciones) => {
    setReceta((prev) => prev.map((item, idx) => (
      idx === idxEditar ? { ...item, observaciones: indicaciones } : item
    )));
  };

  const actualizarCantidadDispensacion = (idxEditar, value) => {
    const parsed = parsePositiveInteger(value);
    setReceta((prev) => prev.map((item, idx) => (
      idx === idxEditar
        ? { ...item, cantidad_dispensacion: parsed > 0 ? parsed : 1 }
        : item
    )));
  };

  const gruposSugerencias = [
    {
      key: "medico",
      titulo: "Frecuentes del medico",
      items: ordenarPorFrecuencia(sugerencias.medico),
    },
    {
      key: "especialidad",
      titulo: "Frecuentes de la especialidad",
      items: ordenarPorFrecuencia(sugerencias.especialidad),
    },
    {
      key: "general",
      titulo: "Frecuentes de la clinica",
      items: ordenarPorFrecuencia(sugerencias.general),
    },
  ];

  const totalSugeridos = gruposSugerencias.reduce((acc, grupo) => acc + grupo.items.length, 0);

  const buildSugeridoKey = (grupoKey, item, idx) => {
    const code = String(item?.codigo || "").trim();
    const name = String(item?.nombre || "").trim();
    const ref = code || name || String(idx);
    return `${grupoKey}::${ref}::${idx}`;
  };

  const toggleSugerido = (key, checked) => {
    setSeleccionSugeridos((prev) => {
      const next = { ...prev };
      if (checked) {
        next[key] = true;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const agregarSugeridosSeleccionados = () => {
    const seleccionados = [];

    gruposSugerencias.forEach((grupo) => {
      grupo.items.forEach((item, idx) => {
        const k = buildSugeridoKey(grupo.key, item, idx);
        if (!seleccionSugeridos[k]) return;
        seleccionados.push(item);
      });
    });

    if (seleccionados.length === 0) return;

    const existentes = new Set(
      recetaArray.map((r) => `${String(r.codigo || "").trim().toLowerCase()}|${String(r.nombre || "").trim().toLowerCase()}`)
    );

    const nuevos = [];
    seleccionados.forEach((item, idx) => {
      const codigo = String(item?.codigo || "").trim();
      const nombre = String(item?.nombre || "").trim();
      if (!nombre) return;

      const enCatalogo = Boolean(item?.en_catalogo);
      const activo = item?.activo !== false;
      if (enCatalogo && !activo) return;

      const uniqueKey = `${codigo.toLowerCase()}|${nombre.toLowerCase()}`;
      if (existentes.has(uniqueKey)) return;

      existentes.add(uniqueKey);

      const frecuenciaTipo = String(item?.frecuencia_tipo || "intervalo_horas").trim() || "intervalo_horas";
      const frecuenciaValor =
        frecuenciaTipo === "intervalo_horas" || frecuenciaTipo === "veces_dia"
          ? Math.max(1, parsePositiveInteger(item?.frecuencia_valor || 0) || 8)
          : null;
      const frecuenciaHoras = frecuenciaTipo === "horarios_fijos"
        ? parseFixedTimes(Array.isArray(item?.frecuencia_horas) ? item.frecuencia_horas.join(",") : item?.frecuencia_horas || "")
        : [];

      const duracionValor = Math.max(1, parsePositiveInteger(item?.duracion_valor || 0) || 5);
      const duracionUnidad = item?.duracion_unidad === "semanas" ? "semanas" : "dias";

      const frecuencia = String(item?.frecuencia || "").trim() || buildFrequencyText({
        frecuenciaTipo,
        frecuenciaValor,
        frecuenciaHoras,
      });

      const duracion = String(item?.duracion || "").trim() || buildDurationText({
        duracionValor,
        duracionUnidad,
      });

      const cantidad_total = calcularCantidadTotalReceta({
        frecuencia_tipo: frecuenciaTipo,
        frecuencia_valor: frecuenciaValor,
        frecuencia_horas: frecuenciaHoras,
        duracion_valor: duracionValor,
        duracion_unidad: duracionUnidad,
      });

      nuevos.push({
        codigo: codigo || `SUG-${Date.now()}-${idx}`,
        nombre,
        presentacion: String(item?.presentacion || ""),
        concentracion: String(item?.concentracion || ""),
        laboratorio: String(item?.laboratorio || ""),
        dosis: String(item?.dosis || ""),
        frecuencia,
        frecuencia_tipo: frecuenciaTipo,
        frecuencia_valor: frecuenciaValor,
        frecuencia_horas: frecuenciaHoras,
        duracion,
        duracion_valor: duracionValor,
        duracion_unidad: duracionUnidad,
        cantidad_total,
        observaciones: String(item?.observaciones || ""),
        cantidad_dispensacion: parsePositiveInteger(item?.cantidad_dispensacion || item?.cantidad_dispensar || 0) || 1,
        unidad_dispensacion: String(item?.unidad_dispensacion || inferUnidadDispensacion(item?.presentacion || "")) || "unidad",
        manual: !enCatalogo,
        origen: enCatalogo ? "catalogo" : "manual",
      });
    });

    if (nuevos.length === 0) return;

    setReceta((prev) => [...nuevos, ...prev]);
    setSeleccionSugeridos({});
  };

  const aplicarProtocolo = (protocolo) => {
    const items = Array.isArray(protocolo?.items) ? protocolo.items : [];
    if (items.length === 0) return;

    const existentes = new Set(
      recetaArray.map((r) => `${String(r.codigo || "").trim().toLowerCase()}|${String(r.nombre || "").trim().toLowerCase()}`)
    );

    const nuevos = [];
    items.forEach((item, idx) => {
      const codigo = String(item?.codigo || "").trim();
      const nombre = String(item?.nombre || "").trim();
      if (!nombre) return;

      const key = `${codigo.toLowerCase()}|${nombre.toLowerCase()}`;
      if (existentes.has(key)) return;
      existentes.add(key);

      const frecuenciaTipo = String(item?.frecuencia_tipo || "intervalo_horas").trim() || "intervalo_horas";
      const frecuenciaValor =
        frecuenciaTipo === "intervalo_horas" || frecuenciaTipo === "veces_dia"
          ? Math.max(1, parsePositiveInteger(item?.frecuencia_valor || 0) || 8)
          : null;
      const frecuenciaHoras = frecuenciaTipo === "horarios_fijos"
        ? parseFixedTimes(Array.isArray(item?.frecuencia_horas) ? item.frecuencia_horas.join(",") : item?.frecuencia_horas || "")
        : [];

      const duracionValor = Math.max(1, parsePositiveInteger(item?.duracion_valor || 0) || 5);
      const duracionUnidad = item?.duracion_unidad === "semanas" ? "semanas" : "dias";

      const frecuencia = String(item?.frecuencia || "").trim() || buildFrequencyText({
        frecuenciaTipo,
        frecuenciaValor,
        frecuenciaHoras,
      });
      const duracion = String(item?.duracion || "").trim() || buildDurationText({
        duracionValor,
        duracionUnidad,
      });

      const cantidad_total = calcularCantidadTotalReceta({
        frecuencia_tipo: frecuenciaTipo,
        frecuencia_valor: frecuenciaValor,
        frecuencia_horas: frecuenciaHoras,
        duracion_valor: duracionValor,
        duracion_unidad: duracionUnidad,
      });

      nuevos.push({
        codigo: codigo || `PROTO-${Date.now()}-${idx}`,
        nombre,
        presentacion: String(item?.presentacion || ""),
        concentracion: String(item?.concentracion || ""),
        laboratorio: String(item?.laboratorio || ""),
        dosis: String(item?.dosis || ""),
        frecuencia,
        frecuencia_tipo: frecuenciaTipo,
        frecuencia_valor: frecuenciaValor,
        frecuencia_horas: frecuenciaHoras,
        duracion,
        duracion_valor: duracionValor,
        duracion_unidad: duracionUnidad,
        cantidad_total,
        observaciones: String(item?.observaciones || ""),
        cantidad_dispensacion: parsePositiveInteger(item?.cantidad_dispensacion || item?.cantidad_dispensar || 0) || 1,
        unidad_dispensacion: String(item?.unidad_dispensacion || "unidad") || "unidad",
        manual: Boolean(item?.manual),
        origen: String(item?.origen || "catalogo"),
      });
    });

    if (nuevos.length === 0) return;
    setReceta((prev) => [...nuevos, ...prev]);
  };

  const guardarComoProtocolo = async () => {
    if (recetaArray.length === 0) return;
    const nombre = window.prompt("Nombre del protocolo de receta");
    if (!nombre || !String(nombre).trim()) return;

    const scopeRaw = window.prompt("Alcance del protocolo: medico, especialidad o general", "medico");
    const scope = ["medico", "especialidad", "general"].includes(String(scopeRaw || "").trim().toLowerCase())
      ? String(scopeRaw).trim().toLowerCase()
      : "medico";

    const items = recetaArray.map((m) => ({
      codigo: m?.codigo || "",
      nombre: m?.nombre || "",
      presentacion: m?.presentacion || "",
      concentracion: m?.concentracion || "",
      laboratorio: m?.laboratorio || "",
      dosis: m?.dosis || "",
      frecuencia: m?.frecuencia || "",
      frecuencia_tipo: m?.frecuencia_tipo || "intervalo_horas",
      frecuencia_valor: m?.frecuencia_valor ?? null,
      frecuencia_horas: Array.isArray(m?.frecuencia_horas) ? m.frecuencia_horas : [],
      duracion: m?.duracion || "",
      duracion_valor: m?.duracion_valor || 5,
      duracion_unidad: m?.duracion_unidad || "dias",
      observaciones: m?.observaciones || "",
      cantidad_dispensacion: parsePositiveInteger(m?.cantidad_dispensacion || 0) || 1,
      unidad_dispensacion: m?.unidad_dispensacion || "unidad",
      manual: Boolean(m?.manual),
      origen: m?.origen || "catalogo",
    }));

    const res = await authFetch("api_receta_protocolos.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        consulta_id: Number(consultaId || 0),
        nombre: String(nombre).trim(),
        scope,
        items,
      }),
    });

    const data = await res.json();
    if (!data?.success) {
      window.alert(data?.error || "No se pudo guardar el protocolo");
      return;
    }

    const consulta = Number(consultaId || 0);
    if (consulta > 0) {
      const refresh = await authFetch(`api_receta_protocolos.php?consulta_id=${consulta}`, { cache: "no-store" });
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
      const res = await authFetch("api_receta_protocolos.php", {
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
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2 mt-4">Receta médica</h3>

      <div className="mb-3 border rounded p-3 bg-sky-50">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-sky-900">Protocolos de receta</h4>
          <button
            type="button"
            className="text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded"
            onClick={guardarComoProtocolo}
            disabled={recetaArray.length === 0}
          >
            Guardar receta actual como protocolo
          </button>
        </div>
        {loadingProtocolos && <p className="text-xs text-sky-700">Cargando protocolos...</p>}
        {!loadingProtocolos && protocolos.length === 0 && (
          <p className="text-xs text-sky-700">Sin protocolos aun para este contexto.</p>
        )}
        {!loadingProtocolos && protocolos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {protocolos.map((p) => (
              <div key={p.id} className="inline-flex items-center rounded border border-sky-300 bg-white overflow-hidden">
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
                  className="text-xs px-2 py-1 border-l border-sky-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => eliminarProtocolo(p)}
                  title={`Eliminar ${p.nombre}`}
                  disabled={deletingProtocoloId === Number(p.id)}
                >
                  {deletingProtocoloId === Number(p.id) ? "..." : "X"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalSugeridos > 0 && (
        <div className="mb-3 border rounded p-3 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-emerald-900">Sugerencias frecuentes</h4>
            <button
              type="button"
              className="text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded"
              onClick={agregarSugeridosSeleccionados}
            >
              Agregar seleccionados
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {gruposSugerencias.map((grupo) => {
              if (!grupo.items.length) return null;
              return (
                <div key={grupo.key} className="border border-emerald-200 rounded bg-white p-2">
                  <p className="text-xs font-semibold text-emerald-800 mb-2">{grupo.titulo}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                    {grupo.items.map((item, idx) => {
                      const k = buildSugeridoKey(grupo.key, item, idx);
                      const stock = Number(item?.stock || 0);
                      const enCatalogo = Boolean(item?.en_catalogo);
                      const activo = item?.activo !== false;
                      const bloqueado = enCatalogo && !activo;
                      return (
                        <label
                          key={k}
                          className={`rounded border px-2 py-1 text-[11px] leading-tight flex items-start gap-1.5 ${bloqueado ? "bg-gray-100 border-gray-200 text-gray-500" : "bg-white border-emerald-200 text-gray-700 cursor-pointer"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 scale-90"
                            checked={Boolean(seleccionSugeridos[k])}
                            onChange={(e) => toggleSugerido(k, e.target.checked)}
                            disabled={bloqueado}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-semibold block truncate" title={item?.nombre || "Medicamento"}>{item?.nombre || "Medicamento"}</span>
                            <span className="text-gray-500 block truncate">{item?.codigo ? `(${item.codigo})` : ""}</span>
                            <span className="block text-[10px] text-gray-500 truncate" title={`${item?.frecuencia || "Frecuencia sugerida"} · ${item?.duracion || "Duración sugerida"}`}>
                              {item?.frecuencia || "Frecuencia sugerida"} · {item?.duracion || "Duración sugerida"}
                            </span>
                            <span className="block text-[10px] text-gray-500 truncate" title={`Indicaciones: ${item?.observaciones ? String(item.observaciones) : "Sin indicaciones sugeridas"}`}>
                              Indicaciones: {item?.observaciones ? String(item.observaciones) : "Sin indicaciones sugeridas"}
                            </span>
                            <span className="block text-[10px] text-gray-500">
                              Cantidad sugerida: {parsePositiveInteger(item?.cantidad_dispensacion || item?.cantidad_dispensar || 0) || 1}
                            </span>
                            <span className="block text-[10px] text-gray-400">
                              Uso frecuente: {Number(item?.uso_count || 0)}
                              {enCatalogo ? ` · Stock: ${stock}` : " · Manual"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-col sm:flex-row gap-2 items-stretch">
        <input
          type="text"
          className="border rounded p-1 flex-1"
          placeholder="Buscar medicamento por nombre o código"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setMedicamentoSel(null);
            setModoManual(false);
            setManualNombre("");
          }}
        />
        {loading && <span className="text-xs text-gray-500">Buscando...</span>}
      </div>

      {!medicamentoSel && !modoManual && (
        <div className="mb-2">
          <button
            type="button"
            className="text-xs sm:text-sm bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded"
            onClick={() => {
              setModoManual(true);
              setMedicamentoSel(null);
              setResultados([]);
            }}
          >
            No encuentro el medicamento, agregar manualmente
          </button>
        </div>
      )}

      {resultados.length > 0 && !medicamentoSel && (
        <div className="border rounded bg-white shadow max-h-60 overflow-y-auto mb-2">
          {resultados.map((m) => (
            (() => {
              const stock = Number(m?.stock || 0);
              const sinStock = stock <= 0;
              const inactivo = String(m?.estado || "").trim().toLowerCase() === "inactivo";
              return (
                <div
                  key={m.id || m.codigo}
                  className={`px-3 py-2 text-sm flex flex-col gap-1 ${inactivo ? "bg-gray-100 text-gray-500 cursor-not-allowed" : (sinStock ? "bg-amber-50 text-gray-700 hover:bg-amber-100 cursor-pointer" : "hover:bg-blue-100 cursor-pointer")}`}
                  onClick={() => {
                    if (inactivo) return;
                    setMedicamentoSel(m);
                    setModoManual(false);
                    setManualNombre("");
                  }}
                  title={inactivo ? "Medicamento inactivo" : (sinStock ? "Sin stock en farmacia (se puede recetar)" : "Seleccionar medicamento")}
                  aria-disabled={inactivo}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {m.nombre} <span className="text-gray-500 text-xs">({m.codigo})</span>
                    </span>
                    {inactivo ? (
                      <span className="text-[11px] font-semibold text-gray-700 bg-gray-200 border border-gray-300 rounded px-2 py-0.5">
                        Inactivo
                      </span>
                    ) : sinStock ? (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">
                        Sin Stock
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-700 ml-2 space-y-0.5">
                    {m.presentacion && (
                      <div><strong>Presentación:</strong> {m.presentacion}</div>
                    )}
                    {m.concentracion && (
                      <div><strong>Concentración:</strong> {m.concentracion}</div>
                    )}
                    {m.laboratorio && (
                      <div><strong>Laboratorio:</strong> {m.laboratorio}</div>
                    )}
                    {m.stock !== undefined && (
                      <div className={sinStock ? "text-amber-600" : "text-green-600"}><strong>Stock:</strong> {stock}</div>
                    )}
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      )}

      {(medicamentoSel || modoManual) && (
        <div className="border rounded p-3 bg-blue-50 mb-2 space-y-3">
          <div className="text-xs text-gray-600">
            {modoManual ? (
              <>
                <span className="font-semibold">Medicamento manual</span>
                <input
                  type="text"
                  className="border rounded p-1 w-full mt-2 font-normal text-sm"
                  placeholder="Nombre del medicamento"
                  value={manualNombre}
                  onChange={(e) => setManualNombre(e.target.value)}
                />
              </>
            ) : (
              <div className="space-y-0.5">
                <div className="font-semibold text-gray-800">{medicamentoSel.nombre}</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                  {medicamentoSel.codigo && <span>Código: {medicamentoSel.codigo}</span>}
                  {medicamentoSel.presentacion && <span>•</span>}
                  {medicamentoSel.presentacion && <span>Pres: {medicamentoSel.presentacion}</span>}
                  {medicamentoSel.concentracion && <span>•</span>}
                  {medicamentoSel.concentracion && <span>Conc: {medicamentoSel.concentracion}</span>}
                  {medicamentoSel.laboratorio && <span>•</span>}
                  {medicamentoSel.laboratorio && <span>Lab: {medicamentoSel.laboratorio}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-gray-600">
            <span className="font-medium">Modo práctico:</span> solo completa indicaciones y cantidad.
            <span className="ml-1 text-gray-500">La pauta clínica y la unidad se autocompletan.</span>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Indicaciones</label>
            <textarea
              className="border rounded p-2 w-full text-sm"
              placeholder="Ej: aplicar capa fina en zona afectada por 30 días, interdiarios"
              value={detalle.observaciones}
              onChange={(e) => setDetalle((prev) => ({ ...prev, observaciones: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Cantidad</label>
              <input
                type="number"
                min="1"
                className="border rounded p-2 w-full text-sm"
                placeholder="Ej: 1"
                value={cantidadDispensacion}
                onChange={(e) => setCantidadDispensacion(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium"
              onClick={agregarMedicamento}
            >
              Agregar a receta
            </button>
            <button
              type="button"
              className="bg-gray-400 text-white px-3 py-2 rounded text-sm font-medium"
              onClick={resetFormulario}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <h4 className="text-xs text-gray-600 font-medium mb-2">Medicamentos seleccionados:</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border rounded min-w-max">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Medicamento</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Indicaciones</th>
                <th className="px-2 py-1 whitespace-nowrap text-xs text-gray-700 font-semibold">Cantidad</th>
                <th className="px-2 py-1 whitespace-nowrap w-16 text-xs text-gray-700 font-semibold">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {recetaArray.length > 0 ? (
                recetaArray.map((m, idx) => (
                  <tr key={`${m.codigo || "sin-codigo"}-${idx}`}>
                    <td className="border px-2 py-1 max-w-xs">
                      <div className="truncate" title={`${m.nombre} (${m.codigo || "SIN-CODIGO"})`}>
                        {m.nombre} {m.codigo && <span className="text-gray-500">({m.codigo})</span>}
                      </div>
                    </td>
                    <td className="border px-2 py-1 min-w-[220px]">
                      <textarea
                        className="w-full border rounded p-1 text-xs"
                        rows={2}
                        placeholder="Escribe indicaciones"
                        value={m.observaciones || ""}
                        onChange={(e) => actualizarIndicaciones(idx, e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-1 whitespace-nowrap text-center">
                      <input
                        type="number"
                        min="1"
                        className="w-20 border rounded p-1 text-xs text-center font-semibold text-green-700"
                        value={m.cantidad_dispensacion || 1}
                        onChange={(e) => actualizarCantidadDispensacion(idx, e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded px-2 py-1 text-xs font-medium transition-colors"
                        onClick={() => eliminarMedicamento(idx)}
                        title="Eliminar medicamento"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border px-2 py-1 text-center text-gray-500 italic" colSpan={4}>
                    No hay medicamentos seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}