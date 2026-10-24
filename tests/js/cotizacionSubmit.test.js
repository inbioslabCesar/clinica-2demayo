import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmarLimpiezaCarrito,
  esErrorNoEditable,
  finalizarRegistroCotizacion,
  registrarConFallbackAdenda,
} from "../../src/utils/cotizacionSubmit.js";

const mkFetch = (responses, calls) => async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body) });
  const r = responses.shift();
  return { json: async () => r };
};
const swalSiempre = (isConfirmed) => ({ fire: async () => ({ isConfirmed }) });

test("alta normal: un solo POST y devuelve la respuesta", async () => {
  const calls = [];
  const out = await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: true, cotizacion_id: 5 }], calls),
    baseUrl: "x/",
    Swal: swalSiempre(true),
    payload: { a: 1 },
    cotizacionId: null,
    detallesAdenda: [],
    totalAdenda: 0,
    motivoAdenda: "m",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "x/api_cotizaciones.php");
  assert.equal(out.data.cotizacion_id, 5);
  assert.equal(out.cancelada, false);
});

test("edicion de cotizacion pagada: confirma y envia la adenda con fecha_ref", async () => {
  const calls = [];
  const out = await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: false, error: "La cotización no está en estado editable" }, { success: true, cotizacion_id: 9 }], calls),
    baseUrl: "x/",
    Swal: swalSiempre(true),
    payload: { accion: "editar" },
    cotizacionId: "7",
    detallesAdenda: [{ k: 1 }],
    totalAdenda: 10,
    fechaRef: "2026-10-24",
    motivoAdenda: "adenda!",
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { accion: "adenda", cotizacion_id: 7, detalles: [{ k: 1 }], total: 10, fecha_ref: "2026-10-24", motivo: "adenda!" });
  assert.equal(out.data.cotizacion_id, 9);
});

test("adenda sin fechaRef no envia fecha_ref", async () => {
  const calls = [];
  await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: false, error: "no esta en estado editable" }, { success: true }], calls),
    baseUrl: "x/",
    Swal: swalSiempre(true),
    payload: {},
    cotizacionId: 7,
    detallesAdenda: [],
    totalAdenda: 0,
    motivoAdenda: "m",
  });
  assert.equal("fecha_ref" in calls[1].body, false);
  assert.equal("client_request_id" in calls[1].body, false);
});

test("la adenda envia el client_request_id del intento para que el servidor no la duplique", async () => {
  const calls = [];
  await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: false, error: "no esta en estado editable" }, { success: true }], calls),
    baseUrl: "x/",
    Swal: swalSiempre(true),
    payload: { accion: "editar" },
    cotizacionId: 7,
    detallesAdenda: [],
    totalAdenda: 0,
    motivoAdenda: "m",
    clientRequestId: "cotizacion:abc",
  });
  assert.equal(calls[1].body.accion, "adenda");
  assert.equal(calls[1].body.client_request_id, "cotizacion:abc");
});

test("si el usuario rechaza la adenda queda cancelada y no hay segundo POST", async () => {
  const calls = [];
  const out = await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: false, error: "no esta en estado editable" }], calls),
    baseUrl: "x/",
    Swal: swalSiempre(false),
    payload: {},
    cotizacionId: 7,
    detallesAdenda: [],
    totalAdenda: 0,
    motivoAdenda: "m",
  });
  assert.equal(out.cancelada, true);
  assert.equal(calls.length, 1);
});

test("un error ajeno a la edicion no ofrece adenda", async () => {
  const calls = [];
  const Swal = { fire: async () => { throw new Error("no debe preguntar"); } };
  const out = await registrarConFallbackAdenda({
    authFetch: mkFetch([{ success: false, error: "otro error" }], calls),
    baseUrl: "x/",
    Swal,
    payload: {},
    cotizacionId: 7,
    detallesAdenda: [],
    totalAdenda: 0,
    motivoAdenda: "m",
  });
  assert.equal(out.data.success, false);
  assert.equal(calls.length, 1);
});

test("esErrorNoEditable reconoce ambas variantes del mensaje", () => {
  assert.equal(esErrorNoEditable({ error: "La cotizacion no esta en estado editable" }), true);
  assert.equal(esErrorNoEditable({ error: "no está en estado editable" }), true);
  assert.equal(esErrorNoEditable({ error: "otro" }), false);
  assert.equal(esErrorNoEditable(null), false);
});

test("confirmarLimpiezaCarrito solo pregunta si hay items del mismo paciente", async () => {
  let preguntas = 0;
  const Swal = { fire: async () => { preguntas += 1; return { isConfirmed: true }; } };
  assert.deepEqual(await confirmarLimpiezaCarrito({ Swal, cart: { items: [], patientId: 3 }, pacienteId: 3, esEdicion: false }), { cancelado: false, limpiarCarrito: false });
  assert.deepEqual(await confirmarLimpiezaCarrito({ Swal, cart: { items: [1], patientId: 4 }, pacienteId: 3, esEdicion: false }), { cancelado: false, limpiarCarrito: false });
  assert.equal(preguntas, 0);
  assert.deepEqual(await confirmarLimpiezaCarrito({ Swal, cart: { items: [1], patientId: 3 }, pacienteId: "3", esEdicion: true }), { cancelado: false, limpiarCarrito: true });
  assert.equal(preguntas, 1);
  assert.deepEqual(await confirmarLimpiezaCarrito({ Swal: swalSiempre(false), cart: { items: [1], patientId: 3 }, pacienteId: 3 }), { cancelado: true, limpiarCarrito: false });
});

async function finalizar(args) {
  const log = { nav: [], msg: [], cleared: 0, refresh: [] };
  let done;
  const terminado = new Promise((resolve) => { done = resolve; });
  finalizarRegistroCotizacion({
    Swal: { fire: () => ({ then: async (cb) => { await cb(); done(); } }) },
    navigate: (...a) => log.nav.push(a),
    clearCart: () => { log.cleared += 1; },
    setMensaje: (m) => log.msg.push(m),
    refrescarDetalles: async (id) => { log.refresh.push(id); },
    pacienteId: 2,
    ...args,
  });
  await terminado;
  return log;
}

test("finalizar: registrar y cobrar limpia el carrito y va a cobrar", async () => {
  const l = await finalizar({ data: { cotizacion_id: 11 }, cotizacionId: null, irACobro: true, limpiarCarritoAlFinal: true });
  assert.equal(l.cleared, 1);
  assert.deepEqual(l.nav[0], ["/cobrar-cotizacion/11"]);
  assert.equal(l.msg[0], "Cotización registrada correctamente.");
});

test("finalizar: alta simple vuelve al listado sin tocar el carrito", async () => {
  const l = await finalizar({ data: { cotizacion_id: 11 }, cotizacionId: null, irACobro: false, limpiarCarritoAlFinal: false });
  assert.deepEqual(l.nav[0], ["/cotizaciones"]);
  assert.equal(l.cleared, 0);
});

test("finalizar: adenda refresca detalles y vuelve a seleccionar-servicio", async () => {
  const l = await finalizar({ data: { cotizacion_id: 20 }, cotizacionId: "7", irACobro: false, limpiarCarritoAlFinal: false });
  assert.equal(l.msg[0], "Adenda creada correctamente.");
  assert.deepEqual(l.refresh, [20]);
  assert.match(l.nav[0][0], /^\/seleccionar-servicio\?paciente_id=2&cotizacion_id=20&modo=editar/);
});
