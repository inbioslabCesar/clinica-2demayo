import test from "node:test";
import assert from "node:assert/strict";
import { destinoVolverServicio } from "../../src/utils/destinoVolverServicio.js";

test("cotización nueva: vuelve al selector con el paciente (id numérico) o con el particular", () => {
  const conPaciente = destinoVolverServicio({ pacienteId: "594" });
  assert.equal(conPaciente.etiqueta, "Volver");
  assert.equal(conPaciente.to, "/seleccionar-servicio");
  assert.deepEqual(conPaciente.options.state, { pacienteId: 594 });

  const temporal = { nombre: "Ana", apellido: "Pérez", dni: "1" };
  assert.deepEqual(destinoVolverServicio({ pacienteId: 7, pacienteTemporal: temporal }).options.state, { pacienteId: 7, pacienteTemporal: temporal });

  const particular = destinoVolverServicio({ pacienteId: 0 });
  assert.deepEqual(particular.options.state, { pacienteId: 0, pacienteTemporal: { nombre: "Particular", apellido: "", dni: "" } });
  assert.deepEqual(destinoVolverServicio({ pacienteId: "", pacienteTemporal: temporal }).options.state, { pacienteId: 0, pacienteTemporal: temporal });
});

test("cotización en edición: vuelve a servicios conservando cotización y modo, con origen Atenciones", () => {
  const d = destinoVolverServicio({ pacienteId: 594, cotizacionId: "2736", modo: "adenda" });
  assert.equal(d.etiqueta, "Volver a Servicios");
  assert.equal(d.to, "/seleccionar-servicio?paciente_id=594&cotizacion_id=2736&modo=adenda&back_to=/cotizaciones");
  assert.deepEqual(d.options.state, { pacienteId: 594, cotizacionId: 2736, backTo: "/cotizaciones", modo: "adenda" });
  assert.equal(destinoVolverServicio({ pacienteId: 594, cotizacionId: 5, modo: "otro" }).options.state.modo, "editar");
  assert.equal(destinoVolverServicio({ pacienteId: 594, cotizacionId: 5 }).options.state.modo, "editar");
});

test("cobro en edición: vuelve al consumo del paciente (o a pacientes si no hay paciente)", () => {
  const d = destinoVolverServicio({ pacienteId: 594, cobroId: "88" });
  assert.equal(d.etiqueta, "Volver a Consumo del paciente");
  assert.equal(d.to, "/consumo-paciente/594?cobro_id=88");
  assert.equal(d.options, undefined);
  assert.equal(destinoVolverServicio({ pacienteId: 594, cobroId: 88, cotizacionId: 9 }).to, "/consumo-paciente/594?cobro_id=88", "el cobro tiene prioridad");
  assert.equal(destinoVolverServicio({ pacienteId: 0, cobroId: 88 }).to, "/pacientes");
});
