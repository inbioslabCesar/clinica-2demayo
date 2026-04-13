import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/comunes/Spinner";
import Swal from "sweetalert2";
import {
  FaUserCircle, FaFlask, FaFilePdf, FaDownload, FaTrash,
  FaCloudUploadAlt, FaCheckCircle, FaClock, FaTimes,
  FaFileMedical, FaExclamationTriangle, FaExpand, FaImage,
} from "react-icons/fa";
import { MdOutlineUploadFile } from "react-icons/md";

// ─── Configuración por tipo ───────────────────────────────────────────────────
const TIPO_CONFIG = {
  laboratorio: {
    label: "Laboratorio",
    emoji: "🧪",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    header: "from-yellow-50 to-amber-50 border-yellow-200",
    dot: "bg-yellow-500",
  },
  ecografia: {
    label: "Ecografía",
    emoji: "🔬",
    badge: "bg-cyan-100 text-cyan-800 border-cyan-300",
    header: "from-cyan-50 to-blue-50 border-cyan-200",
    dot: "bg-cyan-500",
  },
  rayosx: {
    label: "Rayos X",
    emoji: "☢️",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    header: "from-purple-50 to-violet-50 border-purple-200",
    dot: "bg-purple-500",
  },
  tomografia: {
    label: "Tomografía",
    emoji: "🧲",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    header: "from-indigo-50 to-blue-50 border-indigo-200",
    dot: "bg-indigo-500",
  },
  informe: {
    label: "Informe",
    emoji: "📋",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    header: "from-emerald-50 to-green-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  otro: {
    label: "Otro",
    emoji: "📁",
    badge: "bg-gray-100 text-gray-700 border-gray-300",
    header: "from-gray-50 to-slate-50 border-gray-200",
    dot: "bg-gray-400",
  },
};

