import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../utils/apiClient";

const TIPOS = [
  { key: "ecografia",  label: "Ecografía",  emoji: "🫀", color: "violet" },
  { key: "rayosx",     label: "Rayos X",    emoji: "🩻", color: "sky"    },
  { key: "tomografia", label: "Tomografía", emoji: "🔬", color: "amber"  },
];

// ─ Helpers ─────────────────────────────────────────────────────────────────
let _idCounter = 0;
const nextId = (prefix = "x") => `${prefix}_${++_idCounter}`;

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_") || "campo";
}

function createCampo(label = "Nuevo campo") {
  return { _id: nextId("c"), id: slugify(label), label, type: "textarea", placeholder: "", required: false };
}

function createSeccion(nombre = "Nueva sección") {
  return { _id: nextId("s"), id: slugify(nombre), nombre, campos: [createCampo()] };
}

function estructuraToBuilder(estructura) {
  const sections = Array.isArray(estructura?.sections) ? estructura.sections : [];
  return sections.map((s) => ({
    _id: nextId("s"),
    id: String(s.id || ""),
    nombre: String(s.nombre || ""),
    campos: (Array.isArray(s.campos) ? s.campos : []).map((c) => ({
      _id: nextId("c"),
      id: String(c.id || ""),
      label: String(c.label || ""),
      type: String(c.type || "textarea"),
      placeholder: String(c.placeholder || ""),
      required: Boolean(c.required),
    })),
  }));
}

function builderToEstructura(secciones) {
  return {
    sections: secciones.map((s) => ({
      id: s.id || slugify(s.nombre),
      nombre: s.nombre,
      campos: (s.campos || []).map((c) => ({
        id: c.id || slugify(c.label),
        label: c.label,
        type: c.type,
        placeholder: c.placeholder,
        required: c.required,
      })),
    })),
  };
}

function emptyForm(tipo = "ecografia") {
  return {
    id: 0,
    nombre: "",
    tipo_examen: tipo,
    descripcion: "",
    es_activa: 1,
    secciones: [
      createSeccion("Hallazgos"),
      createSeccion("Conclusión"),
    ],
  };
}

