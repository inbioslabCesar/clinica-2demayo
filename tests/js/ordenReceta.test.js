import test from "node:test";
import assert from "node:assert/strict";
import { agregarAlFinal, moverItem, alternarSeleccion, itemsEnOrdenDeSeleccion } from "../../src/utils/ordenReceta.js";
import { agruparProtocolos, itemsParaProtocolo } from "../../src/utils/protocolosReceta.js";

test("agregarAlFinal deja lo nuevo debajo y no altera la lista original", () => {
  const base = [{ n: "A" }];
  const res = agregarAlFinal(base, [{ n: "B" }, { n: "C" }]);
  assert.deepEqual(res.map((x) => x.n), ["A", "B", "C"]);
  assert.equal(base.length, 1);
  assert.deepEqual(agregarAlFinal(null, null), []);
});

test("moverItem sube y baja una posición y respeta los bordes", () => {
  assert.deepEqual(moverItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moverItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  const base = ["a", "b"];
  assert.equal(moverItem(base, 0, -1), base);
  assert.equal(moverItem(base, 1, 1), base);
  assert.equal(moverItem(base, 5, -1), base);
});

test("la selección conserva el orden de los clics y desmarcar renumera", () => {
  let orden = [];
  orden = alternarSeleccion(orden, "c", true);
  orden = alternarSeleccion(orden, "a", true);
  orden = alternarSeleccion(orden, "b", true);
  assert.deepEqual(orden, ["c", "a", "b"]);
  orden = alternarSeleccion(orden, "a", false);
  assert.deepEqual(orden, ["c", "b"]);
  orden = alternarSeleccion(orden, "c", true);
  assert.deepEqual(orden, ["b", "c"]);
});

test("itemsEnOrdenDeSeleccion respeta el orden de clic, no el de la lista", () => {
  const mapa = new Map([["x", { nombre: "X" }], ["y", { nombre: "Y" }], ["z", { nombre: "Z" }]]);
  assert.deepEqual(itemsEnOrdenDeSeleccion(["z", "x", "ya-no-existe"], mapa).map((i) => i.nombre), ["Z", "X"]);
});

test("agruparProtocolos agrupa por alcance, filtra por nombre o medicamento y omite grupos vacíos", () => {
  const prot = [
    { id: 1, nombre: "Gripe", alcance: "medico", items: [{ nombre: "Paracetamol" }] },
    { id: 2, nombre: "Dolor", alcance: "general", items: [{ nombre: "Ibuprofeno" }] },
    { id: 3, nombre: "Niños", alcance: "especialidad", items: [] },
  ];
  assert.deepEqual(agruparProtocolos(prot).map((g) => g.clave), ["medico", "especialidad", "general"]);
  assert.deepEqual(agruparProtocolos(prot, "ibuprofeno").map((g) => g.clave), ["general"]);
  assert.deepEqual(agruparProtocolos(prot, "NINOS").map((g) => g.items[0].id), [3]);
  assert.deepEqual(agruparProtocolos(prot, "zzz"), []);
});

test("itemsParaProtocolo conserva el orden y normaliza valores", () => {
  const items = itemsParaProtocolo([{ nombre: "B", cantidad_dispensacion: "0" }, { nombre: "A", cantidad_dispensacion: 3 }]);
  assert.deepEqual(items.map((i) => i.nombre), ["B", "A"]);
  assert.deepEqual(items.map((i) => i.cantidad_dispensacion), [1, 3]);
  assert.equal(items[0].origen, "catalogo");
});
