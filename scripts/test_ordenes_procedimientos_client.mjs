import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";

const source = await readFile(new URL("../src/utils/ordenesProcedimientos.js", import.meta.url), "utf8");

async function loadWithResponse(response) {
  const requests = [];
  const context = createContext({ URLSearchParams, Date, Error });
  const client = new SyntheticModule(["authFetch"], function () {
    this.setExport("authFetch", async (...args) => {
      requests.push(args);
      if (response instanceof Error) throw response;
      return response;
    });
  }, { context });
  const module = new SourceTextModule(source, { context });
  await module.link(() => client);
  await module.evaluate();
  return { load: module.namespace.cargarOrdenesProcedimientos, requests };
}

test("carga valida: conserva ordenes y solicita hc_fast sin cache", async () => {
  const orders = [{ id: 27, consulta_id: 369, procedimientos: [{ id: 302 }] }];
  const { load, requests } = await loadWithResponse({
    ok: true, json: async () => ({ success: true, ordenes: orders }),
  });
  const signal = new AbortController().signal;
  assert.equal(await load(369, { vista: "hc_fast", signal }), orders);
  const params = new URL(requests[0][0], "http://localhost/").searchParams;
  assert.equal(params.get("consulta_id"), "369");
  assert.equal(params.get("vista"), "hc_fast");
  assert.ok(params.get("_t"));
  assert.equal(requests[0][1].cache, "no-store");
  assert.equal(requests[0][1].signal, signal);
});

test("lista vacia valida no es un error", async () => {
  const orders = [];
  const { load } = await loadWithResponse({
    ok: true, json: async () => ({ success: true, ordenes: orders }),
  });
  assert.equal(await load(369), orders);
});

for (const [name, ok, data] of [
  ["HTTP 500", false, { success: false, error: "Error interno", request_id: "prueba-500" }],
  ["HTTP fallido aunque success sea true", false, { success: true, ordenes: [] }],
  ["success false con HTTP 200", true, { success: false, ordenes: [] }],
  ["success debe ser booleano", true, { success: "true", ordenes: [] }],
  ["respuesta sin ordenes", true, { success: true }],
  ["ordenes no es un arreglo", true, { success: true, ordenes: {} }],
]) {
  test(`${name} no se convierte en lista vacia`, async () => {
    const { load } = await loadWithResponse({ ok, json: async () => data });
    await assert.rejects(load(369), data.request_id ? /Error interno.*prueba-500/ : /No se pudieron cargar/);
  });
}

test("JSON invalido y fallo de red se propagan", async () => {
  const invalidJson = await loadWithResponse({
    ok: true, json: async () => { throw new Error("JSON invalido"); },
  });
  await assert.rejects(invalidJson.load(369), /JSON invalido/);
  const networkFailure = await loadWithResponse(new Error("Fallo de red"));
  await assert.rejects(networkFailure.load(369), /Fallo de red/);
});
