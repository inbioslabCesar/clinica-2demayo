import test from "node:test";
import assert from "node:assert/strict";
import { MODOS, cuerpoGeneracion, mensajeResultado, nuevoIdSolicitud, validarGeneracion } from "../../src/utils/generarConsultaSeguimiento.js";

const ok = { fecha: "2026-12-01", hora: "09:20", modo: "con_cobro", motivo: "" };

test("validarGeneracion acepta con cobro sin motivo y valida fecha, hora y modo", () => {
  assert.equal(validarGeneracion(ok, "2026-11-26"), "");
  assert.match(validarGeneracion({ ...ok, fecha: "" }, "2026-11-26"), /fecha/i);
  assert.match(validarGeneracion({ ...ok, fecha: "2026-11-01" }, "2026-11-26"), /pasó/);
  assert.match(validarGeneracion({ ...ok, hora: "" }, "2026-11-26"), /hora/i);
  assert.match(validarGeneracion({ ...ok, hora: "25:00" }, "2026-11-26"), /hora/i);
  assert.equal(validarGeneracion({ ...ok, hora: "09:20:00" }, "2026-11-26"), "");
  assert.match(validarGeneracion({ ...ok, modo: "" }, "2026-11-26"), /con cobro o sin cobro/);
});

test("sin cobro exige un motivo real (mínimo 10 caracteres sin contar espacios repetidos)", () => {
  const sin = { ...ok, modo: "sin_cobro" };
  assert.match(validarGeneracion({ ...sin, motivo: "" }, "2026-11-26"), /motivo/i);
  assert.match(validarGeneracion({ ...sin, motivo: "corto" }, "2026-11-26"), /mínimo 10/);
  assert.match(validarGeneracion({ ...sin, motivo: "a        b" }, "2026-11-26"), /mínimo 10/);
  assert.equal(validarGeneracion({ ...sin, motivo: "Paciente en control posquirúrgico" }, "2026-11-26"), "");
  assert.match(validarGeneracion({ ...sin, motivo: "x".repeat(300) }, "2026-11-26"), /demasiado largo/);
});

test("cuerpoGeneracion envía el motivo solo en sin cobro", () => {
  const con = cuerpoGeneracion({ pacienteId: 5, ...ok }, "seg-abc");
  assert.deepEqual(Object.keys(con).sort(), ["client_request_id", "fecha", "hora", "modo", "paciente_id"]);
  const sin = cuerpoGeneracion({ pacienteId: 5, ...ok, modo: MODOS.SIN_COBRO, motivo: "  Control posquirúrgico  " }, "seg-abc");
  assert.equal(sin.motivo, "Control posquirúrgico");
});

test("nuevoIdSolicitud cumple el formato que acepta el servidor y no se repite", () => {
  const a = nuevoIdSolicitud();
  const b = nuevoIdSolicitud();
  assert.match(a, /^[A-Za-z0-9_.:-]{8,64}$/);
  assert.notEqual(a, b);
});

test("mensajeResultado distingue con cobro, sin cobro y reintentos", () => {
  const con = mensajeResultado({ consulta_id: 1, cotizacion_id: 9, modo: "con_cobro", fecha: "2026-12-01", hora: "09:20:00" });
  assert.match(con, /01\/12\/2026 09:20/);
  assert.match(con, /pendiente de cobro/);
  assert.match(con, /#9/);
  assert.match(mensajeResultado({ consulta_id: 1, cotizacion_id: 9, modo: "sin_cobro", fecha: "2026-12-01", hora: "09:20" }), /exonerada/);
  assert.match(mensajeResultado({ consulta_id: 1, cotizacion_id: 9, modo: "con_cobro", fecha: "2026-12-01", hora: "09:20", reutilizado: true }), /ya estaba generada/);
  assert.equal(mensajeResultado(null), "");
});
