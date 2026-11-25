// Casillas "Publicar en el portal del paciente" para las pantallas de subida. `estado` viene de usePublicacionPortal().
export default function OpcionesPublicacion({ estado }) {
  if (!estado?.activo) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-1.5">
      <p className="text-sm font-semibold text-sky-900">Portal del paciente</p>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={estado.publicarPdf}
          onChange={(e) => estado.setPublicarPdf(e.target.checked)}
        />
        <span>Publicar los PDF para que el paciente los descargue</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={estado.publicarImagenes}
          onChange={(e) => estado.setPublicarImagenes(e.target.checked)}
        />
        <span>Publicar también las imágenes (JPG, PNG…)</span>
      </label>
      <p className="text-xs text-sky-800">Los archivos DICOM nunca se publican. Después puede retirarlos desde Portal del paciente.</p>
    </div>
  );
}
