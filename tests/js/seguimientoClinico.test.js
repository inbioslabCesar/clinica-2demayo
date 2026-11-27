import test from "node:test";
import assert from "node:assert/strict";
import {
  camposVisiblesHc,
  esValorVacio,
  etiquetaClave,
  formatearFechaCorta,
  formatearHora,
  insigniaEstado,
  paginasVisibles,
  tipoCampoHc,
  textoDiagnostico,
} from "../../src/utils/seguimientoClinico.js";

test("etiquetaClave convierte claves de plantilla en etiquetas legibles", () => {
  assert.equal(etiquetaClave("motivo_de_consulta"), "Motivo de consulta");
  assert.equal(etiquetaClave("fur"), "Fur");
  assert.equal(etiquetaClave(""), "");
});

test("esValorVacio reconoce vacíos anidados y conserva el 0 y el false", () => {
  assert.equal(esValorVacio("  "), true);
  assert.equal(esValorVacio([]), true);
  assert.equal(esValorVacio([{ a: "" }, null]), true);
  assert.equal(esValorVacio(0), false);
  assert.equal(esValorVacio(false), false);
  assert.equal(esValorVacio({ a: { b: "x" } }), false);
});

test("camposVisiblesHc entrega todo lo clínico en el orden guardado, sin plantilla ni vacíos", () => {
  const campos = camposVisiblesHc({
    motivo_de_consulta: "Dolor",
    template: [{ id: 1 }, { id: 2 }],
    metas: "",
    diagnosticos: [{ nombre: "Dx" }],
    receta: [{ nombre: "A" }],
    plantilla_propia: "Texto de especialidad",
    proxima_cita: { fecha: "2026-12-01", hora: "09:00" },
    triaje_vacio: [],
  });
  assert.deepEqual(campos.map((c) => c.clave), ["motivo_de_consulta", "diagnosticos", "receta", "plantilla_propia", "proxima_cita"]);
  assert.deepEqual(campos.map((c) => c.tipo), ["texto", "diagnosticos", "receta", "texto", "objeto"]);
  assert.deepEqual(camposVisiblesHc(null), []);
  assert.deepEqual(camposVisiblesHc([1, 2]), []);
});

test("tipoCampoHc distingue diagnósticos y receta de listas genéricas", () => {
  assert.equal(tipoCampoHc("diagnosticos", [{}]), "diagnosticos");
  assert.equal(tipoCampoHc("receta", [{}]), "receta");
  assert.equal(tipoCampoHc("otros", ["a"]), "lista");
  assert.equal(tipoCampoHc("receta", "texto"), "texto");
});

test("fechas y horas se formatean sin zonas horarias", () => {
  assert.equal(formatearFechaCorta("2026-11-26"), "26/11/2026");
  assert.equal(formatearFechaCorta("2026-11-26 09:30:00"), "26/11/2026");
  assert.equal(formatearFechaCorta(null), "");
  assert.equal(formatearHora("09:05:00"), "09:05");
  assert.equal(formatearHora(""), "");
});

test("insigniaEstado y textoDiagnostico", () => {
  assert.equal(insigniaEstado("completada").texto, "Atendida");
  assert.equal(insigniaEstado("raro").texto, "raro");
  assert.equal(textoDiagnostico({ tiene_hc: true, diagnostico_principal: { codigo: "N95.2", nombre: "Vaginitis" }, total_diagnosticos: 3 }), "N95.2 · Vaginitis (+2)");
  assert.equal(textoDiagnostico({ tiene_hc: true, diagnostico_principal: null }), "Sin diagnóstico registrado");
  assert.equal(textoDiagnostico({ tiene_hc: false, diagnostico_principal: null }), "Sin historia clínica");
});

test("paginasVisibles: pocas páginas, saltos con null y límites", () => {
  assert.deepEqual(paginasVisibles(1, 1), [1]);
  assert.deepEqual(paginasVisibles(2, 3), [1, 2, 3]);
  assert.deepEqual(paginasVisibles(1, 10), [1, 2, null, 10]);
  assert.deepEqual(paginasVisibles(6, 20), [1, null, 5, 6, 7, null, 20]);
  assert.deepEqual(paginasVisibles(20, 20), [1, null, 19, 20]);
  assert.deepEqual(paginasVisibles(99, 0), [1]);
});
