import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listarOrdenesEmpresaPortal,
  obtenerCertificadoDataEmpresaPortal,
  obtenerDescargaInterconsultaEmpresaPortal,
} from "../../api/empresaPortalApi";
import { BASE_URL } from "../../config/config";

const ESTADOS_ORDEN = ["", "emitida", "en_proceso", "completada", "cerrada", "anulada"];
const FALLBACK_LOGO_SRC = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'/>";

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function resolveCertificadoFechaEvaluacion(orden) {
  const ref = String(orden?.certificado_fecha_evaluacion || "").trim();
  if (ref) return ref;
  return String(orden?.fecha_orden || "").trim();
}

function resolveCertificadoFechaEmision(orden) {
  const ref = String(orden?.certificado_fecha_emision || "").trim();
  if (ref) return ref;
  return resolveCertificadoFechaEvaluacion(orden);
}

function resolveAssetUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return `${BASE_URL}${raw.replace(/^\/+/, "")}`;
}

function inferDataUrlImageFormat(dataUrl) {
  if (/^data:image\/png/i.test(String(dataUrl || ""))) return "PNG";
  if (/^data:image\/jpe?g/i.test(String(dataUrl || ""))) return "JPEG";
  return "PNG";
}

async function loadImageAsDataUrl(imageUrl) {
  if (!imageUrl) return "";
  if (/^data:image\//i.test(String(imageUrl))) {
    return String(imageUrl);
  }
  const response = await fetch(imageUrl, { credentials: "include" });
  if (!response.ok) return "";
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer imagen"));
    reader.readAsDataURL(blob);
  });
}

async function cropImageWhitespaceDataUrl(dataUrl) {
  if (!dataUrl) return "";
  const image = await new Promise((resolve, reject) => {
    const loadedImage = new Image();
    loadedImage.onload = () => resolve(loadedImage);
    loadedImage.onerror = () => reject(new Error("No se pudo procesar el logo"));
    loadedImage.src = dataUrl;
  });

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth || image.width;
  sourceCanvas.height = image.naturalHeight || image.height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;

  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const index = (y * sourceCanvas.width + x) * 4;
      const visible = pixels[index + 3] > 12
        && (pixels[index] < 248 || pixels[index + 1] < 248 || pixels[index + 2] < 248);
      if (!visible) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return dataUrl;

  const padding = Math.max(2, Math.round(Math.min(sourceCanvas.width, sourceCanvas.height) * 0.01));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(sourceCanvas.width - 1, maxX + padding);
  maxY = Math.min(sourceCanvas.height - 1, maxY + padding);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = cropWidth;
  outputCanvas.height = cropHeight;
  outputCanvas.getContext("2d").drawImage(sourceCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return outputCanvas.toDataURL("image/png");
}

async function fetchConfiguracionClinica() {
  const response = await fetch(`${BASE_URL}api_get_configuracion.php`, {
    method: "GET",
    credentials: "include",
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) return null;
  return payload.data || null;
}

function aptitudLabel(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "APTO") return "Apto";
  if (code === "APTO_CON_RESTRICCIONES") return "Apto con restricciones";
  if (code === "NO_APTO") return "No apto";
  return code || "-";
}

function aptitudBadgeClass(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "APTO") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (code === "APTO_CON_RESTRICCIONES") return "bg-amber-100 text-amber-700 border-amber-200";
  if (code === "NO_APTO") return "bg-red-100 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function estadoBadgeClass(value) {
  const code = String(value || "").trim().toLowerCase();
  if (code === "cerrada" || code === "completada") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (code === "en_proceso") return "bg-sky-100 text-sky-700 border-sky-200";
  if (code === "anulada") return "bg-red-100 text-red-700 border-red-200";
  return "bg-violet-100 text-violet-700 border-violet-200";
}

function formatEstadoLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRestriccion(value) {
  const raw = String(value || "").trim();
  return raw;
}

function formatInterconsultas(row) {
  const total = Number(row?.total_interconsultas || 0);
  const abiertas = Number(row?.interconsultas_abiertas || 0);
  if (total <= 0) return "-";
  if (abiertas > 0) return `${abiertas} pendiente(s)`;
  return `${total} cerrada(s)`;
}