const TIPO_OPCIONES = [
  { value: "laboratorio", label: "🧪 Laboratorio" },
  { value: "ecografia",   label: "🔬 Ecografía" },
  { value: "rayosx",      label: "☢️ Rayos X" },
  { value: "tomografia",  label: "🧲 Tomografía" },
  { value: "informe",     label: "📋 Informe médico" },
  { value: "otro",        label: "📁 Otro" },
];

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatFecha(str) {
  if (!str) return "—";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente tarjeta documento ────────────────────────────────────────────
function DocumentoCard({ doc, onEliminar, puedeEliminar, cotizacionResaltada, puedeProcesarLaboratorio, onAbrirLaboratorio }) {
  const [lightbox, setLightbox] = useState(null);
  const cfg = TIPO_CONFIG[doc.tipo] || TIPO_CONFIG.otro;
  const ordenCancelada = String(doc?.orden_estado || doc?.estado || '').toLowerCase() === 'cancelada';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${doc.estado === "pendiente" ? "opacity-80" : ""}`}>
      {/* Header de la tarjeta */}
      <div className={`bg-gradient-to-r ${cfg.header} border-b px-4 py-3 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badge}`}>
            <span>{cfg.emoji}</span> {cfg.label}
          </span>
          {doc.origen === "generado" && (
            <span className="text-[11px] bg-white/80 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
              Sistema
            </span>
          )}
          {doc.origen === "externo" && (
            <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200 font-semibold">
              Externo
            </span>
          )}
          {Number(doc.cotizacion_id || 0) > 0 && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                Number(cotizacionResaltada || 0) > 0 && Number(doc.cotizacion_id) === Number(cotizacionResaltada)
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              📋 Cot. #{doc.cotizacion_id}
            </span>
          )}
        </div>
        {/* Estado */}
        {ordenCancelada ? (
          <span className="flex items-center gap-1 text-[11px] text-red-500 font-semibold whitespace-nowrap">
            <FaTimes className="text-red-400" /> Cancelada
          </span>
        ) : doc.estado === "disponible" ? (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold whitespace-nowrap">
            <FaCheckCircle className="text-green-500" /> Disponible
          </span>
        ) : doc.estado === "pendiente" ? (
          <span className="flex items-center gap-1 text-[11px] text-amber-500 font-semibold whitespace-nowrap">
            <FaClock className="text-amber-400" /> Pendiente
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-gray-400 font-semibold whitespace-nowrap">
            <FaExclamationTriangle /> Sin archivos
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-2">
        <h3 className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2" title={doc.titulo}>
          {doc.titulo}
        </h3>
        {doc.descripcion && (
          <p className="text-xs text-gray-500 italic">{doc.descripcion}</p>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
          <span>📅 {formatFecha(doc.fecha)}</span>
          {doc.examenes?.length > 0 && (
            <span title={doc.examenes.join(", ")}>
              🧫 {doc.examenes.length} examen{doc.examenes.length !== 1 ? "es" : ""}
            </span>
          )}
          {doc.origen === "externo" && doc.archivos?.length > 0 && (
            <span>📎 {doc.archivos.length} archivo{doc.archivos.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Etiquetas de exámenes (hasta 3) */}
        {doc.examenes?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {doc.examenes.slice(0, 3).map((ex, i) => (
              <span key={i} className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-md font-medium">
                {ex}
              </span>
            ))}
            {doc.examenes.length > 3 && (
              <span className="text-[10px] text-gray-400">+{doc.examenes.length - 3} más</span>
            )}
          </div>
        )}
      </div>

      {/* Acciones / archivos */}
      <div className="px-4 pb-4 space-y-2">
        {/* Resultado generado */}
        {doc.origen === "generado" && doc.estado === "disponible" && doc.url && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={doc.url}
              download
              className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
            >
              <FaDownload /> Descargar resultado PDF
            </a>
            {puedeProcesarLaboratorio && Number(doc.orden_id || 0) > 0 && (
              <button
                onClick={() => onAbrirLaboratorio?.(doc)}
                className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
                title="Abrir orden en panel de laboratorio"
              >
                <FaFlask /> Ver / editar en panel
              </button>
            )}
          </div>
        )}
        {doc.origen === "generado" && doc.estado === "pendiente" && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 w-full py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-default">
              <FaClock /> Resultado no disponible aún
            </div>
            {puedeProcesarLaboratorio && Number(doc.orden_id || 0) > 0 && (
              <button
                onClick={() => onAbrirLaboratorio?.(doc)}
                className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
                title="Procesar resultados en panel de laboratorio"
              >
                <FaFlask /> Procesar en laboratorio
              </button>
            )}
          </div>
        )}

        {/* Archivos externos */}
        {doc.origen === "externo" && doc.archivos?.length > 0 && (
          <div className="space-y-2">
            {/* Thumbnails de imágenes en grid */}
            {doc.archivos.some((a) => a.es_imagen) && (
              <div className="grid grid-cols-3 gap-1.5">
                {doc.archivos.filter((a) => a.es_imagen).map((arch) => (
                  <button
                    key={arch.id}
                    onClick={() => setLightbox(arch.url)}
                    className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100"
                    title={arch.nombre_original}
                  >
                    <img
                      src={arch.url}
                      alt={arch.nombre_original}
                      className="w-full h-full object-cover transition group-hover:opacity-80"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                      <FaExpand className="text-white text-base drop-shadow-lg" />
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* Lista de PDFs y DICOM */}
            {doc.archivos.filter((a) => !a.es_imagen).map((arch) => (
              <div key={arch.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                {arch.mime_type === "application/dicom" ? (
                  <FaFileMedical className="text-blue-500 flex-shrink-0 text-sm" />
                ) : (
                  <FaFilePdf className="text-red-500 flex-shrink-0 text-sm" />
                )}
                <span className="text-xs text-gray-700 flex-1 min-w-0 truncate" title={arch.nombre_original}>
                  {arch.nombre_original}
                </span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{formatBytes(arch.tamano)}</span>
                <a
                  href={arch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir / Descargar"
                  className="flex-shrink-0 text-indigo-500 hover:text-indigo-700 p-1 rounded hover:bg-indigo-50 transition"
                >
                  <FaDownload className="text-xs" />
                </a>
              </div>
            ))}
          </div>
        )}

        {doc.origen === "externo" && (!doc.archivos || doc.archivos.length === 0) && (
          <p className="text-xs text-center text-gray-400 italic py-1">Sin archivos adjuntos</p>
        )}

        {/* Eliminar (solo admin, solo externos) */}
        {puedeEliminar && doc.origen === "externo" && (
          <button
            onClick={() => onEliminar(doc.documento_id)}
            className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 mt-1 transition"
          >
            <FaTrash /> Eliminar documento
          </button>
        )}
      </div>

      {/* Lightbox para ver imágenes a pantalla completa */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Vista ampliada"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2.5 hover:bg-black/70 transition"
          >
            <FaTimes className="text-lg" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal subida ─────────────────────────────────────────────────────────────
function ModalSubir({ onClose, onSuccess, pacienteId, ordenes, prefill }) {
  const [form, setForm] = useState({
    tipo: prefill?.tipo || "laboratorio",
    titulo: prefill?.titulo || "",
    descripcion: "",
    orden_id: prefill?.orden_id || "",
    cotizacion_id: prefill?.cotizacion_id || "",
  });
  const cotizacionPrefill = String(prefill?.cotizacion_id || "");
  const ordenesDisponibles = useMemo(() => {
    if (!cotizacionPrefill) return ordenes;
    return ordenes.filter((orden) => Number(orden.cotizacion_id || 0) === Number(cotizacionPrefill));
  }, [cotizacionPrefill, ordenes]);
  // If pre-filled, auto-select matching orden once ordenes are loaded
  const [ordenesPre] = useState(!!prefill?.orden_id);
  useEffect(() => {
    if (ordenesPre && prefill?.orden_id && ordenesDisponibles.length > 0) {
      const match = ordenesDisponibles.find((o) => String(o.id) === String(prefill.orden_id));
      if (match) setForm((p) => ({ ...p, orden_id: String(match.id) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenesDisponibles]);
  const [archivos, setArchivos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const esArchivoPermitido = (f) =>
    f.type === "application/pdf" ||
    f.type.startsWith("image/") ||
    f.name.toLowerCase().endsWith(".dcm");

  const agregarArchivos = (nuevos) => {
    const todos = Array.from(nuevos);
    const permitidos = todos.filter(esArchivoPermitido);
    if (permitidos.length < todos.length) {
      Swal.fire(
        "Archivos no válidos ignorados",
        "Solo se permiten: PDF, imágenes (JPG/PNG/WebP/GIF/BMP) y archivos DICOM (.dcm).",
        "warning"
      );
    }
    setArchivos((prev) => [...prev, ...permitidos]);
  };

  const handleSubmit = async () => {
    if (!form.titulo.trim()) {
      Swal.fire("Falta título", "Ingresa un título descriptivo para el documento.", "warning");
      return;
    }
    if (archivos.length === 0) {
      Swal.fire("Sin archivos", "Selecciona al menos un PDF.", "warning");
      return;
    }
    setSubiendo(true);
    const fd = new FormData();
    fd.append("paciente_id", pacienteId);
    fd.append("tipo", form.tipo);
    fd.append("titulo", form.titulo.trim());
    fd.append("descripcion", form.descripcion.trim());
    if (form.orden_id) fd.append("orden_id", form.orden_id);
    if (form.cotizacion_id) fd.append("cotizacion_id", form.cotizacion_id);
    archivos.forEach((f) => fd.append("archivos[]", f));

    try {
      const res = await fetch(`${BASE_URL}api_documentos_paciente.php`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.archivos_subidos);
      } else {
        Swal.fire("Error", data.error || "No se pudo subir el documento.", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión al subir archivos.", "error");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-blue-600 rounded-t-2xl">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <MdOutlineUploadFile className="text-xl" /> Subir Documento Externo
          </h3>
          <button onClick={onClose} disabled={subiendo} className="text-white/70 hover:text-white transition">
            <FaTimes className="text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tipo de documento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TIPO_OPCIONES.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tipo: op.value, orden_id: op.value !== "laboratorio" ? "" : p.orden_id }))}
                  className={`px-2 py-2 rounded-xl border text-xs font-semibold transition text-center ${
                    form.tipo === op.value
                      ? "bg-indigo-600 text-white border-indigo-600 shadow"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Título descriptivo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Ej: Resultados genética — Lab. Roe Lima — Mar 2026"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Notas u observaciones{" "}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej: Enviado por Lab. Roe Lima, referencia #12345. Solicitado Dr. García."
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-none"
            />
          </div>

          {/* Orden relacionada — solo visible para tipo laboratorio */}
          {form.tipo === "laboratorio" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <label className="block text-sm font-semibold text-gray-700 mb-0.5">
                📋 ¿Este PDF es el resultado de una orden del sistema?{" "}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Si el médico ya registró la orden de laboratorio aquí, selecciónala para que
                el resultado quede adjunto a ella en la historia clínica.
                Si el PDF es de un laboratorio externo sin orden previa, deja esta opción en blanco.
              </p>
              {ordenesDisponibles.length > 0 ? (
                <select
                  value={form.orden_id}
                  onChange={(e) => setForm((p) => ({ ...p, orden_id: e.target.value }))}
                  className="w-full border border-blue-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none bg-white"
                >
                  <option value="">— No, es un documento independiente —</option>
                  {ordenesDisponibles.map((o) => {
                    const nombres = o.examenes_nombres?.length
                      ? o.examenes_nombres.slice(0, 3).join(", ") + (o.examenes_nombres.length > 3 ? "…" : "")
                      : `${o.examenes_count} examen(es)`;
                    return (
                      <option key={o.id} value={o.id}>
                        Orden #{o.id} · {formatFecha(o.fecha)} — {nombres}
                      </option>
                    );
                  })}
                </select>
              ) : cotizacionPrefill ? (
                <div className="rounded-xl border border-dashed border-blue-300 bg-white/70 px-3 py-2 text-xs text-blue-700">
                  Esta cotización no tiene una orden interna de laboratorio asociada. El archivo se guardará igual enlazado a la cotización.
                </div>
              ) : null}
            </div>
          )}

          {/* Drop zone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Archivos PDF{" "}
              <span className="text-red-500">*</span>
              <span className="ml-1 text-gray-400 font-normal text-xs">
                — Puedes subir varios a la vez
              </span>
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                agregarArchivos(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
                  : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
              }`}
            >
              <FaCloudUploadAlt
                className={`text-5xl mx-auto mb-2 transition ${
                  dragOver ? "text-indigo-500" : "text-gray-300"
                }`}
              />
              <p className="text-sm font-semibold text-gray-600">
                {dragOver
                  ? "¡Suelta los PDFs aquí!"
                  : "Arrastra tus PDFs aquí o haz clic para seleccionar"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                PDF · Imágenes (JPG, PNG, WebP) · DICOM (.dcm) · Máx 25 MB · Múltiples
              </p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="application/pdf,image/*,.dcm"
                className="hidden"
                onChange={(e) => agregarArchivos(e.target.files)}
              />
            </div>

            {/* Lista de archivos seleccionados */}
            {archivos.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">
                  {archivos.length} archivo{archivos.length !== 1 ? "s" : ""} listo{archivos.length !== 1 ? "s" : ""}:
                </p>
                {archivos.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200"
                  >
                    {f.type.startsWith("image/") ? (
                      <FaImage className="text-green-500 flex-shrink-0" />
                    ) : f.name.toLowerCase().endsWith(".dcm") ? (
                      <FaFileMedical className="text-blue-500 flex-shrink-0" />
                    ) : (
                      <FaFilePdf className="text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchivos((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                      className="text-gray-400 hover:text-red-500 transition flex-shrink-0"
                      title="Quitar"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer modal */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={subiendo}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={subiendo || archivos.length === 0}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
          >
            {subiendo ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <FaCloudUploadAlt />
                Subir {archivos.length > 0 ? `${archivos.length} archivo${archivos.length !== 1 ? "s" : ""}` : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function DocumentosPacientePage({ usuario }) {
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [paciente, setPaciente]       = useState(null);
  const [documentos, setDocumentos]   = useState([]);
  const [ordenes, setOrdenes]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [tabActivo, setTabActivo]     = useState("todos");
  const [modalSubir, setModalSubir]   = useState(false);
  const [prefillModal, setPrefillModal] = useState(null); // {orden_id, titulo, tipo, cotizacion_id}
  const [busqueda, setBusqueda]       = useState("");

  // Filtro por cotización derivado de la URL (?cotizacion_id=X)
  const filtroCotizacion = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const cid = sp.get('cotizacion_id');
    return cid ? Number(cid) : null;
  }, [location.search]);

  const rolesSubida = ["administrador", "recepcionista", "laboratorista"];
  const puedeSubir    = rolesSubida.includes(usuario?.rol);
  const puedeEliminar = usuario?.rol === "administrador";
  const puedeProcesarLaboratorio = rolesSubida.includes(usuario?.rol);

  const abrirEnPanelLaboratorio = useCallback((doc) => {
    const ordenId = Number(doc?.orden_id || 0);
    if (ordenId <= 0) return;
    const params = new URLSearchParams();
    params.set("orden_id", String(ordenId));
    const cotId = Number(doc?.cotizacion_id || filtroCotizacion || 0);
    if (cotId > 0) params.set("cotizacion_id", String(cotId));
    const retornoActual = `${location.pathname}${location.search || ''}`;
    const retorno = retornoActual || `/consumo-paciente/${pacienteId}`;
    if (retorno) params.set("back_to", retorno);
    navigate(`/panel-laboratorio?${params.toString()}`);
  }, [navigate, filtroCotizacion, location.pathname, location.search, pacienteId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${BASE_URL}api_documentos_paciente.php?paciente_id=${pacienteId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.success) {
        setPaciente(data.paciente);
        setDocumentos(data.documentos || []);
        setOrdenes(data.ordenes || []);
      } else {
        setError(data.error || "Error al cargar documentos");
      }
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-abrir modal pre-llenado si vienen parámetros en la URL
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get('abrir') === '1') {
      const pf = {
        orden_id: sp.get('orden_id') || '',
        titulo:   decodeURIComponent(sp.get('titulo') || ''),
        tipo:     sp.get('tipo') || 'laboratorio',
        cotizacion_id: sp.get('cotizacion_id') || '',
      };
      setPrefillModal(pf);
      setModalSubir(true);
      // Limpiar params de la URL sin recargar
      const clean = new URLSearchParams(sp);
      clean.delete('abrir'); clean.delete('orden_id'); clean.delete('titulo'); clean.delete('tipo');
      const newUrl = `${window.location.pathname}${clean.toString() ? '?' + clean.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tabs dinámicos según tipos presentes
  const tabs = useMemo(() => {
    const tipos = [...new Set(documentos.map((d) => d.tipo))];
    const list = [{ key: "todos", label: "Todos", count: documentos.length }];
    tipos.forEach((t) => {
      const cfg = TIPO_CONFIG[t] || TIPO_CONFIG.otro;
      list.push({ key: t, label: `${cfg.emoji} ${cfg.label}`, count: documentos.filter((d) => d.tipo === t).length });
    });
    return list;
  }, [documentos]);

  const documentosFiltrados = useMemo(() => {
    let arr = tabActivo === "todos" ? documentos : documentos.filter((d) => d.tipo === tabActivo);
    if (filtroCotizacion) {
      arr = arr.filter((d) => d.cotizacion_id === filtroCotizacion);
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      arr = arr.filter(
        (d) =>
          d.titulo?.toLowerCase().includes(q) ||
          d.descripcion?.toLowerCase().includes(q) ||
          d.examenes?.some((ex) => ex.toLowerCase().includes(q))
      );
    }
    return arr;
  }, [documentos, tabActivo, busqueda, filtroCotizacion]);

  const contadores = useMemo(() => ({
    total:      documentos.length,
    disponible: documentos.filter((d) => d.estado === "disponible").length,
    pendiente:  documentos.filter((d) => d.estado === "pendiente").length,
    externo:    documentos.filter((d) => d.origen === "externo").length,
  }), [documentos]);

  const eliminarDocumento = async (documentoId) => {
    const { isConfirmed } = await Swal.fire({
      title: "¿Eliminar documento?",
      text: "Se eliminarán también los archivos adjuntos. Esta acción es irreversible.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;
    try {
      const res = await fetch(`${BASE_URL}api_documentos_paciente.php`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento_id: documentoId }),
      });
      const data = await res.json();
      if (data.success) {
        cargar();
        Swal.fire({ icon: "success", title: "Eliminado", timer: 1200, showConfirmButton: false });
      } else {
        Swal.fire("Error", data.error || "No se pudo eliminar.", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión.", "error");
    }
  };

  const rutaVolver = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return (
      (location.state?.backTo) ||
      sp.get("back_to") ||
      `/consumo-paciente/${pacienteId}`
    );
  }, [location, pacienteId]);

  const prefillBase = useMemo(() => {
    if (prefillModal) return prefillModal;
    if (!filtroCotizacion) return null;
    return {
      tipo: 'laboratorio',
      cotizacion_id: String(filtroCotizacion),
    };
  }, [filtroCotizacion, prefillModal]);

  if (loading) return <Spinner />;
  if (error)
    return (
      <div className="max-w-3xl mx-auto p-6 mt-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{error}</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-700 via-blue-600 to-cyan-600 shadow-xl">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <button
            onClick={() => navigate(rutaVolver)}
            className="mb-4 inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition"
          >
            ← Volver
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <FaUserCircle className="text-3xl text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">
                {paciente?.nombre} {paciente?.apellido}
              </h1>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-sm text-white/75">
                <span>DNI: <b className="text-white">{paciente?.dni}</b></span>
                <span>H.C.: <b className="text-white">{paciente?.historia_clinica}</b></span>
              </div>
            </div>
            {puedeSubir && (
              <button
                onClick={() => setModalSubir(true)}
                className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-indigo-50 transition text-sm"
              >
                <FaCloudUploadAlt className="text-lg" /> Subir Documento
              </button>
            )}
          </div>

          {/* Métricas rápidas */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total",         value: contadores.total,      color: "bg-white/10" },
              { label: "Disponibles",   value: contadores.disponible,  color: "bg-green-500/20" },
              { label: "Pendientes",    value: contadores.pendiente,   color: "bg-amber-500/20" },
              { label: "Ext. subidos",  value: contadores.externo,     color: "bg-blue-500/20" },
            ].map((m) => (
              <div key={m.label} className={`${m.color} rounded-xl px-3 py-2 text-center`}>
                <div className="text-2xl font-bold text-white">{m.value}</div>
                <div className="text-[11px] text-white/70">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Buscador + Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTabActivo(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                  tabActivo === tab.key
                    ? "bg-indigo-600 text-white border-indigo-600 shadow"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700"
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tabActivo === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          <div className="sm:ml-auto">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título o examen..."
              className="w-full sm:w-64 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>
        </div>

        {/* Pill de filtro por cotización */}
        {filtroCotizacion && (
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
              📋 Resultados de Cotización #{filtroCotizacion}
              <button
                onClick={() => {
                  const sp = new URLSearchParams(location.search);
                  sp.delete('cotizacion_id');
                  navigate(`${location.pathname}${sp.toString() ? '?' + sp.toString() : ''}`);
                }}
                className="ml-1 text-emerald-500 hover:text-red-500 transition font-bold leading-none"
                title="Quitar filtro"
                aria-label="Quitar filtro de cotización"
              >
                ×
              </button>
            </span>
          </div>
        )}

        {/* Grid de documentos */}
        {documentosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-16 text-center">
            <div className="text-6xl mb-3">📂</div>
            <p className="text-gray-500 font-semibold text-sm">No hay documentos en esta categoría</p>
            {puedeSubir && tabActivo !== "todos" && (
              <button
                onClick={() => setModalSubir(true)}
                className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition text-sm"
              >
                <FaCloudUploadAlt /> Subir primer documento
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {documentosFiltrados.map((doc) => (
              <DocumentoCard
                key={doc.id}
                doc={doc}
                onEliminar={eliminarDocumento}
                puedeEliminar={puedeEliminar}
                cotizacionResaltada={filtroCotizacion}
                puedeProcesarLaboratorio={puedeProcesarLaboratorio}
                onAbrirLaboratorio={abrirEnPanelLaboratorio}
              />
            ))}
          </div>
        )}

        <div className="h-10" />
      </div>

      {/* ── Modal subir ────────────────────────────────────────────────────── */}
      {modalSubir && (
        <ModalSubir
          pacienteId={pacienteId}
          ordenes={ordenes}
          prefill={prefillBase}
          onClose={() => { setModalSubir(false); setPrefillModal(null); }}
          onSuccess={async (n) => {
            setModalSubir(false);
            setPrefillModal(null);
            await Swal.fire({
              icon: "success",
              title: "¡Subido!",
              text: `${n} archivo${n !== 1 ? "s" : ""} guardado${n !== 1 ? "s" : ""} correctamente.`,
              timer: 2000,
              showConfirmButton: false,
            });
            cargar();
          }}
        />
      )}
    </div>
  );
}
