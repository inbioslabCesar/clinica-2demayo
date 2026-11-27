import test from "node:test";
import assert from "node:assert/strict";
import { SIN_BLOQUES, bloquesParaFecha, indexarDisponibilidad } from "../../src/utils/disponibilidadAgenda.js";

const disponibilidad = [
  { medico_id: 1, fecha: "2026-11-02", hora_inicio: "08:00", hora_fin: "12:00" },
  { medico_id: 2, fecha: "", dia_semana: "Lunes", hora_inicio: "14:00", hora_fin: "18:00" },
  { medico_id: 3, fecha: null, dia_semana: "sábado", hora_inicio: "09:00", hora_fin: "11:00" },
];

test("un día sin horarios devuelve siempre la misma referencia (evita el bucle de renders)", () => {
  const { porFecha, recurrentePorDia } = indexarDisponibilidad(disponibilidad);
  const a = bloquesParaFecha("2026-11-26", 4, porFecha, recurrentePorDia);
  const b = bloquesParaFecha("2026-11-26", 4, porFecha, recurrentePorDia);
  assert.equal(a, SIN_BLOQUES);
  assert.equal(a, b);
  assert.equal(a.length, 0);
  assert.equal(bloquesParaFecha("2026-11-26", 4, undefined, undefined), SIN_BLOQUES);
});

test("la fecha exacta tiene prioridad sobre los horarios recurrentes del día de la semana", () => {
  const { porFecha, recurrentePorDia } = indexarDisponibilidad(disponibilidad);
  assert.deepEqual(bloquesParaFecha("2026-11-02", 1, porFecha, recurrentePorDia).map((b) => b.medico_id), [1]);
  assert.deepEqual(bloquesParaFecha("2026-11-09", 1, porFecha, recurrentePorDia).map((b) => b.medico_id), [2]);
  assert.deepEqual(bloquesParaFecha("2026-11-07", 6, porFecha, recurrentePorDia).map((b) => b.medico_id), [3]);
});

test("indexarDisponibilidad tolera entradas inválidas", () => {
  assert.deepEqual(indexarDisponibilidad(null), { porFecha: {}, recurrentePorDia: {} });
  assert.deepEqual(indexarDisponibilidad([null, {}, { fecha: " " }]), { porFecha: {}, recurrentePorDia: {} });
});