// ─ Componente principal ──────────────────────────────────────────────────────
export default function PlantillasImagenologiaPage() {
  const [tipoActivo, setTipoActivo]   = useState("ecografia");
  const [plantillas, setPlantillas]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState("");
  const [msgType, setMsgType]         = useState("info");
  const [form, setForm]               = useState(null);

  const showMsg = (text, type = "info") => {
    setMsg(text);
    setMsgType(type);
    if (type === "success") setTimeout(() => setMsg(""), 3000);
  };

  const cargarLista = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("api_imagenologia_plantillas.php?mode=list");
      const data = await res.json();
      if (data.success) setPlantillas(data.plantillas || []);
      else showMsg(data.error || "Error cargando lista", "error");
    } catch {
      showMsg("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  const cargarPlantilla = async (id) => {
    setMsg("");
    try {
      const res = await authFetch(`api_imagenologia_plantillas.php?id=${id}`);
      const data = await res.json();
      if (data.success && data.plantilla) {
        const p = data.plantilla;
        setForm({
          id: p.id,
          nombre: p.nombre,
          tipo_examen: p.tipo_examen,
          descripcion: p.descripcion || "",
          es_activa: Number(p.es_activa ?? 1),
          secciones: estructuraToBuilder(p.estructura_json),
        });
      } else {
        showMsg(data.error || "Error cargando plantilla", "error");
      }
    } catch {
      showMsg("Error de conexión", "error");
    }
  };

  const handleNueva = () => {
    setMsg("");
    setForm(emptyForm(tipoActivo));
  };

  const handleGuardar = async () => {
    if (!form) return;
    if (!form.nombre.trim()) { showMsg("El nombre es requerido", "error"); return; }
    if (!form.secciones.length) { showMsg("Agrega al menos una sección", "error"); return; }
    for (const s of form.secciones) {
      if (!s.nombre.trim()) { showMsg(`Una sección no tiene nombre`, "error"); return; }
      if (!s.campos.length) { showMsg(`La sección "${s.nombre}" no tiene campos`, "error"); return; }
    }

    setSaving(true);
    try {
      const payload = {
        id: form.id,
        nombre: form.nombre.trim(),
        tipo_examen: form.tipo_examen,
        descripcion: form.descripcion.trim(),
        es_activa: form.es_activa,
        estructura_json: builderToEstructura(form.secciones),
      };
      const res = await authFetch("api_imagenologia_plantillas.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showMsg("Plantilla guardada correctamente", "success");
        if (data.id && !form.id) setForm((f) => ({ ...f, id: data.id }));
        await cargarLista();
      } else {
        showMsg(data.error || "Error al guardar", "error");
      }
    } catch {
      showMsg("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActiva = async (p) => {
    try {
      const res = await authFetch("api_imagenologia_plantillas.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          nombre: p.nombre,
          tipo_examen: p.tipo_examen,
          descripcion: p.descripcion || "",
          es_activa: p.es_activa ? 0 : 1,
          estructura_json: p.estructura_json || { sections: [] },
        }),
      });
      const data = await res.json();
      if (data.success) {
        await cargarLista();
        if (form?.id === p.id) setForm((f) => ({ ...f, es_activa: p.es_activa ? 0 : 1 }));
      }
    } catch {}
  };

  // ─ Builder helpers ──────────────────────────────────────────────────────────
  const addSeccion  = () => setForm((f) => ({ ...f, secciones: [...f.secciones, createSeccion()] }));
  const removeSeccion = (sid) => setForm((f) => ({ ...f, secciones: f.secciones.filter((s) => s._id !== sid) }));
  const updateSeccion = (sid, patch) => setForm((f) => ({
    ...f, secciones: f.secciones.map((s) => s._id === sid ? { ...s, ...patch } : s),
  }));
  const moveSeccion = (sid, dir) => setForm((f) => {
    const arr = [...f.secciones];
    const i = arr.findIndex((s) => s._id === sid);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return f;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...f, secciones: arr };
  });
  const addCampo = (sid) => setForm((f) => ({
    ...f, secciones: f.secciones.map((s) => s._id === sid ? { ...s, campos: [...s.campos, createCampo()] } : s),
  }));
  const removeCampo = (sid, cid) => setForm((f) => ({
    ...f, secciones: f.secciones.map((s) => s._id === sid ? { ...s, campos: s.campos.filter((c) => c._id !== cid) } : s),
  }));
  const updateCampo = (sid, cid, patch) => setForm((f) => ({
    ...f, secciones: f.secciones.map((s) => s._id === sid
      ? { ...s, campos: s.campos.map((c) => c._id === cid ? { ...c, ...patch } : c) }
      : s),
  }));
  const moveCampo = (sid, cid, dir) => setForm((f) => {
    const secciones = f.secciones.map((s) => {
      if (s._id !== sid) return s;
      const arr = [...s.campos];
      const i = arr.findIndex((c) => c._id === cid);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...s, campos: arr };
    });
    return { ...f, secciones };
  });

  const plantillasFiltradas = plantillas.filter((p) => p.tipo_examen === tipoActivo);

  const msgClass = msgType === "error"
    ? "bg-red-50 text-red-700 border-red-200"
    : msgType === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className="min-h-screen px-4 py-8" style={{
      background: "radial-gradient(circle at top left, rgba(99,102,241,.12), transparent 30%), linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)"
    }}>
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-lg">
          <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600 px-6 py-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
              Configuración Imagenología
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Plantillas de Informes
            </h1>
            <p className="mt-1 text-sm text-indigo-100 max-w-2xl">
              Crea y edita plantillas por tipo de examen. El sistema elige automáticamente la correcta al redactar un informe según el tipo de orden (Ecografía, Rayos X o Tomografía).
            </p>
          </div>

          {/* Tipo tabs */}
          <div className="flex border-b border-slate-200">
            {TIPOS.map((t) => {
              const activas = plantillas.filter((p) => p.tipo_examen === t.key && Number(p.es_activa)).length;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTipoActivo(t.key); setMsg(""); }}
                  className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors flex-1 justify-center ${
                    tipoActivo === t.key
                      ? "border-indigo-600 text-indigo-700 bg-indigo-50"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base">{t.emoji}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    tipoActivo === t.key ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {activas}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Layout dos columnas ─────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">

          {/* ── Lista de plantillas ──────────────────────────────────────── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleNueva}
              className="w-full rounded-xl bg-indigo-600 text-white py-2.5 px-4 text-sm font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <span>+</span> Nueva plantilla
            </button>

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                Cargando...
              </div>
            ) : plantillasFiltradas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400 space-y-2">
                <div className="text-3xl">{TIPOS.find((t) => t.key === tipoActivo)?.emoji}</div>
                <p>No hay plantillas de {TIPOS.find((t) => t.key === tipoActivo)?.label}.</p>
                <p className="text-xs">Crea la primera con el botón de arriba.</p>
              </div>
            ) : (
              plantillasFiltradas.map((p) => (
                <div
                  key={p.id}
                  onClick={() => cargarPlantilla(p.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all select-none ${
                    form?.id === p.id
                      ? "border-indigo-400 bg-indigo-50 shadow-md"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-800 truncate">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{p.descripcion}</p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      Number(p.es_activa) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {Number(p.es_activa) ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Editor ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!form ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                <div className="text-5xl">📋</div>
                <p className="text-sm">Selecciona una plantilla o crea una nueva</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Título del editor */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">
                    {form.id === 0 ? "Nueva plantilla" : "Editando plantilla"}
                  </h2>
                  {form.id > 0 && (
                    <button
                      type="button"
                      onClick={() => handleToggleActiva({ id: form.id, nombre: form.nombre, tipo_examen: form.tipo_examen, descripcion: form.descripcion, es_activa: form.es_activa, estructura_json: form.id > 0 ? null : null })}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                        form.es_activa
                          ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                          : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      }`}
                    >
                      {form.es_activa ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </div>

                {/* ── Datos básicos ─────────────────────────────────────── */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Ej: Ecografía Abdominal Completa"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Tipo de examen</label>
                    <select
                      value={form.tipo_examen}
                      onChange={(e) => setForm((f) => ({ ...f, tipo_examen: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {TIPOS.map((t) => (
                        <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Estado</label>
                    <label className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={Boolean(form.es_activa)}
                        onChange={(e) => setForm((f) => ({ ...f, es_activa: e.target.checked ? 1 : 0 }))}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <span className="text-sm text-slate-700">
                        {form.es_activa ? "Activa (disponible en el sistema)" : "Inactiva (oculta del sistema)"}
                      </span>
                    </label>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={form.descripcion}
                      onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Descripción breve (opcional)"
                    />
                  </div>
                </div>

                {/* ── Builder de secciones ──────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-slate-800">
                      Secciones del informe
                    </h3>
                    <button
                      type="button"
                      onClick={addSeccion}
                      className="text-sm px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition"
                    >
                      + Agregar sección
                    </button>
                  </div>

                  <div className="space-y-4">
                    {form.secciones.map((sec, sIdx) => (
                      <div key={sec._id} className="border border-slate-200 rounded-xl overflow-hidden">
                        {/* Header de la sección */}
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 border-b border-slate-200">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveSeccion(sec._id, -1)}
                              disabled={sIdx === 0}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none"
                              title="Subir"
                            >▲</button>
                            <button
                              type="button"
                              onClick={() => moveSeccion(sec._id, 1)}
                              disabled={sIdx === form.secciones.length - 1}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none"
                              title="Bajar"
                            >▼</button>
                          </div>

                          <div className="flex-1 grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre de sección</label>
                              <input
                                type="text"
                                value={sec.nombre}
                                onChange={(e) => {
                                  const nombre = e.target.value;
                                  updateSeccion(sec._id, { nombre, id: sec.id || slugify(nombre) });
                                }}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="Hallazgos"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">
                                ID técnico
                                <span className="ml-1 text-slate-400 font-normal">(clave de datos)</span>
                              </label>
                              <input
                                type="text"
                                value={sec.id}
                                onChange={(e) => updateSeccion(sec._id, { id: slugify(e.target.value) })}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                placeholder="hallazgos"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeSeccion(sec._id)}
                            disabled={form.secciones.length <= 1}
                            className="ml-auto text-slate-400 hover:text-red-500 transition disabled:opacity-20 text-lg leading-none"
                            title="Eliminar sección"
                          >✕</button>
                        </div>

                        {/* Campos */}
                        <div className="p-4 space-y-2.5">
                          {sec.campos.map((campo, cIdx) => (
                            <div key={campo._id} className="flex gap-2 items-start bg-slate-50 rounded-lg border border-slate-100 p-3">
                              {/* Ordenar campo */}
                              <div className="flex flex-col gap-0.5 pt-5">
                                <button type="button" onClick={() => moveCampo(sec._id, campo._id, -1)} disabled={cIdx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none">▲</button>
                                <button type="button" onClick={() => moveCampo(sec._id, campo._id, 1)} disabled={cIdx === sec.campos.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none">▼</button>
                              </div>

                              <div className="flex-1 grid grid-cols-12 gap-2 min-w-0">
                                {/* Etiqueta */}
                                <div className="col-span-12 sm:col-span-4">
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Etiqueta</label>
                                  <input
                                    type="text"
                                    value={campo.label}
                                    onChange={(e) => {
                                      const label = e.target.value;
                                      updateCampo(sec._id, campo._id, { label, id: campo.id || slugify(label) });
                                    }}
                                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    placeholder="Hígado"
                                  />
                                </div>
                                {/* ID */}
                                <div className="col-span-6 sm:col-span-2">
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID</label>
                                  <input
                                    type="text"
                                    value={campo.id}
                                    onChange={(e) => updateCampo(sec._id, campo._id, { id: slugify(e.target.value) })}
                                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white text-slate-600 focus:outline-none focus:ring-1"
                                    placeholder="higado"
                                  />
                                </div>
                                {/* Tipo */}
                                <div className="col-span-6 sm:col-span-2">
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo</label>
                                  <select
                                    value={campo.type}
                                    onChange={(e) => updateCampo(sec._id, campo._id, { type: e.target.value })}
                                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none"
                                  >
                                    <option value="textarea">Texto largo</option>
                                    <option value="text">Texto corto</option>
                                    <option value="number">Número</option>
                                  </select>
                                </div>
                                {/* Placeholder */}
                                <div className="col-span-10 sm:col-span-3">
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Placeholder</label>
                                  <input
                                    type="text"
                                    value={campo.placeholder}
                                    onChange={(e) => updateCampo(sec._id, campo._id, { placeholder: e.target.value })}
                                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none"
                                    placeholder="Describe..."
                                  />
                                </div>
                                {/* Requerido */}
                                <div className="col-span-2 sm:col-span-1 flex items-end justify-center pb-1">
                                  <label className="flex flex-col items-center gap-1 cursor-pointer" title="Obligatorio">
                                    <span className="text-xs font-semibold text-slate-500">Req.</span>
                                    <input
                                      type="checkbox"
                                      checked={campo.required}
                                      onChange={(e) => updateCampo(sec._id, campo._id, { required: e.target.checked })}
                                      className="w-4 h-4 rounded text-indigo-600"
                                    />
                                  </label>
                                </div>
                              </div>

                              {/* Eliminar campo */}
                              <button
                                type="button"
                                onClick={() => removeCampo(sec._id, campo._id)}
                                disabled={sec.campos.length <= 1}
                                className="mt-5 text-slate-400 hover:text-red-500 transition disabled:opacity-20 flex-shrink-0 text-lg leading-none"
                                title="Eliminar campo"
                              >✕</button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => addCampo(sec._id)}
                            className="w-full py-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                          >
                            + Agregar campo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mensaje */}
                {msg && (
                  <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${msgClass}`}>
                    {msg}
                  </div>
                )}

                {/* Botón guardar */}
                <div className="flex gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleGuardar}
                    disabled={saving}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {saving ? "Guardando..." : "💾 Guardar plantilla"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setForm(null); setMsg(""); }}
                    className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
