import test from "node:test";
import assert from "node:assert/strict";
import {
  etiquetaVolver,
  guardarOrigenPacientes,
  leerOrigenPacientes,
  olvidarOrigenPacientes,
  resolverRutaVolver,
} from "../../src/utils/rutaVolverServicios.js";

const almacenFalso = () => {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  };
};

test("resolverRutaVolver: prioriza el origen explícito (state, luego query) y descarta rutas externas", () => {
  assert.equal(resolverRutaVolver({ state: { backTo: "/pacientes?page=3" }, pacienteId: 5 }), "/pacientes?page=3");
  assert.equal(resolverRutaVolver({ state: { from: "/cotizaciones" }, pacienteId: 5 }), "/cotizaciones");
  assert.equal(resolverRutaVolver({ query: "/cotizaciones", pacienteId: 5 }), "/cotizaciones");
  assert.equal(resolverRutaVolver({ state: { backTo: "https://x.com" }, query: "//x.com", pacienteId: 5 }), "/pacientes");
});

test("resolverRutaVolver: sin origen explícito usa el recordado de Pacientes, si no /pacientes o /", () => {
  assert.equal(resolverRutaVolver({ pacienteId: 5, guardada: "/pacientes?page=2&q=ana" }), "/pacientes?page=2&q=ana");
  assert.equal(resolverRutaVolver({ pacienteId: 5, guardada: "/cotizaciones" }), "/pacientes");
  assert.equal(resolverRutaVolver({ pacienteId: 5 }), "/pacientes");
  assert.equal(resolverRutaVolver({ pacienteId: 0, guardada: "/pacientes?page=2" }), "/");
  assert.equal(resolverRutaVolver({}), "/");
});

test("etiquetaVolver ignora la query y no etiqueta como Dashboard una ruta desconocida", () => {
  assert.equal(etiquetaVolver("/pacientes?page=3&q=ana"), "Volver a Pacientes");
  assert.equal(etiquetaVolver("/cotizaciones"), "Volver a Atenciones");
  assert.equal(etiquetaVolver("/"), "Volver al Dashboard");
  assert.equal(etiquetaVolver("/otra-pantalla"), "Volver");
});

test("origen recordado: guarda solo la lista de Pacientes, caduca y se puede olvidar", () => {
  const a = almacenFalso();
  guardarOrigenPacientes(a, 7, "/cotizaciones", 1000);
  assert.equal(leerOrigenPacientes(a, 7, 1000), "", "no guarda orígenes que no son Pacientes");
  guardarOrigenPacientes(a, 7, "/pacientes?page=4&rows=10&q=ana", 1000);
  assert.equal(leerOrigenPacientes(a, 7, 2000), "/pacientes?page=4&rows=10&q=ana");
  assert.equal(leerOrigenPacientes(a, 8, 2000), "", "es por paciente");
  assert.equal(leerOrigenPacientes(a, 7, 1000 + 3 * 60 * 60 * 1000), "", "caduca a las 2 h");
  olvidarOrigenPacientes(a, 7);
  assert.equal(leerOrigenPacientes(a, 7, 2000), "");
  assert.equal(leerOrigenPacientes(null, 7), "", "sin almacenamiento no falla");
});
