import { useCallback, useState } from "react";
import useModulos from "./useModulos";

// Opciones "publicar al paciente" de las pantallas de subida de archivos. Solo existen si la clínica tiene activo el
// módulo del portal del paciente: sin él no se envía nada y los archivos siguen siendo internos.
export default function usePublicacionPortal() {
  const { tiene, cargando } = useModulos();
  const [publicarPdf, setPublicarPdf] = useState(true);
  const [publicarImagenes, setPublicarImagenes] = useState(false);
  const activo = !cargando && tiene("portal_pacientes");

  const agregarAFormData = useCallback(
    (fd) => {
      if (!activo) return;
      if (publicarPdf) fd.append("publicar_pdf", "1");
      if (publicarImagenes) fd.append("publicar_imagenes", "1");
    },
    [activo, publicarPdf, publicarImagenes]
  );

  return { activo, publicarPdf, setPublicarPdf, publicarImagenes, setPublicarImagenes, agregarAFormData };
}
