import { BASE_URL } from "../config/config";

function resolveUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return BASE_URL;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  if (raw === base || raw.startsWith(`${base}/`)) {
    return raw;
  }
  const rel = raw.replace(/^\/+/, "");
  return `${base}/${rel}`;
}

export function resolveAppUrl(path) {
  return resolveUrl(path);
}

export function authFetch(path, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const merged = {
    credentials: "include",
    ...init,
  };

  if (isRead && typeof merged.cache === "undefined") {
    merged.cache = "no-store";
  }

  return fetch(resolveUrl(path), merged);
}
