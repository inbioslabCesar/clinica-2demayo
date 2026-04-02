import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/comunes/Spinner";
import Swal from "sweetalert2";
import {
  FaCloudUploadAlt, FaImage, FaFilePdf, FaFileMedical,
  FaTrash, FaExpand, FaTimes, FaDownload, FaCheckCircle,
  FaClock, FaUserCircle,
} from "react-icons/fa";

// ── Helpers ───────────────────────────────────────────────────────────────────
const TIPO_INFO = {
  rx:         { label: "Rayos X",    emoji: "📸", color: "sky" },
  ecografia:  { label: "Ecografía",  emoji: "🫀", color: "violet" },
  tomografia: { label: "Tomografía", emoji: "🔬", color: "amber" },
};
const TABS = [
  { key: "todos",      label: "Todas" },
  { key: "rx",         label: "Rayos X 📸" },
  { key: "ecografia",  label: "Ecografía 🫀" },
  { key: "tomografia", label: "Tomografía 🔬" },
];
function formatBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024)    return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}
function esArchivoPermitido(f) {
  return f.type === "application/pdf" || f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".dcm");
}

// ── Modal de subida de archivos ───────────────────────────────────────────────
function ModalSubir({ orden, onClose, onSubido }) {
  const [archivos, setArchivos]   = useState([]);
  const [subiendo, setSubiendo]   = useState(false);
  const [drag, setDrag]           = useState(false);
  const fileRef = useRef();

  const agregar = (files) => {
    const todos     = Array.from(files);
    const permitidos = todos.filter(esArchivoPermitido);
    if (permitidos.length < todos.length) {
      Swal.fire("Archivos ignorados", "Solo se aceptan: PDF, imágenes (JPG/PNG/WebP/GIF/BMP) y DICOM (.dcm).", "warning");
    }
    setArchivos((p) => [...p, ...permitidos]);
  };

  const quitar = (i) => setArchivos((p) => p.filter((_, idx) => idx !== i));

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    agregar(e.dataTransfer.files);
  };

  const handleSubir = async () => {
    if (!archivos.length) return;
    setSubiendo(true);
    const fd = new FormData();
    fd.append("orden_id", orden.id);
    archivos.forEach((f) => fd.append("archivos[]", f));
    try {
      const res = await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
        method: "POST", credentials: "include", body: fd,
      });
      const d = await res.json();
      if (d.success) {
        Swal.fire("Listo", `${d.subidos} archivo(s) subido(s) correctamente.`, "success");
        onSubido();
        onClose();
      } else {
        Swal.fire("Error", d.error || "No se pudieron subir los archivos.", "error");
      }
    } catch {
      Swal.fire("Error", "Error de conexión.", "error");
    }
    setSubiendo(false);
  };

  const tipo = TIPO_INFO[orden.tipo] || { label: orden.tipo, emoji: "🩻" };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-base">{tipo.emoji} Subir archivos — {tipo.label}</h3>
            <p className="text-white/70 text-xs mt-0.5">
              {orden.indicaciones ? `Indicaciones: ${orden.indicaciones}` : "Sin indicaciones específicas"}
            </p>
          </div>
          <button onClick={onClose} disabled={subiendo} className="text-white/70 hover:text-white transition">
            <FaTimes />
          </button>
        </div>
        <div className="p-5">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${drag ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <FaCloudUploadAlt className="text-4xl text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Arrastra archivos o haz clic para seleccionar</p>
            <p className="text-xs text-gray-400 mt-1">PDF · Imágenes (JPG, PNG, WebP) · DICOM (.dcm) · Máx 100 MB</p>
            <input ref={fileRef} type="file" multiple accept="application/pdf,image/*,.dcm" className="hidden" onChange={(e) => agregar(e.target.files)} />
          </div>

          {/* Lista de archivos seleccionados */}
          {archivos.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500">{archivos.length} archivo(s) listo(s):</p>
              {archivos.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
                  {f.type.startsWith("image/") ? (
                    <FaImage className="text-green-500 flex-shrink-0" />
                  ) : f.name.toLowerCase().endsWith(".dcm") ? (
                    <FaFileMedical className="text-blue-500 flex-shrink-0" />
                  ) : (
                    <FaFilePdf className="text-red-500 flex-shrink-0" />
                  )}
                  <span className="text-xs flex-1 text-gray-700 truncate min-w-0">{f.name}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{formatBytes(f.size)}</span>
                  <button onClick={() => quitar(i)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><FaTimes className="text-xs" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 mt-4">
            <button onClick={onClose} disabled={subiendo} className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2 text-sm hover:bg-gray-200 transition">Cancelar</button>
            <button onClick={handleSubir} disabled={subiendo || !archivos.length} className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
              {subiendo ? "Subiendo..." : `Subir ${archivos.length ? archivos.length + " archivo(s)" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de orden ──────────────────────────────────────────────────────────
function OrdenCard({ orden, onSubir, onRecargar, navigate }) {
  const [lightbox, setLightbox]         = useState(null);
  const [toggling, setToggling]         = useState(false);
  const tipo = TIPO_INFO[orden.tipo] || { label: orden.tipo, emoji: "🩻", color: "gray" };

  const cotizEstadoPagado = (cot) => cot && (cot.estado === "completado" || cot.estado === "pagado");

  const cotizPagada =
    parseInt(orden.carga_anticipada) === 1 ||
    !orden.cotizacion_id ||
    cotizEstadoPagado(orden.cotizacion);

  const handleEliminarArchivo = async (archivoId) => {
    const { isConfirmed } = await Swal.fire({ title: "¿Eliminar archivo?", icon: "warning", showCancelButton: true, confirmButtonText: "Sí, eliminar", cancelButtonText: "Cancelar" });
    if (!isConfirmed) return;
    await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "eliminar_archivo", archivo_id: archivoId }),
    });
    onRecargar();
  };

  const handleToggleAnticipada = async () => {
    const nuevoValor = parseInt(orden.carga_anticipada) === 1 ? 0 : 1;
    if (nuevoValor === 1) {
      const { isConfirmed } = await Swal.fire({
        title: "⚡ Activar carga anticipada",
        text: "Esto permitirá subir resultados sin esperar el pago de la cotización. Solo para casos urgentes.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, activar",
        cancelButtonText: "Cancelar",
      });
      if (!isConfirmed) return;
    }
    setToggling(true);
    try {
      await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_anticipada", orden_id: orden.id, valor: nuevoValor }),
      });
      onRecargar();
    } catch { /* ignore */ }
    setToggling(false);
  };

  const imagenes = orden.archivos.filter((a) => a.es_imagen);
  const otros    = orden.archivos.filter((a) => !a.es_imagen);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 bg-${tipo.color}-50 border-b border-${tipo.color}-100 flex items-center justify-between flex-wrap gap-2`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{tipo.emoji}</span>
          <div>
            <span className="font-bold text-gray-800 text-sm">{tipo.label}</span>
            {Number(orden.cotizacion_id || 0) > 0 && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Orden creada desde cotización #{orden.cotizacion_id}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
            orden.estado === "completado" ? "bg-green-100 text-green-700" :
            orden.estado === "cancelado"  ? "bg-red-100 text-red-600" :
            "bg-yellow-100 text-yellow-700"
          }`}>
            {orden.estado === "completado" ? "✓" : orden.estado === "pendiente" ? "⏳" : "✕"} {orden.estado}
          </span>
          {parseInt(orden.carga_anticipada) === 1 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚡ Urgente</span>
          )}
          {orden.cotizacion && (
            cotizEstadoPagado(orden.cotizacion)
              ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">💰 Pagado</span>
              : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">⏳ {orden.cotizacion.numero_comprobante} · Pendiente pago</span>
          )}
          <p className="text-[10px] text-gray-400">
            {new Date(orden.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="p-4">
        {/* Thumbnails de imágenes */}
        {imagenes.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-3">
            {imagenes.map((arch) => (
              <button
                key={arch.id}
                onClick={() => setLightbox(arch.url)}
                className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100"
                title={arch.nombre_original}
              >
                <img src={arch.url} alt={arch.nombre_original} className="w-full h-full object-cover transition group-hover:opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                  <FaExpand className="text-white drop-shadow-lg" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEliminarArchivo(arch.id); }}
                  className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                  title="Eliminar"
                >
                  <FaTimes className="text-[10px]" />
                </button>
              </button>
            ))}
          </div>
        )}

        {/* PDFs y DICOM */}
        {otros.map((arch) => (
          <div key={arch.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 mb-1.5">
            {arch.es_dicom ? (
              <FaFileMedical className="text-blue-500 flex-shrink-0 text-sm" />
            ) : (
              <FaFilePdf className="text-red-500 flex-shrink-0 text-sm" />
            )}
            <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{arch.nombre_original}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{formatBytes(arch.tamano)}</span>
            <a href={arch.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 p-1 flex-shrink-0">
              <FaDownload className="text-xs" />
            </a>
            <button onClick={() => handleEliminarArchivo(arch.id)} className="text-gray-400 hover:text-red-500 p-1 flex-shrink-0">
              <FaTrash className="text-xs" />
            </button>
          </div>
        ))}

        {orden.archivos.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-2">Sin archivos subidos aún.</p>
        )}

        {/* Acciones */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {cotizPagada ? (
            <button
              onClick={() => onSubir(orden)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            >
              <FaCloudUploadAlt /> Subir archivos
            </button>
          ) : (
            <div
              className="flex items-center gap-1.5 bg-gray-200 text-gray-500 text-xs px-3 py-1.5 rounded-lg font-semibold cursor-not-allowed"
              title="Requiere pago de cotización o carga anticipada habilitada"
            >
              <FaCloudUploadAlt /> Subir archivos (requiere pago)
            </div>
          )}
          {orden.archivos.length > 0 && (
            <button
              onClick={() => navigate(`/visor-imagen/${orden.id}`)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            >
              🖼️ Abrir visor
            </button>
          )}
          {/* Toggle carga anticipada */}
          {!cotizPagada && (
            <button
              onClick={handleToggleAnticipada}
              disabled={toggling}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition disabled:opacity-50"
              title="Permite subir sin esperar el pago"
            >
              ⚡ Carga anticipada
            </button>
          )}
          {parseInt(orden.carga_anticipada) === 1 && (
            <button
              onClick={handleToggleAnticipada}
              disabled={toggling}
              className="flex items-center gap-1.5 bg-gray-400 hover:bg-gray-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition disabled:opacity-50"
              title="Desactivar carga anticipada"
            >
              ✕ Desactivar urgente
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Vista ampliada" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2.5 hover:bg-black/70 transition">
            <FaTimes className="text-lg" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function OrdenesImagenPacientePage() {
  const { pacienteId } = useParams();
  const navigate       = useNavigate();
  const location       = useLocation();
  const [ordenes, setOrdenes]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tabActivo, setTabActivo]     = useState("todos");
  const [paciente, setPaciente]       = useState(null);
  const [ordenSubir, setOrdenSubir]   = useState(null); // orden para el modal
  const [intentadoGenerarDesdeCotizacion, setIntentadoGenerarDesdeCotizacion] = useState(false);

  const cotizacionIdFiltro = Number(new URLSearchParams(location.search).get("cotizacion_id") || 0);

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${BASE_URL}api_ordenes_imagen.php?paciente_id=${pacienteId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setOrdenes(d.ordenes || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pacienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.paciente) setPaciente(d.paciente); })
      .catch(() => {});
  }, [pacienteId]);

  useEffect(() => {
    setIntentadoGenerarDesdeCotizacion(false);
  }, [cotizacionIdFiltro]);

  useEffect(() => {
    const generarSiCorresponde = async () => {
      if (loading) return;
      if (cotizacionIdFiltro <= 0) return;
      if (intentadoGenerarDesdeCotizacion) return;

      const existeOrden = ordenes.some(
        (o) => Number(o.cotizacion_id || 0) === Number(cotizacionIdFiltro)
      );
      if (existeOrden) return;

      setIntentadoGenerarDesdeCotizacion(true);
      try {
        const res = await fetch(`${BASE_URL}api_ordenes_imagen.php`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "crear_desde_cotizacion",
            cotizacion_id: Number(cotizacionIdFiltro),
            paciente_id: Number(pacienteId || 0),
          }),
        });
        const data = await res.json();
        if (data?.success && Number(data.creadas || 0) > 0) {
          cargar();
        }
      } catch {
        // no-op
      }
    };

    generarSiCorresponde();
  }, [loading, cotizacionIdFiltro, intentadoGenerarDesdeCotizacion, ordenes, pacienteId, cargar]);

  const ordenesBase = cotizacionIdFiltro > 0
    ? ordenes.filter((o) => Number(o.cotizacion_id || 0) === Number(cotizacionIdFiltro))
    : ordenes;

  const ordenesFiltradas = tabActivo === "todos"
    ? ordenesBase
    : ordenesBase.filter((o) => o.tipo === tabActivo);

  const pendientes  = ordenesBase.filter((o) => o.estado === "pendiente").length;
  const completados = ordenesBase.filter((o) => o.estado === "completado").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 via-blue-600 to-cyan-600 shadow-xl">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/consumo-paciente/${pacienteId}`))}
            className="mb-4 inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition"
          >
            ← Volver
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">🩻</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                Imágenes Diagnósticas
              </h1>
              {paciente && (
                <p className="text-white/80 text-sm mt-0.5">
                  {paciente.nombres} {paciente.apellidos} · DNI: {paciente.dni}
                </p>
              )}
            </div>
          </div>
          {/* Stats rápidos */}
          <div className="flex gap-4 mt-4">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-white text-lg font-bold">{ordenesBase.length}</p>
              <p className="text-white/70 text-[11px]">Total</p>
            </div>
            <div className="bg-yellow-400/20 rounded-xl px-3 py-2 text-center">
              <p className="text-yellow-200 text-lg font-bold">{pendientes}</p>
              <p className="text-yellow-200/70 text-[11px]">Pendientes</p>
            </div>
            <div className="bg-green-400/20 rounded-xl px-3 py-2 text-center">
              <p className="text-green-200 text-lg font-bold">{completados}</p>
              <p className="text-green-200/70 text-[11px]">Completados</p>
            </div>
          </div>
        </div>
      </div>

      {cotizacionIdFiltro > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-4 py-2 text-sm font-medium">
            Mostrando imágenes de la cotización #{cotizacionIdFiltro}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTabActivo(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition border ${
                tabActivo === t.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        {loading ? (
          <Spinner />
        ) : ordenesFiltradas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
            <p className="text-4xl mb-3">🩻</p>
            <p className="font-semibold">No hay órdenes de imágenes{tabActivo !== "todos" ? ` de ${TIPO_INFO[tabActivo]?.label}` : ""}.</p>
            <p className="text-sm mt-1 text-gray-400">Las solicitudes las genera el médico desde la Historia Clínica.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ordenesFiltradas.map((ord) => (
              <OrdenCard
                key={ord.id}
                orden={ord}
                onSubir={setOrdenSubir}
                onRecargar={cargar}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal subir */}
      {ordenSubir && (
        <ModalSubir
          orden={ordenSubir}
          onClose={() => setOrdenSubir(null)}
          onSubido={cargar}
        />
      )}
    </div>
  );
}
