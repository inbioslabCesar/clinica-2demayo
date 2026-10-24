import test from "node:test";
import assert from "node:assert/strict";
import { createSubmitGuard } from "../../src/hooks/useSubmitGuard.js";

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("el doble clic se ignora mientras hay un envio en curso", async () => {
  const guard = createSubmitGuard("t");
  let ejecuciones = 0;
  const lento = async () => { ejecuciones += 1; await espera(20); return "ok"; };
  const [a, b, c] = await Promise.all([guard.run(lento, "fp"), guard.run(lento, "fp"), guard.run(lento, "fp")]);
  assert.equal(ejecuciones, 1);
  assert.equal(a, "ok");
  assert.equal(b, undefined);
  assert.equal(c, undefined);
});

test("se puede volver a enviar cuando termina el anterior", async () => {
  const guard = createSubmitGuard("t");
  let n = 0;
  await guard.run(async () => { n += 1; }, "fp");
  await guard.run(async () => { n += 1; }, "fp");
  assert.equal(n, 2);
});

test("avisa el estado ocupado para deshabilitar botones, incluso si la tarea falla", async () => {
  const estados = [];
  const guard = createSubmitGuard("t", (b) => estados.push(b));
  await assert.rejects(() => guard.run(async () => { throw new Error("falla"); }, "fp"), /falla/);
  assert.deepEqual(estados, [true, false]);
  let corrio = false;
  await guard.run(async () => { corrio = true; }, "fp");
  assert.equal(corrio, true);
});

test("tras un fallo se reutiliza el mismo client_request_id si el contenido no cambio", async () => {
  const guard = createSubmitGuard("cot");
  const ids = [];
  await guard.run(async (id) => { ids.push(id); }, "mismo").catch(() => {});
  await guard.run(async (id) => { ids.push(id); }, "mismo");
  assert.equal(ids[0], ids[1]);
  assert.match(ids[0], /^cot:/);
});

test("si cambia el contenido se genera un id nuevo", async () => {
  const guard = createSubmitGuard("cot");
  const ids = [];
  await guard.run(async (id) => { ids.push(id); }, "A");
  await guard.run(async (id) => { ids.push(id); }, "B");
  assert.notEqual(ids[0], ids[1]);
});

test("release() hace que el siguiente envio use un id nuevo", async () => {
  const guard = createSubmitGuard("cot");
  const ids = [];
  await guard.run(async (id, release) => { ids.push(id); release(); }, "A");
  await guard.run(async (id) => { ids.push(id); }, "A");
  assert.notEqual(ids[0], ids[1]);
});
