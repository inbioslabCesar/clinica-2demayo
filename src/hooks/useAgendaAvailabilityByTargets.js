import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../utils/apiClient";
import { BASE_URL } from "../config/config";

function normalizeHourHm(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hmToMinutes(hm) {
  const norm = normalizeHourHm(hm);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  return h * 60 + m;
}

function buildNormalizedTargets(rawTargets) {
  const unique = new Map();
  for (const raw of Array.isArray(rawTargets) ? rawTargets : []) {
    const medicoId = Number(raw?.medicoId || 0);
    const fecha = String(raw?.fecha || "").slice(0, 10);
    if (medicoId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const key = String(raw?.key || `${medicoId}|${fecha}`);
    if (!unique.has(key)) {
      unique.set(key, { medicoId, fecha, key });
    }
  }
  return Array.from(unique.values());
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const waitMs = Math.max(1000, Number(timeoutMs) || 10000);
  let timerId = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error("Tiempo de espera agotado al cargar disponibilidad")), waitMs);
    });
    const response = await Promise.race([
      authFetch(url, options),
      timeoutPromise,
    ]);
    return await response.json();
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}

export default function useAgendaAvailabilityByTargets({ targets, enabled = true }) {
  const [availabilityByPair, setAvailabilityByPair] = useState({});
  const availabilityRef = useRef({});
  const normalizedTargets = useMemo(() => buildNormalizedTargets(targets), [targets]);
  const normalizedTargetsKey = useMemo(
    () => normalizedTargets.map((target) => target.key).sort().join("|"),
    [normalizedTargets]
  );

  useEffect(() => {
    availabilityRef.current = availabilityByPair;
  }, [availabilityByPair]);

  useEffect(() => {
    const activeKeys = new Set(normalizedTargets.map((target) => target.key));
    setAvailabilityByPair((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach((key) => {
        if (activeKeys.has(key)) {
          next[key] = prev[key];
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [normalizedTargets, normalizedTargetsKey]);

  useEffect(() => {
    if (!enabled || normalizedTargets.length === 0) return;
    const snapshot = availabilityRef.current || {};
    const missing = normalizedTargets.filter((target) => {
      const state = snapshot[target.key];
      if (!state) return true;
      if (state.error) return true;
      if (state.loading) return true;
      return false;
    });
    if (missing.length === 0) return;

    let cancelled = false;
    const run = async () => {
      await Promise.all(missing.map(async (target) => {
        const key = target.key;
        setAvailabilityByPair((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || {}),
            loading: true,
            error: "",
          },
        }));
        try {
          const params = new URLSearchParams({
            medico_id: String(target.medicoId),
            fecha: String(target.fecha),
          });
          const data = await fetchJsonWithTimeout(`${BASE_URL}api_horarios_disponibles.php?${params.toString()}`, {
            credentials: "include",
            cache: "no-store",
          }, 10000);
          if (cancelled) return;
          const horasLibres = (Array.isArray(data?.horarios_disponibles) ? data.horarios_disponibles : [])
            .map((h) => normalizeHourHm(h?.hora || h?.hora_db || h))
            .filter(Boolean)
            .sort((a, b) => (hmToMinutes(a) || 0) - (hmToMinutes(b) || 0));
          const horasOcupadas = (Array.isArray(data?.horarios_ocupados) ? data.horarios_ocupados : [])
            .map((h) => normalizeHourHm(h))
            .filter(Boolean)
            .sort((a, b) => (hmToMinutes(a) || 0) - (hmToMinutes(b) || 0));
          setAvailabilityByPair((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              error: data?.success ? "" : String(data?.error || "No se pudo cargar disponibilidad"),
              horasLibres,
              horasOcupadas,
            },
          }));
        } catch (error) {
          if (cancelled) return;
          setAvailabilityByPair((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              error: String(error?.message || "No se pudo cargar disponibilidad"),
              horasLibres: [],
              horasOcupadas: [],
            },
          }));
        }
      }));
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, normalizedTargets, normalizedTargetsKey]);

  return {
    availabilityByPair,
  };
}
