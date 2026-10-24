import test from "node:test";
import assert from "node:assert/strict";
import {
  getLimaDate,
  getLimaTime,
  normalizeAgendaProgramacionModo,
  normalizeDateYmd,
  normalizeHourHm,
} from "../../src/utils/dateTime.js";

test("normalizeHourHm acepta H:MM y HH:MM:SS y rechaza valores invalidos", () => {
  assert.equal(normalizeHourHm("9:05"), "09:05");
  assert.equal(normalizeHourHm("09:05:00"), "09:05");
  assert.equal(normalizeHourHm(" 16:00 "), "16:00");
  assert.equal(normalizeHourHm("24:00"), "");
  assert.equal(normalizeHourHm("10:60"), "");
  assert.equal(normalizeHourHm("abc"), "");
  assert.equal(normalizeHourHm(null), "");
});

test("normalizeDateYmd conserva YYYY-MM-DD y normaliza fechas parseables", () => {
  assert.equal(normalizeDateYmd("2026-10-24"), "2026-10-24");
  assert.equal(normalizeDateYmd("2026-10-24T10:00:00"), "2026-10-24");
  assert.equal(normalizeDateYmd(""), "");
  assert.equal(normalizeDateYmd("no-es-fecha"), "");
});

test("normalizeAgendaProgramacionModo cae a mixed", () => {
  assert.equal(normalizeAgendaProgramacionModo("STRICT"), "strict");
  assert.equal(normalizeAgendaProgramacionModo(" free "), "free");
  assert.equal(normalizeAgendaProgramacionModo("otro"), "mixed");
  assert.equal(normalizeAgendaProgramacionModo(undefined), "mixed");
});

test("getLimaDate y getLimaTime devuelven el formato esperado", () => {
  assert.match(getLimaDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(getLimaTime(), /^\d{2}:\d{2}$/);
});
