/** Eliminación de un archivo de una orden de imagenología (misma acción del servidor en todas las pantallas). */

export function textosConfirmarEliminacion(nombre) {
  const archivo = String(nombre || "").trim() || "este archivo";
  return {
    title: "¿Eliminar archivo?",
    text: `Se eliminará "${archivo}" de forma permanente. Esta acción no se puede deshacer.`,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  };
}

/** @returns {Promise<{success:boolean,error:string}>} nunca lanza: los errores de red vuelven como resultado. */
export async function eliminarArchivoOrdenImagen(authFetch, archivoId) {
  const id = Number(archivoId || 0);
  if (id <= 0) return { success: false, error: "Archivo no válido" };
  try {
    const res = await authFetch("api_ordenes_imagen.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "eliminar_archivo", archivo_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success) return { success: true, error: "" };
    return { success: false, error: String(data?.error || "No se pudo eliminar el archivo") };
  } catch {
    return { success: false, error: "Error de conexión al eliminar el archivo" };
  }
}
