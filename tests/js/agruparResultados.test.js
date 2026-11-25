import test from "node:test";
import assert from "node:assert/strict";
import { agruparPorAtencion, categoriasPresentes } from "../../src/utils/agruparResultados.js";

const doc = (extra) => ({ tipo: "laboratorio", ref_id: 1, categoria: "laboratorio", titulo: "Hemograma", subtitulo: "Laboratorio", fecha: "2026-11-24 10:00:00", atencion_id: 10, atencion_fecha: "2026-11-24 09:00:00", estado: "disponible", ...extra });

test("agrupa por atención, la más reciente primero y 'sin atención' al final", () => {
  const docs = [
    doc({ ref_id: 1, atencion_id: 10, atencion_fecha: "2026-10-01 08:00:00" }),
    doc({ ref_id: 2, atencion_id: 0, atencion_fecha: null, fecha: "2026-12-01 08:00:00" }),
    doc({ ref_id: 3, atencion_id: 20, atencion_fecha: "2026-11-24 08:00:00" }),
    doc({ ref_id: 4, atencion_id: 20, atencion_fecha: "2026-11-24 08:00:00", fecha: "2026-11-24 11:00:00" }),
  ];
  const grupos = agruparPorAtencion(docs);
  assert.deepEqual(grupos.map((g) => g.id), [20, 10, 0]);
  assert.deepEqual(grupos[0].documentos.map((d) => d.ref_id), [4, 3], "dentro del grupo, lo más reciente primero");
});

test("el aviso de saldo es por grupo y cuenta los disponibles", () => {
  const grupos = agruparPorAtencion([
    doc({ ref_id: 1, atencion_id: 10, estado: "pendiente_pago" }),
    doc({ ref_id: 2, atencion_id: 10, estado: "pendiente_pago" }),
    doc({ ref_id: 3, atencion_id: 20, estado: "disponible" }),
  ]);
  const g10 = grupos.find((g) => g.id === 10);
  const g20 = grupos.find((g) => g.id === 20);
  assert.equal(g10.bloqueada, true);
  assert.equal(g20.bloqueada, false);
  assert.equal(g20.disponibles, 1);
});

test("filtra por categoría y por texto sin distinguir acentos ni mayúsculas", () => {
  const docs = [
    doc({ ref_id: 1, titulo: "Ecografía abdominal", categoria: "imagenologia", subtitulo: "Ecografía" }),
    doc({ ref_id: 2, titulo: "Perfil lipídico", categoria: "laboratorio" }),
  ];
  assert.equal(agruparPorAtencion(docs, { categoria: "imagenologia" })[0].documentos.length, 1);
  assert.equal(agruparPorAtencion(docs, { busqueda: "LIPIDICO" })[0].documentos[0].ref_id, 2);
  assert.equal(agruparPorAtencion(docs, { busqueda: "nada" }).length, 0);
  assert.deepEqual(categoriasPresentes(docs).sort(), ["imagenologia", "laboratorio"]);
});
