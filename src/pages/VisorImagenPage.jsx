import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/comunes/Spinner";
import DicomViewer from "../components/visor/DicomViewer";
import {
  FaSearchPlus, FaSearchMinus, FaExpand, FaCompress,
  FaUndo, FaRedo, FaDownload, FaTimes, FaChevronLeft,
  FaChevronRight, FaFilePdf, FaFileMedical,
} from "react-icons/fa";

// ── Tipos ──────────────────────────────────────────────────────────────────────
const TIPO_INFO = {
  rx:         { label: "Rayos X",    emoji: "📸" },
  ecografia:  { label: "Ecografía",  emoji: "🫀" },
  tomografia: { label: "Tomografía", emoji: "🔬" },
};

function formatBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024)    return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}

// ── Componente visor de imagen: zoom, pan, rotate ─────────────────────────────
function ImageViewer({ src, nombre }) {
  const [zoom, setZoom]     = useState(1);
  const [pan, setPan]       = useState({ x: 0, y: 0 });
  const [rotate, setRotate] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const containerRef = useRef();

  // Reset when image changes
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0); }, [src]);

  const clampZoom = (z) => Math.min(Math.max(z, 0.2), 10);

  // Mouse wheel → zoom
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.15 : -0.15)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // Mouse drag → pan
  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  };
  const onMouseUp = () => { setDragging(false); dragStart.current = null; };

  // Touch support
  // touch drag state is kept inline in handlers
  const onTouchStart = (e) => {
    if (e.touches.length === 1 && zoom > 1) {
      setDragging(true);
      dragStart.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, px: pan.x, py: pan.y };
    }
  };
  const onTouchMove = (e) => {
    if (!dragging || !dragStart.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.current.mx;
    const dy = e.touches[0].clientY - dragStart.current.my;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  };
  const onTouchEnd = () => { setDragging(false); dragStart.current = null; };

  const resetView   = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0); };
  const fitToScreen = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1.5 bg-gray-900 px-4 py-2 flex-wrap">
        <button onClick={() => setZoom((z) => clampZoom(z - 0.25))} title="Alejar" className="toolbar-btn">
          <FaSearchMinus />
        </button>
        <span className="text-white text-xs font-mono w-14 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clampZoom(z + 0.25))} title="Acercar" className="toolbar-btn">
          <FaSearchPlus />
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button onClick={() => setRotate((r) => r - 90)} title="Rotar izquierda" className="toolbar-btn">
          <FaUndo />
        </button>
        <button onClick={() => setRotate((r) => r + 90)} title="Rotar derecha" className="toolbar-btn">
          <FaRedo />
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button onClick={fitToScreen} title="Ajustar a pantalla" className="toolbar-btn">
          <FaExpand />
        </button>
        <button onClick={resetView} title="Restablecer vista" className="toolbar-btn text-xs px-2">
          1:1
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <a href={src} download={nombre} target="_blank" rel="noopener noreferrer" title="Descargar" className="toolbar-btn">
          <FaDownload />
        </a>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-950 flex items-center justify-center select-none"
        style={{ cursor: dragging ? "grabbing" : zoom > 1 ? "grab" : "default" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={src}
          alt={nombre}
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotate}deg)`,
            transformOrigin: "center center",
            maxWidth: "100%",
            maxHeight: "100%",
            transition: dragging ? "none" : "transform 0.15s ease",
            imageRendering: zoom > 2 ? "pixelated" : "auto",
          }}
        />
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function VisorImagenPage() {
  const { ordenId } = useParams();
  const navigate    = useNavigate();

  const [orden, setOrden]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fullscreen, setFullscreen]   = useState(false);

  // Computed before hooks — safe when orden is null
  // DICOM y imágenes normales son ambas "visualizables" en el área principal
  const todasLasVisualizable = (orden?.archivos || []).filter((a) => a.es_imagen || a.es_dicom);
  const todasLasImagenes = todasLasVisualizable; // alias usado en el resto del código

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}api_ordenes_imagen.php?orden_id=${ordenId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setOrden(d.orden);
          setSelectedIdx(0);
        } else {
          setError(d.error || "No se pudo cargar la orden");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [ordenId]);

  const irAnterior  = () => setSelectedIdx((i) => Math.max(i - 1, 0));
  const irSiguiente = () => setSelectedIdx((i) => Math.min(i + 1, todasLasImagenes.length - 1));

  // Keyboard navigation (always called, not conditional)
  useEffect(() => {
    const count = todasLasImagenes.length;
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  setSelectedIdx((i) => Math.max(i - 1, 0));
      if (e.key === "ArrowRight") setSelectedIdx((i) => Math.min(i + 1, count - 1));
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [todasLasImagenes.length]);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <Spinner />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white">
      <p className="text-red-400 text-lg mb-4">⚠ {error}</p>
      <button onClick={() => navigate(-1)} className="bg-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-600">← Volver</button>
    </div>
  );

  const tipo       = TIPO_INFO[orden.tipo] || { label: orden.tipo, emoji: "🩻" };
  const noImagenes = (orden.archivos || []).filter((a) => !a.es_imagen && !a.es_dicom);
  const selected   = todasLasImagenes[selectedIdx];

  const pac    = orden.paciente;
  const con    = orden.consulta;

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-[300]" : "min-h-screen"} bg-gray-950 flex flex-col`}>
      {/* ── Barra superior ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center flex-wrap gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white transition flex items-center gap-1.5 text-sm"
        >
          <FaChevronLeft /> Volver
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="text-2xl">{tipo.emoji}</span>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-base leading-tight">{tipo.label}</h1>
            {pac && (
              <p className="text-gray-400 text-xs truncate">
                {pac.nombre} · DNI: {pac.dni}
              </p>
            )}
          </div>
          {con && (
            <div className="text-gray-500 text-xs border-l border-gray-700 pl-3 flex-shrink-0">
              <span className="text-gray-300">{con.med_nombre}</span>
              <br />
              {con.especialidad}
            </div>
          )}
        </div>

        {orden.indicaciones && (
          <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-300 max-w-xs truncate" title={orden.indicaciones}>
            📋 {orden.indicaciones}
          </div>
        )}

        <button
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          className="text-gray-400 hover:text-white transition"
        >
          {fullscreen ? <FaCompress /> : <FaExpand />}
        </button>
      </div>

      {/* ── Área principal ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel lateral de miniaturas */}
        <div className="w-24 sm:w-32 bg-gray-900 border-r border-gray-800 overflow-y-auto flex-shrink-0 p-2 space-y-2">
          {todasLasImagenes.length === 0 && (
            <p className="text-gray-600 text-[10px] text-center pt-4">Sin imágenes</p>
          )}
          {todasLasImagenes.map((arch, idx) => (
            <button
              key={arch.id}
              onClick={() => setSelectedIdx(idx)}
              className={`w-full aspect-square rounded-lg overflow-hidden border-2 transition ${
                idx === selectedIdx ? "border-blue-400 opacity-100" : "border-transparent opacity-60 hover:opacity-90"
              }`}
              title={arch.nombre_original}
            >
              {arch.es_dicom ? (
                <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center gap-1">
                  <FaFileMedical className="text-blue-400 text-xl" />
                  <span className="text-[8px] text-gray-400">DICOM</span>
                </div>
              ) : (
                <img src={arch.url} alt={arch.nombre_original} className="w-full h-full object-cover" />
              )}
            </button>
          ))}

          {/* PDFs y DICOM en sidebar */}
          {noImagenes.map((arch) => (
            <a
              key={arch.id}
              href={arch.url}
              target="_blank"
              rel="noopener noreferrer"
              title={arch.nombre_original}
              className="flex flex-col items-center justify-center gap-1 w-full aspect-square rounded-lg border border-gray-700 hover:border-gray-500 bg-gray-800 hover:bg-gray-700 transition p-2"
            >
              {arch.es_dicom ? (
                <FaFileMedical className="text-blue-400 text-xl" />
              ) : (
                <FaFilePdf className="text-red-400 text-xl" />
              )}
              <span className="text-[9px] text-gray-400 text-center leading-tight truncate w-full">
                {arch.nombre_original.split(".").pop()?.toUpperCase()}
              </span>
            </a>
          ))}
        </div>

        {/* Visor principal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              {selected.es_dicom ? (
                <DicomViewer key={selected.url} url={selected.url} nombre={selected.nombre_original} />
              ) : (
                <ImageViewer key={selected.url} src={selected.url} nombre={selected.nombre_original} />
              )}
              {/* Navegación inferior */}
              {todasLasImagenes.length > 1 && (
                <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 flex items-center justify-between">
                  <button
                    onClick={irAnterior}
                    disabled={selectedIdx === 0}
                    className="flex items-center gap-1 text-gray-300 hover:text-white disabled:opacity-30 text-sm transition"
                  >
                    <FaChevronLeft /> Anterior
                  </button>
                  <span className="text-gray-400 text-xs">
                    {selectedIdx + 1} / {todasLasImagenes.length} · {selected.nombre_original}
                  </span>
                  <button
                    onClick={irSiguiente}
                    disabled={selectedIdx === todasLasImagenes.length - 1}
                    className="flex items-center gap-1 text-gray-300 hover:text-white disabled:opacity-30 text-sm transition"
                  >
                    Siguiente <FaChevronRight />
                  </button>
                </div>
              )}
            </>
          ) : (
            /* No hay imágenes — solo archivos PDF/DICOM */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4 p-8">
              <p className="text-5xl">📁</p>
              <p className="text-lg font-semibold text-gray-300">Sin imágenes visualizables</p>
              <p className="text-sm text-gray-500 text-center">Los archivos PDF y DICOM disponibles se muestran en el panel lateral. Haz clic en ellos para abrirlos.</p>
              {noImagenes.length > 0 && (
                <div className="space-y-2 w-full max-w-sm">
                  {noImagenes.map((arch) => (
                    <a
                      key={arch.id}
                      href={arch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-4 py-3 transition"
                    >
                      {arch.es_dicom ? (
                        <FaFileMedical className="text-blue-400 text-xl flex-shrink-0" />
                      ) : (
                        <FaFilePdf className="text-red-400 text-xl flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{arch.nombre_original}</p>
                        <p className="text-gray-500 text-xs">{formatBytes(arch.tamano)}</p>
                      </div>
                      <FaDownload className="text-gray-400 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline styles para los botones del toolbar */}
      <style>{`
        .toolbar-btn {
          color: rgb(209 213 219);
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0.35rem 0.5rem;
          border-radius: 0.375rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
          font-size: 0.875rem;
        }
        .toolbar-btn:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }
      `}</style>
    </div>
  );
}
