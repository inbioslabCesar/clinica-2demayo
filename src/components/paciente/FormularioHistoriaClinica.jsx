
// Fields handled by dedicated sections elsewhere on the HC page — skip them here.
const EXCLUDED_FIELDS = new Set(["tratamiento", "receta", "diagnosticos", "template"]);
const EXCLUDED_SECTIONS = new Set(["plan", "tratamiento", "receta"]);

// Shown when no template is configured yet so the form is never blank.
const DEFAULT_TEMPLATE_SECTIONS = {
  anamnesis: {
    tiempo_enfermedad: { type: "text", width: "third", rows: 2, options: [] },
    forma_inicio: { type: "text", width: "third", rows: 2, options: [] },
    curso: { type: "text", width: "third", rows: 2, options: [] },
    descripcion_general: { type: "textarea", width: "full", rows: 3, options: [] },
  },
  antecedentes: { antecedentes: { type: "textarea", width: "full", rows: 3, options: [] } },
  examen_fisico: { examen_fisico: { type: "textarea", width: "full", rows: 3, options: [] } },
};

function normalizeFieldMeta(rawMeta = {}) {
  const type = String(rawMeta?.type || "textarea").trim().toLowerCase();
  const width = String(rawMeta?.width || "half").trim().toLowerCase();
  const rowsRaw = Number(rawMeta?.rows ?? 2);
  const optionsRaw = Array.isArray(rawMeta?.options)
    ? rawMeta.options
    : String(rawMeta?.options || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    type: ["text", "textarea", "number", "select"].includes(type) ? type : "textarea",
    width: ["quarter", "third", "half", "full"].includes(width) ? width : "half",
    rows: Number.isFinite(rowsRaw) ? Math.max(1, Math.min(8, Math.trunc(rowsRaw))) : 2,
    options: optionsRaw,
    breakAfter: Boolean(rawMeta?.breakAfter ?? rawMeta?.break_after ?? false),
  };
}

function widthToClass(width) {
  switch (width) {
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
}

function formatFieldLabel(fieldKey) {
  if (!fieldKey) return "Campo";
  if (fieldKey.toLowerCase() === "fur") return "FUR";
  return fieldKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function FormularioHistoriaClinica({ hc, setHc, templateSections = {} }) {
  const effectiveSections =
    Object.keys(templateSections || {}).length > 0 ? templateSections : DEFAULT_TEMPLATE_SECTIONS;

  const renderableSections = Object.entries(effectiveSections).reduce(
    (acc, [sectionKey, sectionFields]) => {
      if (EXCLUDED_SECTIONS.has(sectionKey)) return acc;
      if (!sectionFields || typeof sectionFields !== "object" || Array.isArray(sectionFields))
        return acc;

      const fields = Object.entries(sectionFields)
        .filter(([fieldKey]) => !EXCLUDED_FIELDS.has(fieldKey))
        .map(([fieldKey, fieldMeta]) => ({
          fieldKey,
          meta: normalizeFieldMeta(fieldMeta),
        }));

      if (fields.length > 0) acc.push({ sectionKey, fields });
      return acc;
    },
    []
  );

  return (
    <>
      {renderableSections.map(({ sectionKey, fields }) => (
        <div key={sectionKey}>
          <h3 className="text-lg font-semibold mb-2 mt-4">{formatFieldLabel(sectionKey)}</h3>
          <div className="mb-3 grid grid-cols-12 gap-2">
            {fields.flatMap(({ fieldKey, meta }) => {
              const nodes = [
                <div key={fieldKey} className={widthToClass(meta.width)}>
                <label className="block font-semibold mb-1 text-sm">
                  {formatFieldLabel(fieldKey)}:
                </label>

                {meta.type === "select" ? (
                  <select
                    className="w-full border rounded p-1 bg-white"
                    value={hc[fieldKey] ?? ""}
                    onChange={(e) =>
                      setHc((current) => ({ ...current, [fieldKey]: e.target.value }))
                    }
                  >
                    <option value="">Seleccionar...</option>
                    {meta.options.map((opt) => (
                      <option key={`${fieldKey}_${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : meta.type === "number" ? (
                  <input
                    type="number"
                    className="w-full border rounded p-1"
                    value={hc[fieldKey] ?? ""}
                    onChange={(e) =>
                      setHc((current) => ({ ...current, [fieldKey]: e.target.value }))
                    }
                  />
                ) : meta.type === "text" ? (
                  <input
                    type="text"
                    className="w-full border rounded p-1"
                    value={hc[fieldKey] ?? ""}
                    onChange={(e) =>
                      setHc((current) => ({ ...current, [fieldKey]: e.target.value }))
                    }
                  />
                ) : (
                  <textarea
                    className="w-full border rounded p-1"
                    rows={meta.rows || 2}
                    value={hc[fieldKey] ?? ""}
                    onChange={(e) =>
                      setHc((current) => ({ ...current, [fieldKey]: e.target.value }))
                    }
                  />
                )}
              </div>
              ];

              if (meta.breakAfter) {
                nodes.push(<div key={`${fieldKey}_break`} className="col-span-12 h-0" />);
              }

              return nodes;
            })}
          </div>
        </div>
      ))}
    </>
  );
}
