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
  const { __skipAuthEvent = false, ...restInit } = init || {};
  const method = String(restInit.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const url = resolveUrl(path);
  const merged = {
    credentials: "include",
    ...restInit,
  };

  if (isRead && typeof merged.cache === "undefined") {
    merged.cache = "no-store";
  }

  return fetch(url, merged).then((response) => {
    if (!__skipAuthEvent && (response.status === 401 || response.status === 403) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-response-unauthorized", {
        detail: {
          status: response.status,
          url: response.url || url,
          method,
        },
      }));
    }
    return response;
  });
}
