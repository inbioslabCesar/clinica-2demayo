import { BASE_URL } from "../config/config";

function joinWithBase(path) {
  const base = String(BASE_URL || "/").replace(/\/+$/, "");
  const cleanPath = String(path || "").replace(/^\/+/, "");
  if (!cleanPath) return base || "/";
  if (!base) return `/${cleanPath}`;
  return `${base}/${cleanPath}`;
}

export function resolveOrdenImagenArchivoUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";

  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }

  const match = raw.match(/api_ordenes_imagen\.php\?[^\s#]*/i);
  if (match && match[0]) {
    return joinWithBase(match[0]);
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  return joinWithBase(raw);
}

export function normalizeOrdenArchivos(orden) {
  if (!orden || typeof orden !== "object") return orden;
  const archivos = Array.isArray(orden.archivos)
    ? orden.archivos.map((a) => ({
        ...a,
        url: resolveOrdenImagenArchivoUrl(a?.url),
      }))
    : [];

  return {
    ...orden,
    archivos,
  };
}
