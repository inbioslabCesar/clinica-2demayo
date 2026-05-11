import { BASE_URL } from "../../config/config";
import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";

const TIPO_IMAGEN_LABEL = {
  rx: "Rayos X",
  ecografia: "Ecografía",
  tomografia: "Tomografía",
};

function resolveLogoUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "/2demayo.svg";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return `${BASE_URL}${raw.replace(/^\/+/, "")}`;
}

function formatDate(rawValue) {
  if (!rawValue) return "-";
  const parsed = new Date(String(rawValue).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(rawValue);
  return parsed.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatearHora(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImpresionServiciosSolicitados({
  paciente,
  medicoInfo,
  firmaMedico,
  configuracionClinica,
  ordenes = [],
  tipo = "imagen",
}) {
  const logoSrc = resolveLogoUrl(configuracionClinica?.logo_url);
  const firmaSolicitante = firmaMedico || medicoInfo?.firma || null;

  const rows = (Array.isArray(ordenes) ? ordenes : [])
    .map((orden) => {
      if (tipo === "procedimientos") {
        const items = Array.isArray(orden?.procedimientos)
          ? orden.procedimientos.map((p) => p?.descripcion || p?.nombre).filter(Boolean)
          : [];
        return {
          id: orden?.id,
          categoria: "Procedimientos",
          items,
          fecha: orden?.fecha || orden?.fecha_solicitud || "",
          estado: String(orden?.estado || "").toLowerCase(),
        };
      }

      const items = Array.isArray(orden?.servicios_nombres)
        ? orden.servicios_nombres.filter(Boolean)
        : Array.isArray(orden?.servicios)
        ? orden.servicios.map((s) => s?.descripcion || s?.nombre).filter(Boolean)
        : [];

      const tipoOrden = String(orden?.tipo || "").toLowerCase();
      return {
        id: orden?.id,
        categoria: TIPO_IMAGEN_LABEL[tipoOrden] || "Imágenes diagnósticas",
        items,
        fecha: orden?.fecha || orden?.fecha_solicitud || "",
        estado: String(orden?.estado || "").toLowerCase(),
      };
    })
    .filter((r) => r.estado !== "cancelado" && r.items.length > 0)
    .sort((a, b) => {
      const ta = new Date(String(a.fecha || "").replace(" ", "T")).getTime() || 0;
      const tb = new Date(String(b.fecha || "").replace(" ", "T")).getTime() || 0;
      return tb - ta;
    });

  const titulo = tipo === "procedimientos"
    ? "🛠️ SOLICITUD DE PROCEDIMIENTOS"
    : "🖼️ SOLICITUD DE IMÁGENES DIAGNÓSTICAS";

  return (
    <div
      className="bg-white max-w-2xl mx-auto print:shadow-none print:max-w-none a5-servicios-print"
      style={{
        minHeight: "210mm",
        maxWidth: "148mm",
        padding: "8mm",
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        lineHeight: 1.2,
      }}
    >
      <div className="border-2 border-black p-2 mb-4">
        <div className="flex items-center justify-between border-b border-black pb-2 mb-3">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt={configuracionClinica?.nombre_clinica || "Logo"} className="h-10 w-auto" />
            <div>
              <h1 className="text-sm font-bold text-black uppercase leading-tight">
                {configuracionClinica?.nombre_clinica || "MI CLÍNICA"}
              </h1>
              {configuracionClinica?.slogan && (
                <p className="text-xs font-medium" style={{ color: configuracionClinica.slogan_color || "#374151" }}>
                  {configuracionClinica.slogan}
                </p>
              )}
              <p className="text-xs text-black">{configuracionClinica?.direccion || "Dirección de la clínica"}</p>
              <p className="text-xs text-black">Tel: {configuracionClinica?.telefono || "123-456-789"}</p>
              {configuracionClinica?.ruc && (
                <p className="text-xs text-black">RUC: {configuracionClinica.ruc}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold text-black leading-tight">
              {formatProfesionalName(medicoInfo || {})}
            </h2>
            <p className="text-xs text-black">{medicoInfo?.especialidad || "-"}</p>
            <p className="text-xs text-black">{formatColegiatura(medicoInfo || {})}</p>
            {medicoInfo?.rne && <p className="text-xs text-black">RNE: {medicoInfo.rne}</p>}
          </div>
        </div>

        <div className="text-center mb-1">
          <h2 className="text-lg font-bold text-black border-b border-black pb-1">{titulo}</h2>
          <div className="flex justify-between text-xs text-black mt-1">
            <span>Fecha: {formatearFecha(new Date())}</span>
            <span>Hora: {formatearHora(new Date())}</span>
          </div>
        </div>
      </div>

      <div className="border border-black p-2 mb-3">
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">👤 DATOS DEL PACIENTE</h3>
        <div className="grid grid-cols-1 gap-1 text-xs">
          <p><strong>Paciente:</strong> {paciente?.nombre || paciente?.nombres || ""} {paciente?.apellido || paciente?.apellidos || ""}</p>
          <div className="grid grid-cols-3 gap-2">
            <p><strong>DNI:</strong> {paciente?.dni || "-"}</p>
            <p><strong>Edad:</strong> {paciente?.edad || "-"} años</p>
            <p><strong>Sexo:</strong> {paciente?.sexo || "-"}</p>
          </div>
        </div>
      </div>

      <div className="border border-black p-2 mb-4" style={{ minHeight: "80px" }}>
        <h3 className="text-sm font-bold text-black mb-2 border-b border-black pb-1">
          {tipo === "procedimientos" ? "🛠️ PROCEDIMIENTOS INDICADOS" : "🖼️ ESTUDIOS DE IMAGEN INDICADOS"}
        </h3>

        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={`${row.id || idx}-${row.categoria}`} className="border border-gray-300 p-2 bg-gray-50 rounded">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-black text-xs bg-blue-200 px-1 rounded">{row.categoria}</span>
                  <span className="text-xs text-black">{formatDate(row.fecha)}</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-black">
                  {row.items.map((it, i) => (
                    <li key={`${row.id || idx}-${i}`}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-black italic text-center py-3">No hay servicios solicitados para imprimir.</p>
        )}
      </div>

      <div className="border border-black p-2 mb-4">
        <h3 className="text-xs font-bold text-black mb-1">📋 INDICACIONES GENERALES</h3>
        <div className="text-xs text-black space-y-1">
          <p>• Presentar esta orden médica en el servicio de su preferencia.</p>
          <p>• Llevar DNI del paciente al momento de la atención.</p>
          <p>• Esta orden está emitida por médico tratante y firmada digitalmente.</p>
        </div>
      </div>

      <div className="border-t border-black pt-3 mt-4">
        <div className="flex justify-between items-end text-xs">
          <div className="text-center">
            <div className="w-20 h-16 border border-dashed border-gray-400 flex items-center justify-center mb-1">
              <span className="text-xs text-gray-500 text-center leading-tight">SELLO<br/>RECEPCIÓN</span>
            </div>
            <p className="text-xs text-black font-bold">ATENCIÓN EXTERNA</p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-600">Emitido: {formatearFecha(new Date())}</p>
            <p className="text-xs text-gray-600">Documento médico válido</p>
          </div>

          <div className="text-center">
            {firmaSolicitante && (
              <div className="mt-0 mb-[-10px]">
                <img
                  src={firmaSolicitante}
                  alt="Firma digital del médico"
                  className="mx-auto bg-transparent p-0 firma-img-servicios"
                />
              </div>
            )}
            <div className="border-t border-black pt-1 min-w-24">
              <p className="font-bold text-black text-xs">{formatProfesionalName(medicoInfo || {})}</p>
              <p className="text-xs text-black">{medicoInfo?.especialidad || "-"}</p>
              <p className="text-xs text-black">{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && <p className="text-xs text-black">RNE: {medicoInfo.rne}</p>}
              {!firmaSolicitante && (
                <div className="mt-1 mb-2 h-8 flex items-center justify-center border border-dashed border-gray-400 text-xs text-gray-500">
                  [Firma Manual]
                </div>
              )}
              <p className="text-xs text-black font-bold">FIRMA MÉDICO</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
