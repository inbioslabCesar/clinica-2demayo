/**
 * DicomViewer — renderiza DICOM sin web workers usando dicom-parser + canvas.
 * Soporta: no comprimido 8/16-bit (con windowing) y JPEG encapsulado.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import dicomParser from "dicom-parser";

function tagInt(ds, tag, def = 0) {
  try { return ds.uint16(tag) ?? def; } catch { return def; }
}

function autoWindow(byteArray, pixelOffset, pixelLength, rows, cols, bitsAllocated, isSigned) {
  const total = rows * cols;
  const view = new DataView(byteArray.buffer, byteArray.byteOffset + pixelOffset, pixelLength);
  const vals = new (isSigned ? Float32Array : Float32Array)(total);
  for (let i = 0; i < total; i++) {
    if (bitsAllocated === 16) {
      vals[i] = isSigned ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
    } else {
      vals[i] = view.getUint8(i);
    }
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const p1  = sorted[Math.max(0, Math.floor(total * 0.01))];
  const p99 = sorted[Math.min(total - 1, Math.floor(total * 0.99))];
  const ww  = Math.max(1, p99 - p1);
  return { wc: Math.round(p1 + ww / 2), ww: Math.round(ww) };
}

function renderPixels(canvas, byteArray, pixelOffset, pixelLength, rows, cols, bitsAllocated, isSigned, wc, ww, invert) {
  canvas.width  = cols;
  canvas.height = rows;
  const ctx   = canvas.getContext("2d");
  const total = rows * cols;
  const rgba  = new Uint8ClampedArray(total * 4);
  const view  = new DataView(byteArray.buffer, byteArray.byteOffset + pixelOffset, pixelLength);
  const wMin  = wc - ww / 2;
  const wMax  = wc + ww / 2;
  const range = wMax - wMin;

  for (let i = 0; i < total; i++) {
    let val;
    if (bitsAllocated === 16) {
      val = isSigned ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
    } else {
      val = view.getUint8(i);
    }
    let g = range > 0 ? Math.round(((val - wMin) / range) * 255) : 128;
    g = Math.max(0, Math.min(255, g));
    if (invert) g = 255 - g;
    rgba[i * 4]     = g;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = g;
    rgba[i * 4 + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, cols, rows), 0, 0);
}

export default function DicomViewer({ url, nombre }) {
  const canvasRef = useRef(null);

  const [mode, setMode]         = useState("loading"); // loading | canvas | jpeg | error
  const [errorMsg, setErrorMsg] = useState("");
  const [jpegUrl, setJpegUrl]   = useState(null);
  const [dims, setDims]         = useState({ rows: 0, cols: 0 });
  const [wc, setWc]             = useState(128);
  const [ww, setWw]             = useState(256);
  const [invert, setInvert]     = useState(false);

  // Pixel data guardado para re-renderizar cuando cambia windowing
  const pixRef = useRef(null); // { byteArray, pixelOffset, pixelLength, rows, cols, bitsAllocated, isSigned }

  const repaint = useCallback((center, width, inv) => {
    const p = pixRef.current;
    if (!p || !canvasRef.current) return;
    renderPixels(canvasRef.current, p.byteArray, p.pixelOffset, p.pixelLength, p.rows, p.cols, p.bitsAllocated, p.isSigned, center, width, inv);
  }, []);

  useEffect(() => {
    if (!url) return;
    let revoke = null;
    setMode("loading");
    setErrorMsg("");
    pixRef.current = null;

    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} al descargar el DICOM.`);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        const byteArray = new Uint8Array(buffer);
        const ds = dicomParser.parseDicom(byteArray);

        const rows    = tagInt(ds, "x00280010");
        const cols    = tagInt(ds, "x00280011");
        const bits    = tagInt(ds, "x00280100", 8);
        const isSigned = tagInt(ds, "x00280103", 0) === 1;
        const pixelEl = ds.elements.x7fe00010;

        if (!pixelEl) throw new Error("No se encontró el Pixel Data (7FE0,0010) en el DICOM.");

        if (pixelEl.encapsulatedPixelData) {
          // ── JPEG encapsulado ─────────────────────────────────────────────
          const fragments = pixelEl.fragments || [];
          // fragments[0] suele ser el Basic Offset Table (vacío). Buscamos el primero con datos.
          const jpegFrag = fragments.find((f) => f.length > 64);
          if (!jpegFrag) throw new Error("No se pudo extraer el fotograma JPEG del DICOM.");

          const dataStart = jpegFrag.dataOffset ?? jpegFrag.offset + 8;
          const jpegBytes = byteArray.slice(dataStart, dataStart + jpegFrag.length);
          const blob = new Blob([jpegBytes], { type: "image/jpeg" });
          revoke = URL.createObjectURL(blob);
          setJpegUrl(revoke);
          setDims({ rows, cols });
          setMode("jpeg");

        } else {
          // ── No comprimido ────────────────────────────────────────────────
          if (rows <= 0 || cols <= 0) throw new Error(`Dimensiones inválidas: ${cols}×${rows}.`);

          const pixelOffset = pixelEl.dataOffset;
          const pixelLength = pixelEl.length;

          // Siempre usar auto-windowing por percentiles (p1-p99).
          // Los tags WindowCenter/WindowWidth del DICOM suelen estar mal
          // calibrados para imágenes CR/DR y producen blank/overexposed.
          const auto = autoWindow(byteArray, pixelOffset, pixelLength, rows, cols, bits, isSigned);
          const center = auto.wc;
          const width  = auto.ww;

          pixRef.current = { byteArray, pixelOffset, pixelLength, rows, cols, bitsAllocated: bits, isSigned };
          setDims({ rows, cols });
          setWc(Math.round(center));
          setWw(Math.round(width));
          setMode("canvas");
          // Primer renderizado (sin esperar el re-render del state)
          requestAnimationFrame(() => repaint(center, width, false));
        }
      })
      .catch((err) => {
        setErrorMsg(err?.message || "No se pudo leer el archivo DICOM.");
        setMode("error");
      });

    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [url, repaint]);

  // Re-pintar cuando cambia windowing (modo canvas)
  useEffect(() => {
    if (mode === "canvas") repaint(wc, ww, invert);
  }, [wc, ww, invert, mode, repaint]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (mode === "loading") return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="text-center text-white">
        <div className="animate-spin w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-gray-300">Decodificando DICOM…</p>
        <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">{nombre}</p>
      </div>
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────────
  if (mode === "error") return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black text-white gap-4 p-6">
      <p className="text-4xl">⚠️</p>
      <p className="text-red-400 font-semibold text-center max-w-sm">{errorMsg}</p>
      <p className="text-gray-500 text-xs truncate max-w-xs">{nombre}</p>
      <a href={url} download={nombre}
        className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
        ⬇ Descargar DICOM
      </a>
      <p className="text-gray-600 text-xs text-center">Visores externos: RadiAnt, MicroDicom, Horos (Mac)</p>
    </div>
  );

  // ── JPEG encapsulado: render con <img> ───────────────────────────────────────
  if (mode === "jpeg") return (
    <div className="flex flex-col h-full bg-black">
      <div className="flex items-center gap-3 bg-gray-900 px-4 py-2 text-xs border-b border-gray-800 flex-wrap">
        <span className="text-blue-400 font-semibold uppercase tracking-wide text-[10px]">DICOM · JPEG</span>
        {dims.cols > 0 && <span className="text-gray-500">{dims.cols}×{dims.rows}</span>}
        <div className="flex-1" />
        <a href={url} download={nombre}
          className="px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 transition text-xs">
          ⬇ DCM
        </a>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black">
        <img src={jpegUrl} alt={nombre} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
      </div>
    </div>
  );

  // ── Canvas no comprimido con windowing ───────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-black">
      <div className="flex items-center gap-3 bg-gray-900 px-4 py-2 text-xs border-b border-gray-800 flex-wrap">
        <span className="text-blue-400 font-semibold uppercase tracking-wide text-[10px]">DICOM</span>
        {dims.cols > 0 && <span className="text-gray-500">{dims.cols}×{dims.rows}px</span>}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-gray-300">
          <span className="text-gray-500">WC:</span>
          <input type="range" min={-1000} max={3000} step={5} value={wc}
            onChange={(e) => setWc(Number(e.target.value))} className="w-24 accent-blue-400" />
          <span className="w-12 font-mono text-right">{wc}</span>
        </label>
        <label className="flex items-center gap-1.5 text-gray-300">
          <span className="text-gray-500">WW:</span>
          <input type="range" min={1} max={4000} step={5} value={ww}
            onChange={(e) => setWw(Math.max(1, Number(e.target.value)))} className="w-24 accent-blue-400" />
          <span className="w-12 font-mono text-right">{ww}</span>
        </label>
        <button onClick={() => setInvert((v) => !v)}
          className={`px-2 py-0.5 rounded border text-xs transition ${invert ? "border-blue-400 text-blue-300 bg-blue-900/30" : "border-gray-600 text-gray-400 hover:border-gray-400"}`}>
          Invertir
        </button>
        <a href={url} download={nombre}
          className="px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 transition text-xs">
          ⬇ DCM
        </a>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black">
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
      </div>
    </div>
  );
}
