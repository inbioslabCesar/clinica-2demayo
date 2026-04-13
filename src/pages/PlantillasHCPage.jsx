import { useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../config/config";

const DEFAULT_TEMPLATE_OPTIONS = [
  { id: "default", nombre: "Plantilla base (fallback)" },
  { id: "medicina_general", nombre: "Medicina General" },
  { id: "ginecologia", nombre: "Ginecologia" },
  { id: "pediatria", nombre: "Pediatria" },
];

const DEFAULT_FIELDS_TEXT =
  "anamnesis.tiempo_enfermedad\nanamnesis.forma_inicio\nanamnesis.curso\ngineco_obstetricos.fur\ngineco_obstetricos.gestas\ngineco_obstetricos.partos\ngineco_obstetricos.cesareas\nexamen_fisico.examen_fisico";

const EXCLUDED_TEMPLATE_SECTION_KEYS = new Set(["plan"]);
const EXCLUDED_TEMPLATE_FIELD_KEYS = new Set(["tratamiento"]);

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

function normalizeFieldMeta(rawMeta = {}) {
  const allowedTypes = new Set(["text", "textarea", "number", "select"]);
  const allowedWidths = new Set(["quarter", "third", "half", "full"]);

  const rawType = String(rawMeta?.type || "textarea").trim().toLowerCase();
  const rawWidth = String(rawMeta?.width || "half").trim().toLowerCase();
  const rowsRaw = Number(rawMeta?.rows ?? 2);

  const optionsRaw = Array.isArray(rawMeta?.options)
    ? rawMeta.options
    : String(rawMeta?.options || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    type: allowedTypes.has(rawType) ? rawType : "textarea",
    width: allowedWidths.has(rawWidth) ? rawWidth : "half",
    rows: Number.isFinite(rowsRaw) ? Math.max(1, Math.min(8, Math.trunc(rowsRaw))) : 2,
    options: Array.from(new Set(optionsRaw.map((opt) => String(opt).trim()).filter(Boolean))),
    breakAfter: Boolean(rawMeta?.breakAfter ?? rawMeta?.break_after ?? false),
  };
}

function createFieldDraft(title = "Nuevo campo", rawMeta = {}) {
  return { id: createLocalId("field"), title, ...normalizeFieldMeta(rawMeta) };
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
    sections[sectionKey][fieldKey] = normalizeFieldMeta({});
  });

  return sections;
}

function sanitizeTemplateSections(sections = {}) {
  return Object.entries(sections || {}).reduce((accumulator, [sectionRaw, fields]) => {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return accumulator;

    const sectionKey = String(sectionRaw || "").trim().toLowerCase();
    if (!sectionKey || EXCLUDED_TEMPLATE_SECTION_KEYS.has(sectionKey)) return accumulator;

    const cleanFields = Object.entries(fields).reduce((fieldAccumulator, [fieldRaw, fieldMeta]) => {
      const fieldKey = String(fieldRaw || "").trim().toLowerCase();
      if (!fieldKey || EXCLUDED_TEMPLATE_FIELD_KEYS.has(fieldKey)) return fieldAccumulator;
      fieldAccumulator[fieldKey] = normalizeFieldMeta(fieldMeta);
      return fieldAccumulator;
    }, {});

    if (Object.keys(cleanFields).length > 0) {
      accumulator[sectionKey] = cleanFields;
    }
    return accumulator;
  }, {});
}

