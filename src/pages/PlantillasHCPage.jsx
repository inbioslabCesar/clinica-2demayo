import { useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../config/config";

const DEFAULT_TEMPLATE_OPTIONS = [
  { id: "default", nombre: "Por defecto (todas las especialidades)" },
  { id: "medicina_general", nombre: "Medicina General" },
  { id: "ginecologia", nombre: "Ginecologia" },
  { id: "pediatria", nombre: "Pediatria" },
];

const DEFAULT_FIELDS_TEXT =
  "anamnesis.tiempo_enfermedad\nanamnesis.forma_inicio\nanamnesis.curso\ngineco_obstetricos.fur\ngineco_obstetricos.gestas\ngineco_obstetricos.partos\ngineco_obstetricos.cesareas\nexamen_fisico.examen_fisico\nplan.tratamiento";

let localIdCounter = 0;

function createLocalId(prefix = "item") {
  localIdCounter += 1;
  return `${prefix}_${localIdCounter}`;
}

function normalizeKeySegment(value, fallback = "campo") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || fallback;
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createFieldDraft(title = "Nuevo campo") {
  return { id: createLocalId("field"), title };
}

function createSectionDraft(title = "Nueva seccion") {
  return {
    id: createLocalId("section"),
    title,
    fields: [createFieldDraft()],
  };
}

function sectionToLineEntries(sections = {}) {
  const lines = [];
  Object.entries(sections || {}).forEach(([sectionKey, fields]) => {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return;
    Object.keys(fields).forEach((fieldKey) => {
      lines.push(`${sectionKey}.${fieldKey}`);
    });
  });
  return lines.join("\n");
}

function linesToSections(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = {};
  lines.forEach((line) => {
    const [sectionRaw, ...fieldParts] = line.split(".");
    const fieldRaw = fieldParts.join(".");
    const sectionKey = String(sectionRaw || "").trim().toLowerCase();
    const fieldKey = String(fieldRaw || "").trim().toLowerCase();
    if (!sectionKey || !fieldKey) return;
    if (!sections[sectionKey]) sections[sectionKey] = {};
    sections[sectionKey][fieldKey] = "";
  });

  return sections;
}

function sectionsToBuilder(sections = {}) {
  return Object.entries(sections || {}).reduce((accumulator, [sectionKey, fields]) => {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return accumulator;

    const fieldDrafts = Object.keys(fields).map((fieldKey) => ({
      id: createLocalId("field"),
      title: humanizeKey(fieldKey),
    }));

    accumulator.push({
      id: createLocalId("section"),
      title: humanizeKey(sectionKey),
      fields: fieldDrafts.length > 0 ? fieldDrafts : [createFieldDraft()],
    });

    return accumulator;
  }, []);
}

function builderToSections(builderSections = []) {
  return builderSections.reduce((accumulator, section, sectionIndex) => {
    const sectionKey = normalizeKeySegment(section.title, `seccion_${sectionIndex + 1}`);
    const uniqueFields = {};

    (section.fields || []).forEach((field, fieldIndex) => {
      const fieldKey = normalizeKeySegment(field.title, `campo_${fieldIndex + 1}`);
      if (!uniqueFields[fieldKey]) {
        uniqueFields[fieldKey] = "";
      }
    });

    if (Object.keys(uniqueFields).length > 0) {
      accumulator[sectionKey] = uniqueFields;
    }

    return accumulator;
  }, {});
}

function validateBuilderSections(builderSections = []) {
  const errors = [];
  const usedSectionKeys = new Set();

  builderSections.forEach((section, sectionIndex) => {
    const rawSectionTitle = String(section.title || "").trim();
    const sectionKey = normalizeKeySegment(rawSectionTitle, `seccion_${sectionIndex + 1}`);

    if (!rawSectionTitle) {
      errors.push(`La seccion ${sectionIndex + 1} no tiene titulo.`);
    }

    if (usedSectionKeys.has(sectionKey)) {
      errors.push(`La seccion "${humanizeKey(sectionKey)}" esta repetida.`);
    }
    usedSectionKeys.add(sectionKey);

    if (!Array.isArray(section.fields) || section.fields.length === 0) {
      errors.push(`La seccion "${rawSectionTitle || `Seccion ${sectionIndex + 1}`}" debe tener al menos un campo.`);
      return;
    }

    const usedFieldKeys = new Set();
    section.fields.forEach((field, fieldIndex) => {
      const rawFieldTitle = String(field.title || "").trim();
      const fieldKey = normalizeKeySegment(rawFieldTitle, `campo_${fieldIndex + 1}`);

      if (!rawFieldTitle) {
        errors.push(`La seccion "${rawSectionTitle || `Seccion ${sectionIndex + 1}`}" tiene un campo sin titulo.`);
      }

      if (usedFieldKeys.has(fieldKey)) {
        errors.push(
          `El campo "${humanizeKey(fieldKey)}" esta repetido en la seccion "${rawSectionTitle || `Seccion ${sectionIndex + 1}`}".`
        );
      }
      usedFieldKeys.add(fieldKey);
    });
  });

  return errors;
}

function moveItem(items, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [current] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, current);
  return next;
}