function hasInterconsultaDocumento(row) {
  return Number(row?.interconsultas_con_documento || 0) > 0;
}

function formatLevantamiento(row) {
  const favorables = Number(row?.levantamientos_favorables || 0);
  const noFavorables = Number(row?.levantamientos_no_favorables || 0);
  const totalLevantadas = Number(row?.interconsultas_levantadas || 0);
  if (totalLevantadas <= 0) return "-";
  return `F:${favorables} / NF:${noFavorables}`;
}

export default function EmpresaPortalPanelPage({ usuario, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [downloadingId, setDownloadingId] = useState(0);
  const [downloadingInterconsultaOrdenId, setDownloadingInterconsultaOrdenId] = useState(0);
  const [brand, setBrand] = useState({
    clinicName: "CLINICA 2 DE MAYO",
    logoSrc: FALLBACK_LOGO_SRC,
  });
  const [filters, setFilters] = useState({
    q: "",
    estado: "",
    fechaDesde: "",
    fechaHasta: "",
    soloAprobados: true,
  });

  const perPage = Number(meta.per_page || 20);
  const page = Number(meta.page || 1);
  const totalPages = Number(meta.total_pages || 0);

  const loadRows = useCallback(async (nextPage = page, nextPerPage = perPage, nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const payload = await listarOrdenesEmpresaPortal({
        q: nextFilters.q,
        estado: nextFilters.estado,
        fechaDesde: nextFilters.fechaDesde,
        fechaHasta: nextFilters.fechaHasta,
        soloAprobados: nextFilters.soloAprobados,
        page: nextPage,
        perPage: nextPerPage,
      });
      setRows(payload.data || []);
      setMeta(payload.meta || { page: nextPage, per_page: nextPerPage, total: 0, total_pages: 0 });
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista");
      setRows([]);
      setMeta({ page: 1, per_page: nextPerPage, total: 0, total_pages: 0 });
    } finally {
      setLoading(false);
    }
  }, [filters, page, perPage]);

  useEffect(() => {
    loadRows(1, perPage, filters);
  }, [loadRows]);

  useEffect(() => {
    let mounted = true;

    const loadBrand = async () => {
      try {
        const cfg = await fetchConfiguracionClinica();
        if (!mounted || !cfg) return;
        const clinicName = String(cfg?.nombre_clinica || "").trim() || "CLINICA 2 DE MAYO";
        const configuredLogo = resolveAssetUrl(cfg?.logo_url || "");
        setBrand({
          clinicName,
          logoSrc: configuredLogo || FALLBACK_LOGO_SRC,
        });
      } catch {
        if (!mounted) return;
        setBrand((prev) => ({
          clinicName: prev.clinicName || "CLINICA 2 DE MAYO",
          logoSrc: prev.logoSrc || FALLBACK_LOGO_SRC,
        }));
      }
    };

    loadBrand();
    return () => {
      mounted = false;
    };
  }, []);

  const nombreEmpresa = useMemo(() => {
    const raw = String(usuario?.nombre || "").trim();
    return raw || "Empresa";
  }, [usuario]);

  const kpis = useMemo(() => {
    const total = Number(meta.total || 0);
    const aptos = rows.filter((row) => String(row?.aptitud_final || "").toUpperCase() === "APTO").length;
    const aptosConRestriccion = rows.filter((row) => String(row?.aptitud_final || "").toUpperCase() === "APTO_CON_RESTRICCIONES").length;
    const certificados = rows.filter((row) => Boolean(row?.certificado_emitido)).length;
    return {
      total,
      aptos,
      aptosConRestriccion,
      certificados,
    };
  }, [meta.total, rows]);

  const descargarCertificado = async (ordenId) => {
    setDownloadingId(Number(ordenId));
    setError("");
    try {
      const [data, jsPDFModule, cfg] = await Promise.all([
        obtenerCertificadoDataEmpresaPortal(ordenId),
        import("jspdf"),
        fetchConfiguracionClinica(),
      ]);
      const jsPDF = jsPDFModule.default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const logoUrl = resolveAssetUrl(cfg?.logo_ocupacional_url || cfg?.logo_url || "");
      const logoSelloUrl = resolveAssetUrl(cfg?.logo_url || "");
      const firmaUrl = resolveAssetUrl(data?.medico?.firma || "");
      const [logoRawDataUrl, firmaDataUrl, logoSelloRawDataUrl] = await Promise.all([
        logoUrl ? loadImageAsDataUrl(logoUrl).catch(() => "") : Promise.resolve(""),
        firmaUrl ? loadImageAsDataUrl(firmaUrl).catch(() => "") : Promise.resolve(""),
        logoSelloUrl ? loadImageAsDataUrl(logoSelloUrl).catch(() => "") : Promise.resolve(""),
      ]);
      const logoDataUrl = logoRawDataUrl
        ? await cropImageWhitespaceDataUrl(logoRawDataUrl).catch(() => logoRawDataUrl)
        : "";
      const logoSelloDataUrl = logoSelloRawDataUrl
        ? await cropImageWhitespaceDataUrl(logoSelloRawDataUrl).catch(() => logoSelloRawDataUrl)
        : "";

      const orden = data?.orden || {};
      const paciente = data?.paciente || {};
      const medico = data?.medico || {};

      const medicoFirmaNombre = String(medico.nombre || "No consignado");
      const especialidad = String(medico.especialidad || "MEDICINA OCUPACIONAL").trim();
      const cmp = String(medico.cmp || "").trim();
      const rne = String(medico.rne || "").trim();
      const rna = String(medico.rna || "").trim();
      const tipoCodigo = String(orden.tipo_codigo || "").trim().toUpperCase();
      const aptitud = String(orden.aptitud_final || "").trim().toUpperCase();
      const fechaEvaluacionIso = resolveCertificadoFechaEvaluacion(orden);
      const fechaEmisionIso = resolveCertificadoFechaEmision(orden);
      const fechaEvaluacion = formatDate(fechaEvaluacionIso);
      const sexo = String(paciente.sexo || "-").trim().toUpperCase();
      const edad = paciente.edad === null || paciente.edad === undefined ? "-" : String(paciente.edad);
      const x = 16;
      const width = 178;
      const drawCell = (cellX, cellY, cellWidth, cellHeight, text, options = {}) => {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(cellX, cellY, cellWidth, cellHeight);
        doc.setFont("times", options.bold ? "bold" : "normal");
        doc.setFontSize(options.fontSize || 9);
        doc.setTextColor(0, 0, 0);
        const lines = doc.splitTextToSize(String(text || ""), Math.max(4, cellWidth - 3));
        const lineHeight = (options.fontSize || 9) * 0.38;
        const textHeight = lines.length * lineHeight;
        const textY = cellY + Math.max(3.2, (cellHeight - textHeight) / 2 + lineHeight * 0.78);
        const textX = options.center ? cellX + cellWidth / 2 : cellX + 1.5;
        doc.text(lines, textX, textY, { align: options.center ? "center" : "left" });
      };
      const mark = (selected) => (selected ? "X" : "");

      doc.setDrawColor(147, 197, 253);
      doc.setLineWidth(0.8);
      doc.rect(10, 8, 190, 281);
      doc.setLineWidth(0.35);
      doc.rect(12, 10, 186, 277);

      if (logoDataUrl) {
        const properties = doc.getImageProperties(logoDataUrl);
        const ratio = properties.width / properties.height;
        const logoWidth = Math.min(125, 27 * ratio);
        const logoHeight = logoWidth / ratio;
        doc.addImage(
          logoDataUrl,
          inferDataUrlImageFormat(logoDataUrl),
          105 - logoWidth / 2,
          12 + (27 - logoHeight) / 2,
          logoWidth,
          logoHeight
        );
      } else {
        doc.setFont("times", "bold");
        doc.setFontSize(18);
        doc.text(String(cfg?.nombre_clinica || "CLINICA 2 DE MAYO"), 105, 25, { align: "center" });
      }

      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text("CERTIFICADO MEDICO OCUPACIONAL", 105, 43, { align: "center" });

      let y = 47;
      drawCell(x, y, width, 14, "CERTIFICA que el Sr. (a):", { bold: true, center: true, fontSize: 10 });
      y += 14;
      drawCell(x, y, 52, 14, "APELLIDOS Y NOMBRES", { bold: true });
      drawCell(x + 52, y, 126, 14, String(paciente.nombre_completo || "-"), { fontSize: 9.5 });
      y += 14;

      drawCell(x, y, 52, 10, "TIPO DE EVALUACION", { bold: true, fontSize: 8.2 });
      drawCell(x + 52, y, 42, 10, `OCUPACIONAL     ${mark(tipoCodigo === "PRE")}`, { center: true, fontSize: 8.4 });
      drawCell(x + 94, y, 42, 10, `PERIODICO     ${mark(tipoCodigo === "PER")}`, { center: true, fontSize: 8.4 });
      drawCell(x + 136, y, 42, 10, `RETIRO     ${mark(tipoCodigo === "POST")}`, { center: true, fontSize: 8.4 });
      y += 10;

      drawCell(x, y, 52, 9, "DOCUMENTO DE IDENTIDAD", { bold: true, fontSize: 7.8 });
      drawCell(x + 52, y, 48, 9, String(orden.documento_numero || "-"), { center: true });
      drawCell(x + 100, y, 20, 9, "EDAD", { bold: true, center: true });
      drawCell(x + 120, y, 22, 9, `${edad} años`, { center: true });
      drawCell(x + 142, y, 18, 9, "SEXO", { bold: true, center: true });
      drawCell(x + 160, y, 18, 9, sexo, { center: true });
      y += 9;

      drawCell(x, y, 52, 9, "PUESTO AL QUE POSTULA O TRABAJA", { bold: true, fontSize: 7.2 });
      drawCell(x + 52, y, 126, 9, String(orden.puesto_trabajo || "-"));
      y += 9;
      drawCell(x, y, 52, 9, "OCUPACION ACTUAL O ULTIMA OCUPACION", { bold: true, fontSize: 6.8 });
      drawCell(x + 52, y, 126, 9, String(orden.puesto_trabajo || "-"));
      y += 9;

      drawCell(x, y, 52, 14, "HISTORIA CLINICA", { bold: true, center: true });
      drawCell(x + 52, y, 44, 14, String(paciente.historia_clinica || "-"), { center: true });
      drawCell(x + 96, y, 44, 14, "FECHA DE EVALUACION", { bold: true, center: true });
      drawCell(x + 140, y, 38, 14, fechaEvaluacion, { center: true });
      y += 14;

      drawCell(x, y, 42, 14, "EMPRESA", { bold: true, center: true });
      drawCell(x + 42, y, 136, 14, String(orden.empresa || "-"), { fontSize: 9 });
      y += 14;
      drawCell(x, y, width, 14, `Conclusion segun protocolo ${String(orden.protocolo_descripcion || "-")} estipulado`, { center: true, fontSize: 9 });
      y += 14;

      const aptitudeLabelWidth = 55;
      const aptitudeMarkWidth = 26;
      const restrictionsWidth = width - aptitudeLabelWidth - aptitudeMarkWidth;
      drawCell(x, y, aptitudeLabelWidth, 16, "APTO\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7.5 });
      drawCell(x + aptitudeLabelWidth, y, aptitudeMarkWidth, 16, mark(aptitud === "APTO"), { bold: true, center: true, fontSize: 10 });
      drawCell(x, y + 16, aptitudeLabelWidth, 16, "APTO CON RESTRICCION\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7 });
      drawCell(x + aptitudeLabelWidth, y + 16, aptitudeMarkWidth, 16, mark(aptitud === "APTO_CON_RESTRICCIONES"), { bold: true, center: true, fontSize: 10 });
      drawCell(x, y + 32, aptitudeLabelWidth, 16, "NO APTO\n(para el puesto en el que trabaja o postula)", { bold: true, fontSize: 7.5 });
      drawCell(x + aptitudeLabelWidth, y + 32, aptitudeMarkWidth, 16, mark(aptitud === "NO_APTO"), { bold: true, center: true, fontSize: 10 });
      drawCell(x + aptitudeLabelWidth + aptitudeMarkWidth, y, restrictionsWidth, 48, `Restricciones:\n${String(orden.restriccion_final || "Ninguna")}`, { fontSize: 8 });
      y += 48;

      drawCell(x, y, width, 63, "");
      if (logoSelloDataUrl) {
        const selloLogoProperties = doc.getImageProperties(logoSelloDataUrl);
        const selloLogoRatio = selloLogoProperties.width / selloLogoProperties.height;
        const selloLogoWidth = Math.min(15, 14 * selloLogoRatio);
        const selloLogoHeight = selloLogoWidth / selloLogoRatio;
        doc.addImage(
          logoSelloDataUrl,
          inferDataUrlImageFormat(logoSelloDataUrl),
          68,
          y + 3 + (14 - selloLogoHeight) / 2,
          selloLogoWidth,
          selloLogoHeight
        );
      }
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.text("CLINICA DOS DE MAYO PUCALLPA", 86, y + 10);
      if (firmaDataUrl) {
        doc.addImage(
          firmaDataUrl,
          inferDataUrlImageFormat(firmaDataUrl),
          80,
          y + 10,
          50,
          20
        );
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.line(68, y + 26, 142, y + 26);
      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.text(medicoFirmaNombre, 105, y + 33, { align: "center" });
      doc.setFont("times", "bold");
      doc.text(especialidad || "MEDICINA OCUPACIONAL", 105, y + 38, { align: "center" });
      doc.setFont("times", "normal");
      doc.setFontSize(7.5);
      const codigosProfesionales = [`CMP: ${cmp || "-"}`];
      if (rne) codigosProfesionales.push(`RNE: ${rne}`);
      if (rna) codigosProfesionales.push(`RNA: ${rna}`);
      doc.text(codigosProfesionales.join("     "), 105, y + 43, { align: "center" });
      doc.setFont("times", "bold");
      doc.setFontSize(9);
      doc.text("Sello y firma del medico que CERTIFICA", 105, y + 58, { align: "center" });
      y += 63;

      drawCell(x, y, 80, 10, `Fecha de emision: ${formatDate(fechaEmisionIso)}`, { fontSize: 8.5 });
      drawCell(x + 80, y, 98, 10, "", { fontSize: 8.5 });
      doc.setFont("times", "bold");
      doc.setFontSize(6.5);
      doc.text("Segun referencia R.M. 312-2011", x + 1, y + 14);

      const safeCode = String(orden.codigo || `orden_${ordenId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      doc.save(`certificado_aptitud_${safeCode}.pdf`);
    } catch (err) {
      setError(err.message || "No se pudo descargar el certificado");
    } finally {
      setDownloadingId(0);
    }
  };

  const descargarInterconsulta = async (ordenId) => {
    const numericOrdenId = Number(ordenId) || 0;
    if (numericOrdenId <= 0) return;
    setDownloadingInterconsultaOrdenId(numericOrdenId);
    setError("");
    try {
      const data = await obtenerDescargaInterconsultaEmpresaPortal(numericOrdenId);
      if (!data?.disponible || !String(data?.download_url || "").trim()) {
        throw new Error("No hay interconsulta con documento disponible todavía");
      }
      const fullUrl = `${BASE_URL}${String(data.download_url).replace(/^\/+/, "")}`;
      window.open(fullUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "No se pudo descargar la interconsulta");
    } finally {
      setDownloadingInterconsultaOrdenId(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-700 via-fuchsia-700 to-indigo-700 p-5 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/80 bg-white p-2 shadow-md ring-2 ring-violet-200/70">
                <img
                  src={brand.logoSrc}
                  alt="Logo clínica"
                  className="h-full w-full rounded-xl bg-white object-contain"
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_LOGO_SRC;
                  }}
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/80">Portal corporativo</p>
                <h1 className="text-xl font-semibold md:text-2xl">{brand.clinicName}</h1>
                <p className="text-sm text-white/85">Empresa autenticada: {nombreEmpresa}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Cerrar sesion
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-violet-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-violet-500">Registros filtrados</p>
            <p className="mt-1 text-2xl font-semibold text-violet-700">{kpis.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-emerald-600">Apto</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{kpis.aptos}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-amber-600">Apto con restricción</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{kpis.aptosConRestriccion}</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-cyan-600">Certificados emitidos</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-700">{kpis.certificados}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-100 bg-white/95 p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-800">Filtros de búsqueda</h2>
            <p className="text-xs text-slate-500">Filtra pacientes evaluados y descarga sus certificados.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <input
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none"
              placeholder="Buscar por orden, documento o protocolo"
            />
            <select
              value={filters.estado}
              onChange={(e) => setFilters((prev) => ({ ...prev, estado: e.target.value }))}
              className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none"
            >
              {ESTADOS_ORDEN.map((estado) => (
                <option key={estado || "all"} value={estado}>
                  {estado || "Todos los estados"}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={(e) => setFilters((prev) => ({ ...prev, fechaDesde: e.target.value }))}
              className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none"
            />
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={(e) => setFilters((prev) => ({ ...prev, fechaHasta: e.target.value }))}
              className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none"
            />
            <label className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.soloAprobados}
                onChange={(e) => setFilters((prev) => ({ ...prev, soloAprobados: e.target.checked }))}
              />
              Solo pacientes aptos
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-700 px-4 py-2 text-sm font-medium text-white transition hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-60"
              disabled={loading}
              onClick={() => loadRows(1, perPage, filters)}
            >
              {loading ? "Cargando..." : "Aplicar filtros"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm text-violet-700 transition hover:bg-violet-50"
              onClick={() => {
                const reset = { q: "", estado: "", fechaDesde: "", fechaHasta: "", soloAprobados: true };
                setFilters(reset);
                loadRows(1, perPage, reset);
              }}
            >
              Limpiar
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-violet-100 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-gradient-to-r from-violet-50 to-cyan-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Orden</th>
                  <th className="px-3 py-2 text-left font-medium">Paciente</th>
                  <th className="px-3 py-2 text-left font-medium">Documento</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Aptitud</th>
                  <th className="px-3 py-2 text-left font-medium">Restricción</th>
                  <th className="px-3 py-2 text-left font-medium">Interconsultas</th>
                  <th className="px-3 py-2 text-left font-medium">Levantamiento</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">
                      {loading ? "Cargando resultados..." : "No hay pacientes para los filtros seleccionados"}
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-violet-50/40">
                    <td className="px-3 py-2">{formatDate(resolveCertificadoFechaEvaluacion(row))}</td>
                    <td className="px-3 py-2 font-medium">{row.codigo || "-"}</td>
                    <td className="px-3 py-2">{row.paciente_nombre_completo || "-"}</td>
                    <td className="px-3 py-2">{row.documento_numero || "-"}</td>
                    <td className="px-3 py-2">{row.tipo_nombre || row.tipo_codigo || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${aptitudBadgeClass(row.aptitud_final)}`}>
                        {aptitudLabel(row.aptitud_final)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatRestriccion(row.restriccion_final)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formatInterconsultas(row)}</span>
                        {hasInterconsultaDocumento(row) ? (
                          <button
                            type="button"
                            onClick={() => descargarInterconsulta(row.id)}
                            disabled={downloadingInterconsultaOrdenId === Number(row.id)}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
                          >
                            {downloadingInterconsultaOrdenId === Number(row.id) ? "Descargando..." : "Descargar"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{formatLevantamiento(row)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => descargarCertificado(row.id)}
                        disabled={downloadingId === Number(row.id)}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                      >
                        {downloadingId === Number(row.id) ? "Descargando..." : "Descargar certificado"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <div>Total registros: {Number(meta.total || 0)}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-violet-700 disabled:opacity-50"
                onClick={() => loadRows(Math.max(1, page - 1), perPage, filters)}
                disabled={loading || page <= 1}
              >
                Anterior
              </button>
              <span>
                Pagina {page} de {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-violet-700 disabled:opacity-50"
                onClick={() => loadRows(Math.min(totalPages, page + 1), perPage, filters)}
                disabled={loading || totalPages <= 0 || page >= totalPages}
              >
                Siguiente
              </button>
              <select
                value={String(perPage)}
                onChange={(e) => {
                  const nextPerPage = Number(e.target.value) || 20;
                  setMeta((prev) => ({ ...prev, per_page: nextPerPage }));
                  loadRows(1, nextPerPage, filters);
                }}
                className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-violet-700"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