function sectionsToBuilder(sections = {}) {
  return Object.entries(sections || {}).reduce((accumulator, [sectionKey, fields]) => {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return accumulator;

    const fieldDrafts = Object.entries(fields).map(([fieldKey, fieldMeta]) =>
      createFieldDraft(humanizeKey(fieldKey), fieldMeta)
    );

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
        const normalizedMeta = normalizeFieldMeta(field);
        uniqueFields[fieldKey] = {
          type: normalizedMeta.type,
          width: normalizedMeta.width,
          rows: normalizedMeta.rows,
          options: normalizedMeta.options,
          break_after: normalizedMeta.breakAfter,
        };
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
  const [_loadingList, setLoadingList] = useState(true);
  const [sessionUsuario] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('usuario') || 'null'); } catch { return null; }
  });
  const isAdmin = sessionUsuario?.rol === 'administrador';
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
  
  const [hcTemplateSingleId, setHcTemplateSingleId] = useState('');
  const [hcTemplateSingleIdDraft, setHcTemplateSingleIdDraft] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [hcSelectorOpen, setHcSelectorOpen] = useState(false);
  const [fullClinicConfig, setFullClinicConfig] = useState(null);

  const builtInIds = useMemo(
    () => new Set(DEFAULT_TEMPLATE_OPTIONS.map((item) => item.id)),
    []
  );

  const templateSections = useMemo(
    () => builderToSections(builderSections),
    [builderSections]
  );

  const sectionCount = builderSections.length;
  const fieldCount = builderSections.reduce(
    (total, section) => total + (section.fields?.length || 0),
    0
  );

  const widthToPreviewClass = (width) => {
    switch (String(width || "half")) {
      case "quarter":
        return "col-span-12 md:col-span-3";
      case "third":
        return "col-span-12 md:col-span-4";
      case "full":
        return "col-span-12";
      case "half":
      default:
        return "col-span-12 md:col-span-6";
    }
  };

  const previewSampleValue = (field, fieldKey) => {
    const label = field.title || humanizeKey(fieldKey);
    const type = String(field.type || "textarea").toLowerCase();
    if (type === "number") return "120";
    if (type === "select") return field.options?.[0] || "";
    if (type === "text") return `Ejemplo ${label}`;
    return `Texto de ejemplo para ${label}.`;
  };

  const hcFixedTemplateOptions = useMemo(() => {
    return (templateOptions || []).filter((item) => item.id && item.id !== 'default');
  }, [templateOptions]);

  const setStatusMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  const loadHcTemplateConfig = async () => {
    try {
      const res = await fetch(`${BASE_URL}api_get_configuracion.php`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setFullClinicConfig(data.data);
        const incoming = data.data;
        const incomingSingleId = String(incoming.hc_template_single_id || '').trim();
        const incomingMode = String(incoming.hc_template_mode || 'auto').trim().toLowerCase();
        // Legacy fix: if old config stored "default" as single template, switch to automatic mode.
        if (incomingMode === 'single' && incomingSingleId === 'default') {
          setHcTemplateSingleId('');
          setHcTemplateSingleIdDraft('');
          setSelectedTemplateId('');
        } else if (incomingMode === 'single' && incomingSingleId) {
          setHcTemplateSingleId(incomingSingleId);
          setHcTemplateSingleIdDraft(incomingSingleId);
          setSelectedTemplateId(incomingSingleId);
        } else {
          // Modo automático: limpiar editor, no precargar ninguna plantilla fija.
          setHcTemplateSingleId('');
          setHcTemplateSingleIdDraft('');
          setSelectedTemplateId('');
        }
      }
    } catch (err) {
      console.error('Error cargando config HC template:', err);
    }
  };

  const saveHcTemplateConfig = async (selectedSingleId, { silent = false } = {}) => {
    setSavingConfig(true);
    try {
      const mode = selectedSingleId ? 'single' : 'auto';
      // Usar la config guardada para mantener todos los campos
      const payload = {
        ...(fullClinicConfig || {}),
        hc_template_mode: mode,
        hc_template_single_id: selectedSingleId || '',
      };
      
      const res = await fetch(`${BASE_URL}api_configuracion.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setHcTemplateSingleId(selectedSingleId || '');
        setHcTemplateSingleIdDraft(selectedSingleId || '');
        if (!silent) {
          const protection = data?.hc_protection || null;
          const pinnedNow = Number(protection?.pinned_now || 0);
          const evaluated = Number(protection?.evaluated || 0);
          const unresolved = Number(protection?.unresolved || 0);
          if (protection?.policy_changed) {
            setStatusMessage(
              `Configuración de plantilla HC actualizada. HC protegidas: ${pinnedNow}/${evaluated} fijadas.${unresolved > 0 ? ` Sin resolver: ${unresolved}.` : ''}`,
              'success'
            );
          } else {
            setStatusMessage('Configuración de plantilla HC actualizada.', 'success');
          }
        }
      } else {
        throw new Error(data.error || 'Error al guardar');
      }
    } catch (err) {
      if (!silent) {
        setStatusMessage(`Error guardando config: ${err.message}`, 'error');
      }
      throw err;
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSelectHcTemplate = (tplId) => {
    const selectedId = String(tplId || '').trim();
    setHcTemplateSingleIdDraft(selectedId);
    if (selectedId) {
      // Plantilla fija: carga esa plantilla en el editor y vista previa.
      setSelectedTemplateId(selectedId);
    } else {
      // Automático: limpia el editor y muestra estado neutro.
      setSelectedTemplateId('');
      setTemplateId('');
      setNombre('Automático');
      setVersion('');
      setSchemaVersion('2.0');
      setBuilderSections([]);
      setFieldsText('');
      setRawDirty(false);
      setIsDraftTemplate(false);
    }
    setHcSelectorOpen(false);
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
        const sections = sanitizeTemplateSections(tpl.sections || {});
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
    loadHcTemplateConfig();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId || isDraftTemplate) return;
    try { localStorage.setItem("hcPlantillaSeleccionada", selectedTemplateId); } catch (ignored) { void ignored; }
    loadTemplate(selectedTemplateId);
  }, [selectedTemplateId, isDraftTemplate, loadTemplate]);

  // Cuando se carga config y es automático, limpiar selección de editor.
  useEffect(() => {
    if (hcTemplateSingleIdDraft === '' && selectedTemplateId === '') {
      setNombre('Automático');
      setTemplateId('');
      setBuilderSections([]);
      setFieldsText('');
    }
  }, [hcTemplateSingleIdDraft, selectedTemplateId]);

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

  const moveSectionTo = (fromIndex, toIndex) => {
    setBuilderSections((prev) => moveItem(prev, fromIndex, toIndex));
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

  const moveFieldTo = (sectionId, fromIndex, toIndex) => {
    setBuilderSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: moveItem(section.fields, fromIndex, toIndex),
        };
      })
    );
  };

  const updateFieldConfig = (sectionId, fieldId, patch) => {
    setBuilderSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) => {
            if (field.id !== fieldId) return field;
            return { ...field, ...patch };
          }),
        };
      })
    );
  };

  const handleApplyRawText = () => {
    const parsedSections = sanitizeTemplateSections(linesToSections(fieldsText));
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
        advancedMode && rawDirty
          ? sectionsToBuilder(sanitizeTemplateSections(linesToSections(fieldsText)))
          : builderSections;
      const validationErrors = validateBuilderSections(draftBuilder);

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      const sections = sanitizeTemplateSections(builderToSections(draftBuilder));
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

  const handleApplyUsageConfig = async () => {
    const selectedConfigId = String(hcTemplateSingleIdDraft || '').trim();
    const persistedConfigId = String(hcTemplateSingleId || '').trim();
    if (selectedConfigId === persistedConfigId) {
      setStatusMessage('No hay cambios pendientes en la aplicación de plantillas.', 'info');
      return;
    }

    const modeText = selectedConfigId
      ? `Plantilla fija: ${selectedConfigId}`
      : 'Automático por especialidad';
    const confirmed = window.confirm(
      `Se aplicará esta configuración para nuevas consultas del sistema:\n\n${modeText}\n\n¿Deseas continuar?`
    );
    if (!confirmed) return;

    try {
      await saveHcTemplateConfig(selectedConfigId);
    } catch (err) {
      void err;
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
      "motivo_consulta.descripcion\nanamnesis.tiempo_enfermedad\nexamen_fisico.examen_general"
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
                    {isAdmin && (
                      <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="mb-2 text-xs font-semibold text-emerald-700">Aplicacion en consultas</p>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setHcSelectorOpen((prev) => !prev)}
                            className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm transition hover:bg-emerald-50"
                            disabled={saving || savingConfig}
                          >
                            <span className="font-medium">
                              {hcTemplateSingleIdDraft
                                ? `Plantilla fija: ${hcTemplateSingleIdDraft}`
                                : 'Automatico por especialidad'}
                            </span>
                            <span className="float-right text-emerald-700">▾</span>
                          </button>

                          {hcSelectorOpen && (
                            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-emerald-300 bg-white shadow-lg">
                              <label className="flex cursor-pointer items-center gap-3 border-b border-emerald-100 px-3 py-2 hover:bg-emerald-50">
                                <input
                                  type="checkbox"
                                  checked={!hcTemplateSingleIdDraft}
                                  onChange={() => handleSelectHcTemplate('')}
                                  className="h-4 w-4 text-emerald-600"
                                />
                                <span className="text-sm font-medium text-slate-800">Automatico por especialidad</span>
                              </label>

                              {hcFixedTemplateOptions.map((item) => {
                                const isChecked = hcTemplateSingleIdDraft === item.id;
                                return (
                                  <label
                                    key={item.id}
                                    className="flex cursor-pointer items-center gap-3 border-b border-emerald-100 px-3 py-2 last:border-b-0 hover:bg-emerald-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleSelectHcTemplate(isChecked ? '' : item.id)}
                                      className="h-4 w-4 text-emerald-600"
                                    />
                                    <span className="text-sm text-slate-800">{item.nombre} ({item.id})</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-emerald-700">
                          {savingConfig
                            ? 'Guardando configuracion...'
                            : hcTemplateSingleIdDraft
                              ? `Se aplicara siempre: ${hcTemplateSingleIdDraft}`
                              : 'Se aplicara automaticamente por especialidad'}
                          {hcTemplateSingleIdDraft !== hcTemplateSingleId
                            ? ' (cambio pendiente: presiona Aplicar uso en el sistema)'
                            : ''}
                        </p>
                      </div>
                    )}

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
                        Plantilla base (fallback) activa
                      </p>
                      <p className="mt-1 text-sm text-emerald-800/80">
                        Esta plantilla se usa solo cuando no existe una plantilla por especialidad para la consulta. Si hay plantilla de la especialidad, siempre tendra prioridad.
                      </p>
                      <ul className="mt-3 space-y-1 text-xs text-emerald-700">
                        <li>• Prioridad: <strong>Por especialidad</strong> &gt; Plantilla base (fallback) &gt; Medicina general</li>
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
                        Define tipo, ancho y opciones de cada campo. Tambien puedes arrastrar con el mouse para reordenar.
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
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/hc-section-index", String(sectionIndex));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIndex = Number(e.dataTransfer.getData("text/hc-section-index"));
                            if (!Number.isInteger(fromIndex) || fromIndex === sectionIndex) return;
                            moveSectionTo(fromIndex, sectionIndex);
                          }}
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
                              <p className="mt-1 text-xs text-slate-400">Arrastra con el mouse para reordenar secciones.</p>
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
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData(
                                      "text/hc-field",
                                      JSON.stringify({ sectionId: section.id, fieldIndex })
                                    );
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const raw = e.dataTransfer.getData("text/hc-field");
                                    if (!raw) return;
                                    try {
                                      const payload = JSON.parse(raw);
                                      if (payload.sectionId !== section.id) return;
                                      if (payload.fieldIndex === fieldIndex) return;
                                      moveFieldTo(section.id, payload.fieldIndex, fieldIndex);
                                    } catch {
                                      // ignore invalid drag payload
                                    }
                                  }}
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

                                    <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</label>
                                        <select
                                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                                          value={field.type || "textarea"}
                                          onChange={(e) => updateFieldConfig(section.id, field.id, { type: e.target.value })}
                                        >
                                          <option value="text">Texto corto</option>
                                          <option value="textarea">Texto largo</option>
                                          <option value="number">Numero</option>
                                          <option value="select">Lista desplegable</option>
                                        </select>
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ancho</label>
                                        <select
                                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                                          value={field.width || "half"}
                                          onChange={(e) => updateFieldConfig(section.id, field.id, { width: e.target.value })}
                                        >
                                          <option value="quarter">Corto (1/4)</option>
                                          <option value="third">Medio (1/3)</option>
                                          <option value="half">Normal (1/2)</option>
                                          <option value="full">Ancho completo</option>
                                        </select>
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Filas</label>
                                        <input
                                          type="number"
                                          min={1}
                                          max={8}
                                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                                          value={field.rows || 2}
                                          onChange={(e) =>
                                            updateFieldConfig(section.id, field.id, {
                                              rows: Math.max(1, Math.min(8, Number(e.target.value) || 2)),
                                            })
                                          }
                                          disabled={(field.type || "textarea") !== "textarea"}
                                        />
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Opciones</label>
                                        <input
                                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                                          value={Array.isArray(field.options) ? field.options.join(", ") : ""}
                                          onChange={(e) =>
                                            updateFieldConfig(section.id, field.id, {
                                              options: e.target.value
                                                .split(",")
                                                .map((item) => item.trim())
                                                .filter(Boolean),
                                            })
                                          }
                                          placeholder="Ej: Leve, Moderado, Severo"
                                          disabled={(field.type || "textarea") !== "select"}
                                        />
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Distribucion</label>
                                        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(field.breakAfter)}
                                            onChange={(e) =>
                                              updateFieldConfig(section.id, field.id, {
                                                breakAfter: e.target.checked,
                                              })
                                            }
                                          />
                                          Cortar fila despues
                                        </label>
                                      </div>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-400">Arrastra con el mouse para reordenar campos dentro de la seccion.</p>
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
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleApplyUsageConfig}
                      disabled={saving || savingConfig || hcTemplateSingleIdDraft === hcTemplateSingleId}
                      className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingConfig ? 'Aplicando...' : 'Aplicar uso en el sistema'}
                    </button>
                  )}
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
                  <h2 className="mt-2 text-xl font-bold text-slate-800">Como se vera el formulario</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Previsualizacion en tiempo real con tipos de campo y anchos, similar a la pantalla de HC. Tambien puedes arrastrar campos y secciones desde aqui.
                  </p>

                  <div className="mt-5 space-y-4">
                    {builderSections.map((section, sectionIndex) => {
                      const sectionTitle = section.title || `Seccion ${sectionIndex + 1}`;
                      const sectionKey = normalizeKeySegment(section.title, `seccion_${sectionIndex + 1}`);
                      return (
                        <div
                          key={section.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/hc-section-index", String(sectionIndex));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIndex = Number(e.dataTransfer.getData("text/hc-section-index"));
                            if (!Number.isInteger(fromIndex) || fromIndex === sectionIndex) return;
                            moveSectionTo(fromIndex, sectionIndex);
                          }}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{sectionTitle}</p>
                              <p className="font-mono text-xs text-slate-500">{sectionKey}</p>
                              <p className="text-[11px] text-slate-400">Arrastra esta tarjeta para reordenar la seccion.</p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                              {section.fields.length} campo(s)
                            </span>
                          </div>

                          <div className="grid grid-cols-12 gap-2">
                            {(section.fields || []).map((field, fieldIndex) => {
                              const normalizedField = normalizeFieldMeta(field);
                              const fieldKey = normalizeKeySegment(field.title, `campo_${fieldIndex + 1}`);
                              const label = field.title || humanizeKey(fieldKey);
                              const sampleValue = previewSampleValue(field, fieldKey);

                              return [
                                  <div
                                    key={field.id}
                                    className={widthToPreviewClass(normalizedField.width)}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "text/hc-field",
                                        JSON.stringify({ sectionId: section.id, fieldIndex })
                                      );
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const raw = e.dataTransfer.getData("text/hc-field");
                                      if (!raw) return;
                                      try {
                                        const payload = JSON.parse(raw);
                                        if (payload.sectionId !== section.id) return;
                                        if (payload.fieldIndex === fieldIndex) return;
                                        moveFieldTo(section.id, payload.fieldIndex, fieldIndex);
                                      } catch {
                                        // ignore invalid drag payload
                                      }
                                    }}
                                  >
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{label}</label>
                                    {normalizedField.type === "select" ? (
                                      <select
                                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
                                        value={sampleValue}
                                        disabled
                                        readOnly
                                      >
                                        {normalizedField.options.length === 0 && <option value="">Sin opciones</option>}
                                        {normalizedField.options.map((opt) => (
                                          <option key={`${field.id}_${opt}`} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    ) : normalizedField.type === "number" ? (
                                      <input
                                        type="number"
                                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
                                        value={sampleValue}
                                        readOnly
                                      />
                                    ) : normalizedField.type === "text" ? (
                                      <input
                                        type="text"
                                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
                                        value={sampleValue}
                                        readOnly
                                      />
                                    ) : (
                                      <textarea
                                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
                                        rows={normalizedField.rows}
                                        value={sampleValue}
                                        readOnly
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateFieldConfig(section.id, field.id, {
                                          breakAfter: !field.breakAfter,
                                        })
                                      }
                                      className={`mt-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                                        field.breakAfter
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {field.breakAfter ? "Corte activo" : "Sin corte"}
                                    </button>
                                  </div>,
                                  field.breakAfter ? <div key={`${field.id}_break`} className="col-span-12 h-0" /> : null,
                                ];
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {builderSections.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                        Agrega secciones y campos para ver la previsualizacion mejorada.
                      </div>
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
