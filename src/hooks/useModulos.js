import { useEffect, useState } from "react";
import { fetchModulosActivos } from "../api/modulosApi";

// Módulos activos de esta instalación (ej. ocupacional). Úselo para mostrar u ocultar menús y rutas;
// la protección real está en el backend (ModulosInstalacion::exigir), esto solo evita mostrar lo apagado.
// Mientras carga, o si falla, solo el módulo clínico se considera activo (falla seguro).
const SOLO_CLINICO = { clinico: true };

export default function useModulos(habilitado = true) {
  const [modulos, setModulos] = useState(SOLO_CLINICO);
  const [cargando, setCargando] = useState(Boolean(habilitado));

  useEffect(() => {
    if (!habilitado) return undefined;
    let activo = true;
    fetchModulosActivos()
      .then((m) => {
        if (activo) setModulos(m ? { ...SOLO_CLINICO, ...m } : SOLO_CLINICO);
      })
      .catch(() => {
        if (activo) setModulos(SOLO_CLINICO);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [habilitado]);

  return { modulos, cargando, tiene: (nombre) => modulos[nombre] === true };
}