export default function PlantillasHCPage() {
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [templateOptions, setTemplateOptions] = useState(DEFAULT_TEMPLATE_OPTIONS);

  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    try { return localStorage.getItem("hcPlantillaSeleccionada") || "ginecologia"; } catch { return "ginecologia"; }
  });
  const [templateId, setTemplateId] = useState("ginecologia");
  const [nombre, setNombre] = useState("Ginecologia");
  const [version, setVersion] = useState("2026.04.01");
  const [schemaVersion, setSchemaVersion] = useState("2.0");
  const [clinicKey, setClinicKey] = useState("");
  const [fieldsText, setFieldsText] = useState(DEFAULT_FIELDS_TEXT);
  const [builderSections, setBuilderSections] = useState(() =>
    sectionsToBuilder(linesToSections(DEFAULT_FIELDS_TEXT))
  );
  const [advancedMode, setAdvancedMode] = useState(false);
  const [rawDirty, setRawDirty] = useState(false);
  const [isDraftTemplate, setIsDraftTemplate] = useState(false);

  const builtInIds = useMemo(
    () => new Set(DEFAULT_TEMPLATE_OPTIONS.map((item) => item.id)),
    []
  );

  const templateSections = useMemo(
    () => builderToSections(builderSections),
    [builderSections]
  );

  const previewLines = useMemo(() => {
    const rawLines = sectionToLineEntries(templateSections);
    return rawLines ? rawLines.split("\n") : [];
  }, [templateSections]);

  const sectionCount = builderSections.length;
  const fieldCount = builderSections.reduce(
    (total, section) => total + (section.fields?.length || 0),
    0
  );

  const setStatusMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  const loadTemplateList = useMemo(
    () => async () => {
      setLoadingList(true);
      setMessage("");
      setMessageType("info");
      try {
        const res = await fetch(`${BASE_URL}api_hc_templates.php?mode=list`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "No se pudo cargar lista de plantillas");
        }

        const merged = new Map();
        DEFAULT_TEMPLATE_OPTIONS.forEach((tpl) => merged.set(tpl.id, tpl));
        (data.items || []).forEach((item) => {
          const id = String(item.template_id || "").trim();
          if (!id) return;
          merged.set(id, { id, nombre: item.nombre || id });
        });

        setTemplateOptions(Array.from(merged.values()));
        setClinicKey(data.clinic_key || "");
      } catch (err) {
        setMessage(`Error cargando plantillas: ${err.message}`);
        setMessageType("error");
      } finally {
        setLoadingList(false);
      }
    },
    []
  );

  const loadTemplate = useMemo(
    () => async (selectedTemplateValue) => {
      setMessage("");
      setMessageType("info");
      try {
        const res = await fetch(
          `${BASE_URL}api_hc_templates.php?template_id=${encodeURIComponent(selectedTemplateValue)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (!data.success || !data.template) {
          throw new Error(data.error || "No se pudo cargar la plantilla");
        }

        const tpl = data.template;
        const sections = tpl.sections || {};
        setTemplateId(tpl.id || selectedTemplateValue);
        setSelectedTemplateId(tpl.id || selectedTemplateValue);
        setNombre(tpl.nombre || selectedTemplateValue);
        setVersion(tpl.version || "2026.04.01");
        setSchemaVersion(tpl.schema_version || "2.0");
        setFieldsText(sectionToLineEntries(sections));
        setBuilderSections(sectionsToBuilder(sections));
        setRawDirty(false);
        setIsDraftTemplate(false);
      } catch (err) {
        setMessage(`Error cargando plantilla: ${err.message}`);
        setMessageType("error");
      }
    },
    []
  );

  useEffect(() => {
    loadTemplateList();
  }, [loadTemplateList]);

  useEffect(() => {
    if (!selectedTemplateId || isDraftTemplate) return;
    try { localStorage.setItem("hcPlantillaSeleccionada", selectedTemplateId); } catch (ignored) { void ignored; }
    loadTemplate(selectedTemplateId);
  }, [selectedTemplateId, isDraftTemplate, loadTemplate]);

  useEffect(() => {
    if (rawDirty) return;
    setFieldsText(sectionToLineEntries(templateSections));
  }, [templateSections, rawDirty]);

  const updateSectionTitle = (sectionId, title) => {
    setBuilderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId ? { ...section, title } : section
      )
    );
  };

  const removeSection = (sectionId) => {
    setBuilderSections((prev) => prev.filter((section) => section.id !== sectionId));
  };

  const addSection = () => {
    setBuilderSections((prev) => [...prev, createSectionDraft()]);
  };

  const moveSection = (sectionIndex, direction) => {
    setBuilderSections((prev) => moveItem(prev, sectionIndex, sectionIndex + direction));
  };

  const addField = (sectionId) => {
    setBuilderSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, fields: [...section.fields, createFieldDraft()] }
          : section
      )
    );
  };

  const updateFieldTitle = (sectionId, fieldId, title) => {
    setBuilderSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.id === fieldId ? { ...field, title } : field
          ),
        };
      })
    );
  };

  const removeField = (sectionId, fieldId) => {
    setBuilderSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.filter((field) => field.id !== fieldId),
        };
      })
    );
  };

  const moveField = (sectionId, fieldIndex, direction) => {
    setBuilderSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: moveItem(section.fields, fieldIndex, fieldIndex + direction),
        };
      })
    );
  };

  const handleApplyRawText = () => {
    const parsedSections = linesToSections(fieldsText);
    const nextBuilder = sectionsToBuilder(parsedSections);
    const validationErrors = validateBuilderSections(nextBuilder);

    if (validationErrors.length > 0) {
      setStatusMessage(validationErrors[0], "error");
      return;
    }

    if (Object.keys(parsedSections).length === 0) {
      setStatusMessage(
        "Debes ingresar al menos un campo en formato seccion.campo.",
        "error"
      );
      return;
    }

    setBuilderSections(nextBuilder);
    setRawDirty(false);
    setStatusMessage("Editor tecnico aplicado al constructor visual.", "success");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage("");

    try {
      const draftBuilder =
        advancedMode && rawDirty ? sectionsToBuilder(linesToSections(fieldsText)) : builderSections;
      const validationErrors = validateBuilderSections(draftBuilder);

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      const sections = builderToSections(draftBuilder);
      if (Object.keys(sections).length === 0) {
        throw new Error("Debes agregar al menos una seccion con campos.");
      }

      const payload = {
        template_id: templateId.trim(),
        nombre: nombre.trim(),
        version: version.trim(),
        schema_version: schemaVersion.trim() || "2.0",
        clinic_key: clinicKey.trim(),
        activo: 1,
        sections,
      };

      const res = await fetch(`${BASE_URL}api_hc_templates.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo guardar");
      }

      setBuilderSections(draftBuilder);
      setFieldsText(sectionToLineEntries(sections));
      setRawDirty(false);
      setIsDraftTemplate(false);
      setStatusMessage("Plantilla guardada correctamente.", "success");
      await loadTemplateList();
      await loadTemplate(templateId);
    } catch (err) {
      setStatusMessage(`No se pudo guardar: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustom = () => {
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
      ts.getDate()
    ).padStart(2, "0")}${String(ts.getHours()).padStart(2, "0")}${String(
      ts.getMinutes()
    ).padStart(2, "0")}`;
    const newId = `plantilla_${stamp}`;
    const defaultSections = linesToSections(
      "motivo_consulta.descripcion\nanamnesis.tiempo_enfermedad\nexamen_fisico.examen_general\nplan.tratamiento"
    );

    setSelectedTemplateId(newId);
    setTemplateId(newId);
    setNombre("Nueva Plantilla HC");
    setVersion("2026.04.01");
    setSchemaVersion("2.0");
    setBuilderSections(sectionsToBuilder(defaultSections));
    setFieldsText(sectionToLineEntries(defaultSections));
    setRawDirty(false);
    setAdvancedMode(false);
    setIsDraftTemplate(true);
    setStatusMessage("Borrador listo. Agrega secciones y campos antes de guardar.", "info");
    if (!builtInIds.has(newId)) {
      setTemplateOptions((prev) => {
        if (prev.some((item) => item.id === newId)) return prev;
        return [...prev, { id: newId, nombre: "Nueva Plantilla HC" }];
      });
    }
  };

  const messageClasses =
    messageType === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : messageType === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 26%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 24%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_70px_-32px_rgba(15,23,42,0.35)]">
          <div className="grid gap-6 border-b border-slate-100 bg-[linear-gradient(135deg,#0f172a_0%,#164e63_55%,#fde68a_160%)] px-6 py-7 text-white lg:grid-cols-[1.4fr_0.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100">
                Configuracion HC
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">
                Constructor visual de plantillas clinicas
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-100/90">
                Organiza secciones y campos sin escribir claves tecnicas a mano. El sistema seguira guardando la plantilla en el mismo formato que ya consume la HC.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 self-start">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-100">Secciones</p>
                <p className="mt-2 text-3xl font-black">{sectionCount}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-100">Campos</p>
                <p className="mt-2 text-3xl font-black">{fieldCount}</p>
              </div>
              <div className="col-span-2 rounded-2xl border border-white/20 bg-slate-950/25 p-4 text-sm text-slate-100">
                Flujo actual: guardas la plantilla, abres la consulta, ingresas a la HC y aparecen los campos sugeridos de forma automatica.
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6 p-6">
            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Plantilla activa
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-800">Datos generales</h2>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCreateCustom}
                        className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                      >
                        Nueva plantilla
                      </button>
                      <button
                        type="button"
                        onClick={() => loadTemplate(selectedTemplateId)}
                        disabled={!selectedTemplateId || isDraftTemplate}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Recargar
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Plantilla</label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        disabled={loadingList}
                      >
                        {templateOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre} ({item.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">ID tecnico</label>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-700"
                        value={templateId}
                        readOnly
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Se genera al crear una plantilla nueva para evitar errores de identificacion.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Nombre visible</label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej: Ginecologia"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Version</label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="2026.04.01"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Schema version</label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        value={schemaVersion}
                        onChange={(e) => setSchemaVersion(e.target.value)}
                        placeholder="2.0"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Clinic key</label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        value={clinicKey}
                        onChange={(e) => setClinicKey(e.target.value)}
                        placeholder="clave de clinica (opcional)"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Si mantienes esta clave, la plantilla se guarda como override para la clinica actual.
                      </p>
                    </div>
                  </div>

                  {templateId === "default" && (
                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                      <p className="text-sm font-semibold text-emerald-900">
                        Plantilla por defecto activa
                      </p>
                      <p className="mt-1 text-sm text-emerald-800/80">
                        Si guardas esta plantilla, el sistema la usara para <strong>todas las consultas</strong> sin importar la especialidad del medico. Para volver al modo por especialidad, elimina esta plantilla de la base de datos o dejala sin guardar.
                      </p>
                      <ul className="mt-3 space-y-1 text-xs text-emerald-700">
                        <li>• Prioridad: <strong>Por defecto</strong> &gt; Por especialidad &gt; Medicina general</li>
                        <li>• Solo aplica cuando <em>no</em> hay un template_id explicito en la HC ya guardada.</li>
                      </ul>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Builder visual
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-800">
                        Secciones y campos sugeridos
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Escribe titulos legibles y el sistema generara las claves tecnicas automaticamente.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={addSection}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Agregar seccion
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvancedMode((prev) => !prev)}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                      >
                        {advancedMode ? "Ocultar editor tecnico" : "Mostrar editor tecnico"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {builderSections.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                        <p className="text-base font-semibold text-slate-700">
                          La plantilla todavia no tiene secciones.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Crea la primera seccion para empezar a modelar la HC sugerida.
                        </p>
                      </div>
                    )}

                    {builderSections.map((section, sectionIndex) => {
                      const sectionKeyPreview = normalizeKeySegment(
                        section.title,
                        `seccion_${sectionIndex + 1}`
                      );

                      return (
                        <div
                          key={section.id}
                          className="overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm"
                        >
                          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <label className="mb-1 block text-sm font-semibold text-slate-700">
                                Titulo de la seccion
                              </label>
                              <input
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                value={section.title}
                                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                                placeholder="Ej: Gineco obstetricos"
                              />
                              <p className="mt-2 text-xs text-slate-500">
                                Clave generada: <span className="font-mono text-slate-700">{sectionKeyPreview}</span>
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => moveSection(sectionIndex, -1)}
                                disabled={sectionIndex === 0}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Subir
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSection(sectionIndex, 1)}
                                disabled={sectionIndex === builderSections.length - 1}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Bajar
                              </button>
                              <button
                                type="button"
                                onClick={() => addField(section.id)}
                                className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100"
                              >
                                Agregar campo
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSection(section.id)}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                Eliminar seccion
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3 px-5 py-4">
                            {section.fields.map((field, fieldIndex) => {
                              const fieldKeyPreview = normalizeKeySegment(
                                field.title,
                                `campo_${fieldIndex + 1}`
                              );

                              return (
                                <div
                                  key={field.id}
                                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_auto]"
                                >
                                  <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                      Titulo del campo
                                    </label>
                                    <input
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                      value={field.title}
                                      onChange={(e) =>
                                        updateFieldTitle(section.id, field.id, e.target.value)
                                      }
                                      placeholder="Ej: Tiempo de enfermedad"
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                      Clave generada: <span className="font-mono text-slate-700">{sectionKeyPreview}.{fieldKeyPreview}</span>
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-start gap-2 lg:w-[220px] lg:justify-end">
                                    <button
                                      type="button"
                                      onClick={() => moveField(section.id, fieldIndex, -1)}
                                      disabled={fieldIndex === 0}
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Subir
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveField(section.id, fieldIndex, 1)}
                                      disabled={fieldIndex === section.fields.length - 1}
                                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Bajar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeField(section.id, field.id)}
                                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {advancedMode && (
                    <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">Editor tecnico</p>
                          <p className="text-sm text-amber-800/80">
                            Utilo si quieres controlar manualmente claves exactas en formato seccion.campo.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyRawText}
                          className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                        >
                          Aplicar al builder
                        </button>
                      </div>

                      <textarea
                        className="mt-4 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                        rows={12}
                        value={fieldsText}
                        onChange={(e) => {
                          setFieldsText(e.target.value);
                          setRawDirty(true);
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar plantilla"}
                  </button>
                  {message && (
                    <div
                      className={`flex min-h-[48px] items-center rounded-xl border px-4 py-3 text-sm ${messageClasses}`}
                    >
                      {message}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Vista previa
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-800">Como quedara la estructura</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Esta vista resume la plantilla tal como sera interpretada por el resolutor de HC.
                  </p>

                  <div className="mt-5 space-y-4">
                    {builderSections.map((section, sectionIndex) => {
                      const sectionKey = normalizeKeySegment(
                        section.title,
                        `seccion_${sectionIndex + 1}`
                      );

                      return (
                        <div key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {section.title || `Seccion ${sectionIndex + 1}`}
                              </p>
                              <p className="font-mono text-xs text-slate-500">{sectionKey}</p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                              {section.fields.length} campo(s)
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {section.fields.map((field, fieldIndex) => (
                              <span
                                key={field.id}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                              >
                                {normalizeKeySegment(field.title, `campo_${fieldIndex + 1}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-100 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
                    Salida tecnica
                  </p>
                  <h2 className="mt-2 text-xl font-bold">Formato serializado</h2>
                  <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-black/25 p-4 font-mono text-sm leading-7">
                    {previewLines.length > 0 ? (
                      previewLines.map((line) => <div key={line}>{line}</div>)
                    ) : (
                      <div className="text-slate-400">Sin campos configurados.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
