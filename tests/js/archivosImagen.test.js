import test from "node:test";
import assert from "node:assert/strict";
import { eliminarArchivoOrdenImagen, textosConfirmarEliminacion } from "../../src/utils/archivosImagen.js";

const respuesta = (cuerpo) => Promise.resolve({ json: () => Promise.resolve(cuerpo) });

test("eliminarArchivoOrdenImagen envía la acción y el id, y devuelve éxito", async () => {
  let llamada = null;
  const authFetch = (url, opciones) => { llamada = { url, opciones }; return respuesta({ success: true }); };
  const r = await eliminarArchivoOrdenImagen(authFetch, "15");
  assert.deepEqual(r, { success: true, error: "" });
  assert.equal(llamada.url, "api_ordenes_imagen.php");
  assert.equal(llamada.opciones.method, "POST");
  assert.deepEqual(JSON.parse(llamada.opciones.body), { action: "eliminar_archivo", archivo_id: 15 });
});

test("eliminarArchivoOrdenImagen: error del servidor, sin permiso, red caída e id inválido", async () => {
  assert.deepEqual(
    await eliminarArchivoOrdenImagen(() => respuesta({ success: false, error: "No autorizado para eliminar archivos de esta orden" }), 3),
    { success: false, error: "No autorizado para eliminar archivos de esta orden" },
  );
  assert.equal((await eliminarArchivoOrdenImagen(() => respuesta({}), 3)).error, "No se pudo eliminar el archivo");
  assert.equal(
    (await eliminarArchivoOrdenImagen(() => Promise.resolve({ json: () => Promise.reject(new Error("x")) }), 3)).success,
    false,
  );
  assert.equal((await eliminarArchivoOrdenImagen(() => Promise.reject(new Error("red")), 3)).error, "Error de conexión al eliminar el archivo");
  let llamado = false;
  assert.equal((await eliminarArchivoOrdenImagen(() => { llamado = true; return respuesta({}); }, 0)).success, false);
  assert.equal(llamado, false, "no llama al servidor con un id inválido");
});

test("textosConfirmarEliminacion incluye el nombre y avisa que es irreversible", () => {
  const t = textosConfirmarEliminacion("eco_1.jpg");
  assert.match(t.text, /eco_1\.jpg/);
  assert.match(t.text, /no se puede deshacer/);
  assert.match(textosConfirmarEliminacion("").text, /este archivo/);
});
