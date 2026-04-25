import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_URL } from "../../config/config";

const POLL_ACTIVE = 20_000;   // 20 s cuando la tab está visible
const POLL_HIDDEN = 60_000;   // 60 s cuando está en background

export default function useTratamientosPendientes({
  activo = true,
  busqueda = "",
  filtroEstado = "todos",
  pagina = 1,
  porPagina = 10,
} = {}) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [totales, setTotales] = useState({ pendiente: 0, en_ejecucion: 0, completado: 0, suspendido: 0, total: 0 });
  const [pagination, setPagination] = useState({ page: 1, per_page: porPagina, total: 0, total_pages: 1 });
  const intervalRef           = useRef(null);
  const mountedRef            = useRef(true);

  const cargar = useCallback(async ({ silent = false } = {}) => {
    if (!silent && mountedRef.current) {
      setLoading(true);
    }
    try {
      const estados = filtroEstado === "todos"
        ? "pendiente,en_ejecucion,completado,suspendido"
        : filtroEstado;
      const params = new URLSearchParams({
        estado: estados,
        paginate: "1",
        page: String(Math.max(1, pagina || 1)),
        per_page: String(Math.max(5, porPagina || 10)),
      });
      if (busqueda.trim()) {
        params.set("q", busqueda.trim());
      }

      const url = BASE_URL + `api_tratamientos_enfermeria.php?${params.toString()}`;
      const res  = await fetch(
        url,
        { credentials: "include" }
      );
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const serverMsg = data?.error || data?.detail || (raw ? raw.slice(0, 280) : "sin cuerpo");
        throw new Error(`HTTP ${res.status} en tratamientos: ${serverMsg}`);
      }

      if (!mountedRef.current) return;
      if (data?.success) {
        setItems(Array.isArray(data.data) ? data.data : []);
        if (data.totales && typeof data.totales === "object") {
          setTotales({
            pendiente: Number(data.totales.pendiente || 0),
            en_ejecucion: Number(data.totales.en_ejecucion || 0),
            completado: Number(data.totales.completado || 0),
            suspendido: Number(data.totales.suspendido || 0),
            total: Number(data.totales.total || 0),
          });
        }
        if (data.pagination && typeof data.pagination === "object") {
          setPagination({
            page: Number(data.pagination.page || 1),
            per_page: Number(data.pagination.per_page || porPagina || 10),
            total: Number(data.pagination.total || 0),
            total_pages: Number(data.pagination.total_pages || 1),
          });
        }
        setError(null);
      } else {
        const apiErr = data?.error || data?.detail || "Respuesta inválida del servidor";
        setError(`Error al cargar tratamientos: ${apiErr}`);
      }
    } catch (err) {
      console.error("[useTratamientosPendientes] Error al cargar", {
        err,
        busqueda,
        filtroEstado,
        pagina,
        porPagina,
      });
      if (mountedRef.current) {
        setError(err?.message || "Error de red");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [busqueda, filtroEstado, pagina, porPagina]);

  // Iniciar/reiniciar polling según visibilidad
  const iniciarPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const intervalo = document.hidden ? POLL_HIDDEN : POLL_ACTIVE;
    intervalRef.current = setInterval(() => {
      if (activo) cargar({ silent: true });
    }, intervalo);
  }, [activo, cargar]);

  useEffect(() => {
    mountedRef.current = true;
    if (activo) {
      cargar();
      iniciarPolling();
    }

    const onVisibilityChange = () => iniciarPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activo, cargar, iniciarPolling]);

  const refrescar = useCallback(({ silent = false } = {}) => {
    cargar({ silent });
  }, [cargar]);

  // Actualizar estado de un item en el servidor + optimistic update en lista
  const cambiarEstado = useCallback(async (id, nuevoEstado, notasEnfermeria = "") => {
    const body = { id, estado: nuevoEstado };
    if (notasEnfermeria.trim()) body.notas_enfermeria = notasEnfermeria.trim();

    // Optimistic update: mantener el registro en memoria y actualizar estado.
    // La visibilidad final la controla el filtro de UI.
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, estado: nuevoEstado, notas_enfermeria: notasEnfermeria || t.notas_enfermeria } : t))
    );

    const res  = await fetch(BASE_URL + "api_tratamientos_enfermeria.php", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body:    JSON.stringify(body),
    });
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!res.ok || !data?.success) {
      const serverMsg = data?.error || data?.detail || (raw ? raw.slice(0, 280) : "sin cuerpo");
      // Revertir en fallo
      cargar({ silent: true });
      throw new Error(`No se pudo actualizar el estado: ${serverMsg}`);
    }
    return data;
  }, [cargar]);

  return { items, loading, error, refrescar, cambiarEstado, totales, pagination };
}
