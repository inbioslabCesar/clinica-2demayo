import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysYmd,
  buildReevaluacionForm,
  formatReevaluacionCuando,
} from "../../src/utils/reevaluacion.js";

test("addDaysYmd suma días cruzando fin de mes y año", () => {
  assert.equal(addDaysYmd("2026-11-28", 7), "2026-12-05");
  assert.equal(addDaysYmd("2026-12-30", 3), "2027-01-02");
  assert.equal(addDaysYmd("", 1), "");
});

test("buildReevaluacionForm solo precarga una reevaluación abierta", () => {
  const abierta = buildReevaluacionForm({ id: 5, abierta: 1, fecha_sugerida: "2026-11-26", hora_sugerida: "10:30", sin_hora_fija: 0, tipo_motivo: "resultados", motivo: "Lab" });
  assert.equal(abierta.programar, true);
  assert.equal(abierta.reevaluacion_id, 5);
  assert.equal(abierta.hora, "10:30");

  const cerrada = buildReevaluacionForm({ id: 5, abierta: 0, estado: "cancelada" });
  assert.equal(cerrada.programar, false);
  assert.equal(cerrada.reevaluacion_id, null);
  assert.equal(buildReevaluacionForm(null).programar, false);
});

test("formatReevaluacionCuando muestra la hora o 'sin hora fija'", () => {
  assert.match(formatReevaluacionCuando("2026-11-26", "10:30:00", false), /26\/11 · 10:30$/);
  assert.match(formatReevaluacionCuando("2026-11-26", "", false), /sin hora fija$/);
  assert.match(formatReevaluacionCuando("2026-11-26", "10:30", true), /sin hora fija$/);
  assert.equal(formatReevaluacionCuando("", "", false), "-");
});
