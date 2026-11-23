import { useEffect, useMemo, useState } from "react";
import {
  actualizarExamenOcupacional,
  crearExamenOcupacional,
  guardarGrupoMaestroExamenOcupacional,
  importarExamenOcupacionalDesdeLaboratorio,
  listarCatalogoGruposExamenOcupacional,
  listarExamenesLaboratorioOrigenOcupacional,
} from "../../api/ocupacionalApi";

const initialForm = {
  codigo: "",
  descripcion: "",
  grupo_id: "",
  subgrupo_id: "",
  grupo: "",
  subgrupo: "",
  valores_normales: "",
  precio: "",
  posicion: "0",
};

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function repairMojibake(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/[ÃÂâ]/.test(text)) return text;

  const map = {
    "Ã¡": "á",
    "Ã©": "é",
    "Ã­": "í",
    "Ã³": "ó",
    "Ãº": "ú",
    "Ã±": "ñ",
    "Ã": "Á",
    "Ã‰": "É",
    "Ã": "Í",
    "Ã“": "Ó",
    "Ãš": "Ú",
    "Ã‘": "Ñ",
    "â€“": "-",
    "â€”": "-",
    "â€œ": '"',
    "â€": '"',
    "â€˜": "'",
    "â€™": "'",
    "BioquÃ�mica": "Bioquímica",
    "UroanÃ�lisis": "Uroanálisis",
    "HematologÃ�a": "Hematología",
    "InmunologÃ�a": "Inmunología",
    "QuÃ�mica": "Química",
    "LipÃ�dico": "Lipídico",
    "MÃ�S": "MÁS",
    "Ã�cido": "Ácido",
    "Ã�rico": "Úrico",
    "Ã�ricos": "Úricos",
    "Ãrico": "úrico",
    "Ãricos": "úricos",
  };

  let fixed = text;
  Object.entries(map).forEach(([bad, good]) => {
    fixed = fixed.split(bad).join(good);
  });
  fixed = fixed.replace(/Â/g, "");
  return fixed;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function validateForm(form) {
  const errors = {};

  if (!String(form.codigo || "").trim()) {
    errors.codigo = "El codigo es obligatorio.";
  }

  if (!String(form.descripcion || "").trim()) {
    errors.descripcion = "La descripcion es obligatoria.";
  }

  const precio = Number(form.precio);
  if (!Number.isFinite(precio) || precio < 0) {
    errors.precio = "El precio debe ser numerico y mayor o igual a 0.";
  }

  const posicion = Number(form.posicion || 0);
  if (!Number.isFinite(posicion) || posicion < 0) {
    errors.posicion = "La posicion debe ser un numero mayor o igual a 0.";
  }

  return errors;
}

