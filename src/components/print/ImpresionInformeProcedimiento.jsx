import { BASE_URL } from "../../config/config";
import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";

function resolveLogoUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "/2demayo.svg";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return `${BASE_URL}${raw.replace(/^\/+/, "")}`;
}

function formatearFecha(rawValue) {
  if (!rawValue) return "-";
  const parsed = rawValue instanceof Date ? rawValue : new Date(String(rawValue).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(rawValue);
  return parsed.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatearHora(rawValue) {
  if (!rawValue) return "-";
  const parsed = rawValue instanceof Date ? rawValue : new Date(String(rawValue).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImpresionInformeProcedimiento({
  paciente,
  medicoInfo,
  firmaMedico,
  configuracionClinica,
  fechaConsultaTexto,
  fechaInforme,
  contenidoPrincipal,
  camposDetalle = [],
}) {
  const logoSrc = resolveLogoUrl(configuracionClinica?.logo_url);
  const marcaAguaSrc = logoSrc;
  const firmaSolicitante = firmaMedico || medicoInfo?.firma || null;
  const websiteRaw = String(configuracionClinica?.website || "").trim();
  const websiteDisplay = websiteRaw.replace(/^https?:\/\//i, "") || "-";

  const nombrePaciente = `${paciente?.nombre || paciente?.nombres || ""} ${paciente?.apellido || paciente?.apellidos || ""}`.trim();

  return (
    <div
      className="bg-white print:shadow-none print:max-w-none"
      style={{
        minHeight: "297mm",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "10mm",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Times New Roman, serif",
        color: "#0f172a",
      }}
    >
      <img
        src={marcaAguaSrc}
        alt="Marca de agua"
        style={{
          position: "absolute",
          inset: "20% 12% auto 12%",
          width: "76%",
          opacity: 0.07,
          zIndex: 0,
          pointerEvents: "none",
          filter: "grayscale(100%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2 }}>
        <header className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt={configuracionClinica?.nombre_clinica || "Logo"} className="h-14 w-auto" />
              <div>
                <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900">
                  {configuracionClinica?.nombre_clinica || "Centro Medico"}
                </h1>
                {configuracionClinica?.slogan && (
                  <p className="text-xs text-slate-700">{configuracionClinica.slogan}</p>
                )}
                <p className="text-xs text-slate-700">Direccion: {configuracionClinica?.direccion || "-"}</p>
                <p className="text-xs text-slate-700">Telefono: {configuracionClinica?.telefono || "-"}</p>
                <p className="text-xs text-slate-700">Sitio web: {websiteDisplay}</p>
                <p className="text-xs text-slate-700">RUC: {configuracionClinica?.ruc || "-"}</p>
              </div>
            </div>

            <div className="text-right text-xs text-slate-700 min-w-[190px]">
              <p className="font-semibold text-slate-900">{formatProfesionalName(medicoInfo || {})}</p>
              <p>{medicoInfo?.especialidad || "-"}</p>
              <p>{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && <p>RNE: {medicoInfo.rne}</p>}
            </div>
          </div>
        </header>

        <section className="text-center mb-4">
          <h2 className="text-2xl font-bold tracking-wide uppercase text-slate-900">Informe de Procedimiento Medico</h2>
          <div className="mt-2 text-xs text-slate-700 flex justify-center gap-4">
            <span>Fecha informe: {formatearFecha(fechaInforme || new Date())}</span>
            <span>Hora: {formatearHora(fechaInforme || new Date())}</span>
          </div>
        </section>

        <section className="border border-slate-300 rounded p-3 mb-4 text-sm">
          <h3 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-2">Datos del paciente</h3>
          <div className="grid grid-cols-2 gap-2">
            <p><strong>Paciente:</strong> {nombrePaciente || "-"}</p>
            <p><strong>DNI:</strong> {paciente?.dni || "-"}</p>
            <p><strong>Edad:</strong> {paciente?.edad || "-"} anos</p>
            <p><strong>Sexo:</strong> {paciente?.sexo || "-"}</p>
            <p className="col-span-2"><strong>Fecha atencion:</strong> {fechaConsultaTexto || "-"}</p>
          </div>
        </section>

        <section className="border border-slate-300 rounded p-3 mb-4">
          <h3 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-2">Contenido del informe</h3>
          <div className="text-[14px] leading-6 text-slate-800 whitespace-pre-wrap min-h-[180px]">
            {String(contenidoPrincipal || "").trim() || "Sin contenido de procedimiento registrado."}
          </div>
        </section>

        {Array.isArray(camposDetalle) && camposDetalle.length > 0 && (
          <section className="border border-slate-300 rounded p-3 mb-4">
            <h3 className="text-sm font-bold uppercase border-b border-slate-300 pb-1 mb-2">Detalle complementario</h3>
            <div className="space-y-2 text-sm text-slate-800">
              {camposDetalle.map((item, idx) => (
                <div key={`${item?.fieldKey || "campo"}-${idx}`}>
                  <p className="font-semibold">{item?.label || "Campo"}</p>
                  <p className="whitespace-pre-wrap">{item?.value || "-"}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-10 pt-6 border-t border-slate-300">
          <div className="grid grid-cols-2 gap-6 items-end">
            <div>
              <p className="text-xs text-slate-600">Documento emitido desde Historia Clinica Digital.</p>
              <p className="text-xs text-slate-600">Validez sujeta a firma del medico tratante.</p>
            </div>

            <div className="text-center">
              {firmaSolicitante && (
                <div className="mb-1">
                  <img
                    src={firmaSolicitante}
                    alt="Firma del medico"
                    className="mx-auto"
                    style={{ maxHeight: "64px", maxWidth: "220px", objectFit: "contain" }}
                  />
                </div>
              )}
              <div className="border-t border-slate-800 pt-1">
                <p className="font-semibold text-sm text-slate-900">{formatProfesionalName(medicoInfo || {})}</p>
                <p className="text-xs text-slate-700">{medicoInfo?.especialidad || "-"}</p>
                <p className="text-xs text-slate-700">{formatColegiatura(medicoInfo || {})}</p>
                {medicoInfo?.rne && <p className="text-xs text-slate-700">RNE: {medicoInfo.rne}</p>}
                {!firmaSolicitante && (
                  <div className="mt-1 mb-1 h-9 flex items-center justify-center border border-dashed border-slate-400 text-xs text-slate-500">
                    [Firma Manual]
                  </div>
                )}
                <p className="text-xs font-bold text-slate-900">FIRMA DEL MEDICO</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
