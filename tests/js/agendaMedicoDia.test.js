import test from "node:test";
import assert from "node:assert/strict";
import { normalizarAgendaDia } from "../../src/utils/agendaMedicoDia.js";

test("normaliza la respuesta real del endpoint de horarios (objetos libres, textos ocupados)", () => {
  const r = normalizarAgendaDia({
    horarios_disponibles: [
      { hora: "09:20", hora_db: "09:20:00", medico_id: 58 },
      { hora: "09:00", hora_db: "09:00:00", medico_id: 58 },
    ],
    horarios_ocupados: ["09:40:00", "09:40", "10:00:00"],
    duracion_slot_min: 20,
  });
  assert.deepEqual(r, { libres: ["09:00", "09:20"], ocupados: ["09:40", "10:00"], slot: 20 });
});

test("tolera textos, objetos sin hora_db y respuestas vacías o inválidas", () => {
  assert.deepEqual(normalizarAgendaDia({ horarios_disponibles: ["8:05:00", { hora: "09:10" }, null, {}], horarios_ocupados: [] }).libres, ["08:05", "09:10"]);
  assert.deepEqual(normalizarAgendaDia(null), { libres: [], ocupados: [], slot: 0 });
  assert.deepEqual(normalizarAgendaDia({ horarios_disponibles: "no es lista" }).libres, []);
});