export default function FormExamenOcupacional({ editing, onSaved, onCancel }) {
  const [form, setForm] = useState(initialForm);
  const [catalogoModo, setCatalogoModo] = useState("legacy_texto");
  const [catalogoGrupos, setCatalogoGrupos] = useState([]);
  const [catalogoSubgrupos, setCatalogoSubgrupos] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [labItems, setLabItems] = useState([]);
  const [labSearch, setLabSearch] = useState("");
  const [labSelectedId, setLabSelectedId] = useState("");
  const [labLoading, setLabLoading] = useState(false);
  const [labImporting, setLabImporting] = useState(false);
  const [labTotalEncontrado, setLabTotalEncontrado] = useState(0);
  const [labAutoSeleccionado, setLabAutoSeleccionado] = useState(false);

  const normalizeKey = (value) => normalizeSearchText(repairMojibake(value));

  const aplicarCatalogo = (data) => {
    const modo = String(data?.modo || "legacy_texto");
    setCatalogoModo(modo);

    if (modo === "maestro") {
      const grupos = Array.isArray(data?.grupos) ? data.grupos : [];
      const subMap = data?.subgrupos_por_grupo && typeof data.subgrupos_por_grupo === "object" ? data.subgrupos_por_grupo : {};
      setCatalogoGrupos(grupos);
      setCatalogoSubgrupos(subMap);
      return;
    }

    const gruposTexto = Array.isArray(data?.grupos) ? data.grupos : [];
    const subMapTexto = data?.subgrupos_por_grupo && typeof data.subgrupos_por_grupo === "object" ? data.subgrupos_por_grupo : {};

    const gruposCompat = gruposTexto.map((nombre, idx) => ({ id: idx + 1, nombre: String(nombre || "") })).filter((g) => g.nombre !== "");
    const subCompat = {};
    gruposCompat.forEach((g) => {
      const subs = Array.isArray(subMapTexto[g.nombre]) ? subMapTexto[g.nombre] : [];
      subCompat[String(g.id)] = subs.map((s, idx) => ({ id: idx + 1, nombre: String(s || "") })).filter((s) => s.nombre !== "");
    });

    setCatalogoGrupos(gruposCompat);
    setCatalogoSubgrupos(subCompat);
  };

  const loadCatalogo = async () => {
    const data = await listarCatalogoGruposExamenOcupacional();
    aplicarCatalogo(data || {});
  };

  useEffect(() => {
    let canceled = false;

    async function bootCatalogo() {
      try {
        const data = await listarCatalogoGruposExamenOcupacional();
        if (canceled) return;
        aplicarCatalogo(data || {});
      } catch {
        if (canceled) return;
        setCatalogoModo("legacy_texto");
        setCatalogoGrupos([]);
        setCatalogoSubgrupos({});
      }
    }

    bootCatalogo();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    async function cargarLaboratorio() {
      setLabLoading(true);
      try {
        const payload = await listarExamenesLaboratorioOrigenOcupacional({ q: labSearch, page: 1, perPage: 120 });
        if (canceled) return;
        const normalized = Array.isArray(payload?.data)
          ? payload.data.map((item) => ({
              ...item,
              nombre: repairMojibake(item?.nombre),
              categoria: repairMojibake(item?.categoria),
              metodologia: repairMojibake(item?.metodologia),
            }))
          : [];
        const q = String(labSearch || "").trim();
        const tokens = normalizeSearchText(q).split(/\s+/).filter(Boolean);
        const filtered = tokens.length === 0
          ? normalized
          : normalized.filter((item) => {
              const haystack = normalizeSearchText(`${item?.nombre || ""} ${item?.categoria || ""} ${item?.metodologia || ""}`);
              return tokens.every((tk) => haystack.includes(tk));
            });

        setLabItems(filtered);
        setLabTotalEncontrado(tokens.length === 0 ? Number(payload?.meta?.total || normalized.length || 0) : filtered.length);

        if (q !== "" && filtered.length === 1) {
          setLabSelectedId(String(filtered[0].id));
          setLabAutoSeleccionado(true);
        } else {
          setLabAutoSeleccionado(false);
          if (!filtered.some((item) => String(item.id) === String(labSelectedId))) {
            setLabSelectedId("");
          }
        }
      } catch {
        if (canceled) return;
        setLabItems([]);
        setLabTotalEncontrado(0);
        setLabAutoSeleccionado(false);
      } finally {
        if (!canceled) setLabLoading(false);
      }
    }
    const timer = window.setTimeout(cargarLaboratorio, 250);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [labSearch]);

  useEffect(() => {
    if (editing && typeof editing === "object") {
      setForm({
        codigo: String(editing.codigo || ""),
        descripcion: repairMojibake(String(editing.descripcion || "")),
        grupo_id: "",
        subgrupo_id: "",
        grupo: repairMojibake(String(editing.grupo || "")),
        subgrupo: repairMojibake(String(editing.subgrupo || "")),
        valores_normales: repairMojibake(String(editing.valores_normales || "")),
        precio: String(editing.precio ?? "0"),
        posicion: String(editing.posicion ?? "0"),
      });
      setErrors({});
      setServerError("");
      setServerMessage("");
    } else {
      setForm(initialForm);
      setErrors({});
      setServerError("");
      setServerMessage("");
    }
  }, [editing]);

  const isEditing = Boolean(editing && editing.id);

  useEffect(() => {
    const grupoNombre = String(form.grupo || "").trim();
    if (!grupoNombre || catalogoGrupos.length === 0) return;

    const grupoFound = catalogoGrupos.find((g) => normalizeKey(g.nombre) === normalizeKey(grupoNombre));
    if (!grupoFound) return;

    if (String(form.grupo_id || "") !== String(grupoFound.id)) {
      setForm((prev) => ({ ...prev, grupo_id: String(grupoFound.id) }));
    }

    const subNombre = String(form.subgrupo || "").trim();
    if (!subNombre) return;
    const subs = Array.isArray(catalogoSubgrupos[String(grupoFound.id)]) ? catalogoSubgrupos[String(grupoFound.id)] : [];
    const subFound = subs.find((s) => normalizeKey(s.nombre) === normalizeKey(subNombre));
    if (subFound && String(form.subgrupo_id || "") !== String(subFound.id)) {
      setForm((prev) => ({ ...prev, subgrupo_id: String(subFound.id) }));
    }
  }, [catalogoGrupos, catalogoSubgrupos, form.grupo, form.subgrupo, form.grupo_id, form.subgrupo_id]);

  const isValid = useMemo(() => Object.keys(validateForm(form)).length === 0, [form]);

  const subgruposSugeridos = useMemo(() => {
    const grupoId = String(form.grupo_id || "").trim();
    if (!grupoId) return [];
    const subs = catalogoSubgrupos[grupoId];
    const normalizados = Array.isArray(subs) ? [...subs] : [];

    const subgrupoActual = String(form.subgrupo || "").trim();
    if (!subgrupoActual) {
      return normalizados;
    }

    const existe = normalizados.some((s) => normalizeKey(s.nombre) === normalizeKey(subgrupoActual));
    if (!existe) {
      normalizados.unshift({ id: "__legacy_current__", nombre: subgrupoActual, esLegacy: true });
    }
    return normalizados;
  }, [form.grupo_id, form.subgrupo, catalogoSubgrupos]);

  useEffect(() => {
    if (!form.grupo_id || !form.subgrupo || form.subgrupo_id) return;
    const legacy = subgruposSugeridos.find((s) => String(s.id) === "__legacy_current__");
    if (legacy) {
      setForm((prev) => ({ ...prev, subgrupo_id: "__legacy_current__" }));
    }
  }, [form.grupo_id, form.subgrupo, form.subgrupo_id, subgruposSugeridos]);

  const onChangeGrupo = (event) => {
    const grupoId = String(event.target.value || "");
    const grupoObj = catalogoGrupos.find((g) => String(g.id) === grupoId);
    setForm((prev) => ({
      ...prev,
      grupo_id: grupoId,
      grupo: grupoObj ? String(grupoObj.nombre || "") : "",
      subgrupo_id: "",
      subgrupo: "",
    }));
    setServerError("");
    setServerMessage("");
  };

  const onChangeSubgrupo = (event) => {
    const subId = String(event.target.value || "");
    const subObj = subgruposSugeridos.find((s) => String(s.id) === subId);
    setForm((prev) => ({
      ...prev,
      subgrupo_id: subId,
      subgrupo: subObj ? repairMojibake(String(subObj.nombre || "")) : "",
    }));
    setServerError("");
    setServerMessage("");
  };

  const onNuevoGrupo = async () => {
    if (catalogoModo !== "maestro") {
      setServerError("Para crear grupos en maestro primero ejecute la migracion 20260724_0011.");
      return;
    }
    const nombre = window.prompt("Nombre del nuevo grupo:", "");
    if (!nombre || !nombre.trim()) return;
    try {
      await guardarGrupoMaestroExamenOcupacional({ nivel: "grupo", nombre: nombre.trim() });
      await loadCatalogo();
      setServerMessage("Grupo registrado correctamente.");
    } catch (error) {
      setServerError(error.message || "No se pudo crear el grupo");
    }
  };

  const onNuevoSubgrupo = async () => {
    if (catalogoModo !== "maestro") {
      setServerError("Para crear subgrupos en maestro primero ejecute la migracion 20260724_0011.");
      return;
    }
    const grupoId = Number(form.grupo_id || 0);
    if (grupoId <= 0) {
      setServerError("Seleccione primero un grupo para registrar subgrupo.");
      return;
    }
    const nombre = window.prompt("Nombre del nuevo subgrupo:", "");
    if (!nombre || !nombre.trim()) return;
    try {
      const created = await guardarGrupoMaestroExamenOcupacional({ nivel: "subgrupo", nombre: nombre.trim(), parentId: grupoId });
      await loadCatalogo();
      setForm((prev) => ({ ...prev, subgrupo_id: String(created.id || ""), subgrupo: String(created.nombre || "") }));
      setServerMessage("Subgrupo registrado correctamente.");
    } catch (error) {
      setServerError(error.message || "No se pudo crear el subgrupo");
    }
  };

  const onChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setServerError("");
    setServerMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const currentErrors = validateForm(form);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) {
      return;
    }

    setLoading(true);
    setServerError("");
    setServerMessage("");

    const payload = {
      codigo: String(form.codigo || "").trim().toUpperCase(),
      descripcion: String(form.descripcion || "").trim(),
      grupo_id: Number(form.grupo_id || 0),
      subgrupo_id: Number(form.subgrupo_id || 0),
      grupo: String(form.grupo || "").trim(),
      subgrupo: String(form.subgrupo || "").trim(),
      valores_normales: String(form.valores_normales || "").trim(),
      precio: normalizeNumber(form.precio),
      posicion: Math.trunc(normalizeNumber(form.posicion)),
    };

    try {
      if (isEditing) {
        await actualizarExamenOcupacional({ id: Number(editing.id), ...payload });
      } else {
        await crearExamenOcupacional(payload);
      }

      setServerMessage(isEditing ? "Examen actualizado correctamente." : "Examen creado correctamente.");

      if (!isEditing) {
        setForm(initialForm);
      }

      if (typeof onSaved === "function") {
        onSaved();
      }
    } catch (error) {
      setServerError(error.message || "No se pudo guardar el examen.");
    } finally {
      setLoading(false);
    }
  };

  const handleImportarLaboratorio = async () => {
    const laboratorioExamenId = Number(labSelectedId || 0);
    if (laboratorioExamenId <= 0) {
      setServerError("Seleccione un examen de laboratorio para importar.");
      return;
    }

    setLabImporting(true);
    setServerError("");
    setServerMessage("");
    try {
      const selected = labItems.find((it) => Number(it.id) === laboratorioExamenId);
      const precio = selected && Number.isFinite(Number(selected.precio_publico)) ? Number(selected.precio_publico) : null;
      await importarExamenOcupacionalDesdeLaboratorio({
        laboratorioExamenId,
        grupoId: Number(form.grupo_id || 0),
        subgrupoId: Number(form.subgrupo_id || 0),
        grupo: String(form.grupo || "LABORATORIO").trim() || "LABORATORIO",
        subgrupo: String(form.subgrupo || "").trim(),
        codigo: String(form.codigo || "").trim(),
        precio,
        posicion: Math.trunc(normalizeNumber(form.posicion || 0)),
      });
      setServerMessage("Examen importado desde laboratorio moderno correctamente.");
      if (typeof onSaved === "function") {
        onSaved();
      }
    } catch (error) {
      setServerError(error.message || "No se pudo importar el examen desde laboratorio.");
    } finally {
      setLabImporting(false);
    }
  };

  const examenSeleccionado = useMemo(
    () => labItems.find((item) => String(item.id) === String(labSelectedId)) || null,
    [labItems, labSelectedId]
  );

  const puedeImportarLab = !labLoading && !labImporting && Number(labSelectedId || 0) > 0;

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">
        {isEditing ? "Editar Examen General" : "Nuevo Examen General"}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Replica del maestro de examenes ocupacionales del sistema anterior.
      </p>

      <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <p className="text-sm font-semibold text-indigo-900">Importar desde laboratorio moderno</p>
        <p className="mt-1 text-xs text-indigo-700">
          Usa el catálogo clínico moderno para inyectar parámetros y referencias en el examen ocupacional.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input
            className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm"
            placeholder="Buscar examen de laboratorio"
            value={labSearch}
            onChange={(event) => setLabSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm"
            value={labSelectedId}
            onChange={(event) => setLabSelectedId(event.target.value)}
            disabled={labLoading || labImporting}
          >
            <option value="">Seleccionar examen de laboratorio</option>
            {labItems.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.nombre} {item.categoria ? `- ${item.categoria}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={handleImportarLaboratorio}
            disabled={!puedeImportarLab}
          >
            {labImporting ? "Importando..." : (examenSeleccionado ? "Importar examen seleccionado" : "Seleccione un examen")}
          </button>
        </div>
        <p className="mt-2 text-xs text-indigo-700">
          {labLoading
            ? "Buscando examenes..."
            : labSearch.trim() === ""
              ? `Mostrando ${labItems.length} examenes recientes. Escriba para filtrar.`
              : labItems.length > 0
                ? `Se encontraron ${labTotalEncontrado} coincidencias para "${labSearch.trim()}".`
                : `No se encontraron coincidencias para "${labSearch.trim()}". Pruebe con menos palabras (ejemplo: hemogra).`}
        </p>
        {examenSeleccionado ? (
          <p className="mt-1 text-xs text-emerald-700">
            {labAutoSeleccionado ? "Seleccionado automaticamente:" : "Seleccionado:"} {examenSeleccionado.nombre}
            {examenSeleccionado.categoria ? ` - ${examenSeleccionado.categoria}` : ""}
          </p>
        ) : null}
      </div>

      <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Codigo *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={form.codigo}
            onChange={onChange("codigo")}
            placeholder="EV_0001"
            maxLength={50}
          />
          {errors.codigo ? <p className="mt-1 text-xs text-red-600">{errors.codigo}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Descripcion *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={form.descripcion}
            onChange={onChange("descripcion")}
            placeholder="EVALUACION MEDICA"
            maxLength={160}
          />
          {errors.descripcion ? <p className="mt-1 text-xs text-red-600">{errors.descripcion}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Grupo</label>
          <div className="flex gap-2">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              value={form.grupo_id}
              onChange={onChangeGrupo}
            >
              <option value="">SELECCIONAR</option>
              {catalogoGrupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onNuevoGrupo}
            >
              Nuevo
            </button>
          </div>
          {form.grupo && !form.grupo_id ? (
            <p className="mt-1 text-xs text-amber-700">Grupo actual no mapeado en maestro: {form.grupo}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Subgrupo</label>
          <div className="flex gap-2">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              value={form.subgrupo_id}
              onChange={onChangeSubgrupo}
              disabled={!form.grupo_id}
            >
              <option value="">SELECCIONAR</option>
              {subgruposSugeridos.map((s) => (
                <option key={s.id} value={s.id}>{s.esLegacy ? `${s.nombre} (actual)` : s.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={onNuevoSubgrupo}
              disabled={!form.grupo_id}
            >
              Nuevo
            </button>
          </div>
          {form.subgrupo && !form.subgrupo_id ? (
            <p className="mt-1 text-xs text-amber-700">Subgrupo actual no mapeado en maestro: {form.subgrupo}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Precio *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={form.precio}
            onChange={onChange("precio")}
            placeholder="0.00"
          />
          {errors.precio ? <p className="mt-1 text-xs text-red-600">{errors.precio}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Posicion</label>
          <input
            type="number"
            min="0"
            step="1"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={form.posicion}
            onChange={onChange("posicion")}
          />
          {errors.posicion ? <p className="mt-1 text-xs text-red-600">{errors.posicion}</p> : null}
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Valores Normales</label>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            rows={3}
            value={form.valores_normales}
            onChange={onChange("valores_normales")}
            placeholder="Rango de referencia o descripcion de valores normales"
          />
        </div>

        {serverMessage ? <p className="md:col-span-2 text-sm text-emerald-600">{serverMessage}</p> : null}
        {serverError ? <p className="md:col-span-2 text-sm text-red-600">{serverError}</p> : null}

        <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar edicion
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!isValid || loading}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar examen"}
          </button>
        </div>
      </form>
    </div>
  );
}
