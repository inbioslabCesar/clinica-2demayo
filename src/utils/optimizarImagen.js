// Compresión previa de imágenes antes de subirlas (se ejecuta en el navegador del médico).
// Política: no gastar CPU cuando el ahorro sería mínimo, procesar de a una (sin picos de memoria ni
// bloqueos largos) y conservar siempre el original si el resultado no mejora lo suficiente.

const MB = 1024 * 1024;

export const OPTIMIZACION = {
  MAX_LADO_PX: 2560,
  CALIDAD_JPEG: 0.85,
  MIN_AHORRO: 0.15,
  // Desde qué tamaño vale la pena intentarlo. Un JPEG de cámara/ecógrafo casi no se reduce, un PNG sí.
  DESDE_BYTES: {
    "image/jpeg": 2.5 * MB,
    "image/webp": 2.5 * MB,
    "image/png": 1 * MB,
    "image/bmp": 0.5 * MB,
  },
};

export function debeIntentarOptimizar(archivo) {
  const umbral = OPTIMIZACION.DESDE_BYTES[String(archivo?.type || "").toLowerCase()];
  return umbral !== undefined && Number(archivo?.size || 0) >= umbral;
}

export function calcularEscala(ancho, alto, maxLado = OPTIMIZACION.MAX_LADO_PX) {
  const mayor = Math.max(Number(ancho) || 0, Number(alto) || 0);
  if (mayor <= 0) return 1;
  return Math.min(1, maxLado / mayor);
}

/** El resultado solo reemplaza al original si lo reduce al menos MIN_AHORRO. */
export function conviene(bytesOriginal, bytesNuevo) {
  const original = Number(bytesOriginal || 0);
  const nuevo = Number(bytesNuevo || 0);
  return original > 0 && nuevo > 0 && nuevo <= original * (1 - OPTIMIZACION.MIN_AHORRO);
}

export function formatearTamano(bytes) {
  const n = Number(bytes || 0);
  if (n >= MB) return `${(n / MB).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export async function optimizarImagen(archivo) {
  try {
    if (!debeIntentarOptimizar(archivo) || typeof createImageBitmap !== "function") return archivo;

    const bitmap = await createImageBitmap(archivo);
    const escala = calcularEscala(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", OPTIMIZACION.CALIDAD_JPEG));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || !conviene(archivo.size, blob.size)) return archivo;

    const base = String(archivo.name || "").replace(/\.[^.]+$/, "") || "imagen";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return archivo;
  }
}

/** De a una, cediendo el hilo entre archivos para que la barra de progreso se pinte. */
export async function optimizarEnSecuencia(archivos, alAvanzar) {
  const lista = Array.from(archivos || []);
  const resultado = [];
  for (let i = 0; i < lista.length; i += 1) {
    alAvanzar?.(i, lista.length);
    await new Promise((r) => setTimeout(r, 0));
    resultado.push(await optimizarImagen(lista[i]));
  }
  alAvanzar?.(lista.length, lista.length);
  return resultado;
}
