
const BASE_HC_FIELDS = new Set([
  "tiempo_enfermedad",
  "forma_inicio",
  "curso",
  "descripcion_general",
  "antecedentes",
  "examen_fisico",
  "tratamiento",
  "receta",
  "diagnosticos",
  "template",
]);

function formatFieldLabel(fieldKey) {
  if (!fieldKey) return "Campo";
  if (fieldKey.toLowerCase() === "fur") return "FUR";
  return fieldKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function FormularioHistoriaClinica({ hc, setHc, templateSections = {} }) {
  const dynamicSections = Object.entries(templateSections || {}).reduce((acc, [sectionKey, sectionFields]) => {
    if (!sectionFields || typeof sectionFields !== "object" || Array.isArray(sectionFields)) {
      return acc;
    }

    const filteredFields = Object.keys(sectionFields).filter(
      (fieldKey) => !BASE_HC_FIELDS.has(fieldKey)
    );

    if (filteredFields.length > 0) {
      acc.push({ sectionKey, fields: filteredFields });
    }

    return acc;
  }, []);

  return (
    <>
  <h3 className="text-lg font-semibold mb-2 mt-4">Anamnesis</h3>
      <div className="mb-2 flex flex-col md:flex-row gap-2">
        <div className="flex-1">
          <label className="block font-semibold mb-1">Tiempo de Enfermedad:</label>
          <textarea
            className="w-full border rounded p-1"
            rows={2}
            value={hc.tiempo_enfermedad}
            onChange={e => setHc(h => ({ ...h, tiempo_enfermedad: e.target.value }))}
          />
        </div>
        <div className="flex-1">
          <label className="block font-semibold mb-1">Forma de inicio:</label>
          <textarea
            className="w-full border rounded p-1"
            rows={2}
            value={hc.forma_inicio}
            onChange={e => setHc(h => ({ ...h, forma_inicio: e.target.value }))}
          />
        </div>
        <div className="flex-1">
          <label className="block font-semibold mb-1">Curso:</label>
          <textarea
            className="w-full border rounded p-1"
            rows={2}
            value={hc.curso}
            onChange={e => setHc(h => ({ ...h, curso: e.target.value }))}
          />
        </div>
      </div>
      <div className="mb-2">
        <label className="block font-semibold mb-1">Descripción general del cuadro actual:</label>
        <textarea
          className="w-full border rounded p-1"
          rows={2}
          value={hc.descripcion_general || ""}
          onChange={e => setHc(h => ({ ...h, descripcion_general: e.target.value }))}
        />
      </div>

      <h3 className="text-lg font-semibold mb-2 mt-4">Antecedentes</h3>
      <div className="mb-2">
        <textarea
          className="w-full border rounded p-1"
          rows={2}
          value={hc.antecedentes}
          onChange={e => setHc(h => ({ ...h, antecedentes: e.target.value }))}
        />
      </div>
      <h3 className="text-lg font-semibold mb-2 mt-4">Examen Físico</h3>
      <div className="mb-2">
        <textarea
          className="w-full border rounded p-1"
          rows={2}
          value={hc.examen_fisico}
          onChange={e => setHc(h => ({ ...h, examen_fisico: e.target.value }))}
        />
      </div>
      {dynamicSections.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mb-2 mt-4">Campos Sugeridos por Especialidad</h3>
          {dynamicSections.map(({ sectionKey, fields }) => (
            <div key={sectionKey} className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="text-sm font-semibold text-indigo-700 mb-2">
                {formatFieldLabel(sectionKey)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {fields.map((fieldKey) => (
                  <div key={fieldKey}>
                    <label className="block font-semibold mb-1 text-sm">{formatFieldLabel(fieldKey)}:</label>
                    <textarea
                      className="w-full border rounded p-1"
                      rows={2}
                      value={hc[fieldKey] ?? ""}
                      onChange={(e) => setHc((current) => ({ ...current, [fieldKey]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
