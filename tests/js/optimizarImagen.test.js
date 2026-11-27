import test from "node:test";
import assert from "node:assert/strict";
import {
  OPTIMIZACION,
  calcularEscala,
  conviene,
  debeIntentarOptimizar,
  formatearTamano,
  optimizarEnSecuencia,
} from "../../src/utils/optimizarImagen.js";

const MB = 1024 * 1024;

test("debeIntentarOptimizar: JPEG solo desde 2,5 MB, PNG desde 1 MB, PDF/DICOM nunca", () => {
  assert.equal(debeIntentarOptimizar({ type: "image/jpeg", size: 1.9 * MB }), false);
  assert.equal(debeIntentarOptimizar({ type: "image/jpeg", size: 2.5 * MB }), true);
  assert.equal(debeIntentarOptimizar({ type: "image/png", size: 0.9 * MB }), false);
  assert.equal(debeIntentarOptimizar({ type: "image/png", size: 1.2 * MB }), true);
  assert.equal(debeIntentarOptimizar({ type: "application/pdf", size: 50 * MB }), false);
  assert.equal(debeIntentarOptimizar({ type: "application/dicom", size: 50 * MB }), false);
  assert.equal(debeIntentarOptimizar({ type: "image/gif", size: 50 * MB }), false);
  assert.equal(debeIntentarOptimizar(null), false);
});

test("calcularEscala: reduce solo lo que supera el máximo y nunca agranda", () => {
  assert.equal(calcularEscala(4000, 3000, 2560), 2560 / 4000);
  assert.equal(calcularEscala(2000, 1500, 2560), 1);
  assert.equal(calcularEscala(1000, 5120, 2560), 0.5);
  assert.equal(calcularEscala(0, 0), 1);
  assert.equal(OPTIMIZACION.MAX_LADO_PX, 2560);
});

test("conviene: exige al menos 15 % de ahorro, si no se conserva el original", () => {
  assert.equal(conviene(4 * MB, 3.7 * MB), false, "7,5 % no justifica reencodear");
  assert.equal(conviene(4 * MB, 3.39 * MB), true, "15 % sí");
  assert.equal(conviene(4 * MB, 1 * MB), true);
  assert.equal(conviene(4 * MB, 4 * MB), false);
  assert.equal(conviene(0, 1), false);
  assert.equal(conviene(4 * MB, 0), false);
});

test("formatearTamano usa coma decimal y KB para lo pequeño", () => {
  assert.equal(formatearTamano(3.94 * MB), "3,9 MB");
  assert.equal(formatearTamano(512 * 1024), "512 KB");
  assert.equal(formatearTamano(10), "1 KB");
});

test("optimizarEnSecuencia: respeta el orden, avisa el avance y devuelve los mismos archivos si no aplica", async () => {
  const archivos = [
    { name: "a.pdf", type: "application/pdf", size: 10 },
    { name: "b.dcm", type: "application/dicom", size: 20 },
    { name: "c.gif", type: "image/gif", size: 30 },
  ];
  const avances = [];
  const salida = await optimizarEnSecuencia(archivos, (hecho, total) => avances.push(`${hecho}/${total}`));
  assert.deepEqual(salida.map((f) => f.name), ["a.pdf", "b.dcm", "c.gif"]);
  assert.deepEqual(avances, ["0/3", "1/3", "2/3", "3/3"]);
  assert.deepEqual(await optimizarEnSecuencia([]), []);
});
