import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarExclusionConsultaDelCarrito,
  aplicarSugerenciaEnDetalles,
  buildAgendaGuardEntriesFromDetalles,
  secuenciarDetallesPacienteSinCruce,
} from "../../src/utils/agendaGuardCotizacion.js";
import { getReferenceHorarioFromCart } from "../../src/utils/cartScheduling.js";

test("aplicarSugerenciaEnDetalles solo mueve los detalles que coinciden con medico/fecha/hora", () => {
  const detalles = [
    { medico_id: 1, fecha_programada: "2026-10-24", hora_programada: "09:00" },
    { medico_id: 1, fecha_programada: "2026-10-24", hora_programada: "10:00" },
    { medico_id: 2, fecha_programada: "2026-10-24", hora_programada: "09:00" },
  ];
  aplicarSugerenciaEnDetalles(detalles)({ medicoId: 1, fecha: "2026-10-24", hora: "09:00" }, "09:20", "2026-10-24");
  assert.equal(detalles[0].hora_programada, "09:20");
  assert.equal(detalles[1].hora_programada, "10:00");
  assert.equal(detalles[2].hora_programada, "09:00");
});

test("aplicarSugerenciaEnDetalles aplica la fecha sugerida solo si viene", () => {
  const d = [{ medico_id: 1, fecha_programada: "2026-10-24", hora_programada: "09:00" }];
  aplicarSugerenciaEnDetalles(d)({ medicoId: 1, fecha: "2026-10-24", hora: "09:00" }, "08:40");
  assert.equal(d[0].fecha_programada, "2026-10-24");
  assert.equal(d[0].hora_programada, "08:40");
  const d2 = [{ medico_id: 1, fecha_programada: "2026-10-24", hora_programada: "09:00" }];
  aplicarSugerenciaEnDetalles(d2)({ medicoId: 1, fecha: "2026-10-24", hora: "09:00" }, "08:40", "2026-10-29");
  assert.equal(d2[0].fecha_programada, "2026-10-29");
});

test("buildAgendaGuardEntriesFromDetalles solo toma servicios agendables con medico, fecha y hora", () => {
  const entries = buildAgendaGuardEntriesFromDetalles([
    { servicio_tipo: "ecografia", medico_id: 3, fecha_programada: "2026-10-24", hora_programada: "09:00" },
    { servicio_tipo: "laboratorio", medico_id: 3, fecha_programada: "2026-10-24", hora_programada: "09:00" },
    { servicio_tipo: "consulta", medico_id: 0, fecha_programada: "2026-10-24", hora_programada: "09:00" },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tipo, "ecografia");
  assert.equal(entries[0].medicoId, 3);
});

test("buildAgendaGuardEntriesFromDetalles unifica dos servicios del mismo medico y hora", () => {
  const entries = buildAgendaGuardEntriesFromDetalles([
    { servicio_tipo: "consulta", medico_id: 3, fecha_programada: "2026-10-24", hora_programada: "09:00" },
    { servicio_tipo: "ecografia", medico_id: 3, fecha_programada: "2026-10-24", hora_programada: "09:00", consulta_id: 55 },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].consultaIdExcluir, 55);
});

test("aplicarExclusionConsultaDelCarrito excluye la consulta del carrito en el mismo slot", () => {
  const entries = [{ medicoId: 3, fecha: "2026-10-24", hora: "09:00", consultaIdExcluir: 0 }];
  const cart = [{ consultaId: 77, consultaMedicoId: 3, consultaFecha: "2026-10-24", consultaHora: "09:00" }];
  assert.equal(aplicarExclusionConsultaDelCarrito(entries, cart)[0].consultaIdExcluir, 77);
  assert.equal(aplicarExclusionConsultaDelCarrito(entries, [])[0].consultaIdExcluir, 0);
});

test("secuenciarDetallesPacienteSinCruce deja todos los servicios agendables en el mismo bloque", () => {
  const out = secuenciarDetallesPacienteSinCruce({
    detalles: [
      { servicio_tipo: "consulta" },
      { servicio_tipo: "ecografia" },
      { servicio_tipo: "laboratorio" },
    ],
    cartItems: [],
    fallbackFecha: "2026-10-24",
    fallbackHora: "9:00",
  });
  assert.equal(out[0].fecha_programada, "2026-10-24");
  assert.equal(out[0].hora_programada, "09:00");
  assert.equal(out[1].hora_programada, "09:00");
  assert.equal(out[2].hora_programada, undefined, "el laboratorio no se agenda con el medico");
});

test("secuenciarDetallesPacienteSinCruce no muta los detalles originales", () => {
  const original = [{ servicio_tipo: "consulta" }];
  secuenciarDetallesPacienteSinCruce({ detalles: original, cartItems: [], fallbackFecha: "2026-10-24", fallbackHora: "09:00" });
  assert.equal(original[0].hora_programada, undefined);
});

test("getReferenceHorarioFromCart prioriza la consulta programada del carrito", () => {
  const ref = getReferenceHorarioFromCart([
    { serviceType: "ecografia", fechaProgramada: "2026-10-24", horaProgramada: "10:00" },
    { serviceType: "consulta", consultaTipoConsulta: "programada", consultaFecha: "2026-10-25", consultaHora: "08:20" },
  ]);
  assert.deepEqual(ref, { fecha: "2026-10-25", hora: "08:20" });
  assert.equal(getReferenceHorarioFromCart([]), null);
});
