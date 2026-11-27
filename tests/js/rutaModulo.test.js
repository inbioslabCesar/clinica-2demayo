import test from "node:test";
import assert from "node:assert/strict";
import { ACCESO_MODULO, resolverAccesoModulo } from "../../src/utils/rutaModulo.js";

test("módulo activo: permite el acceso aunque aún se esté refrescando", () => {
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { clinico: true, seguimiento_clinico: true }, cargando: false }), ACCESO_MODULO.PERMITIDO);
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { seguimiento_clinico: true }, cargando: true }), ACCESO_MODULO.PERMITIDO);
});

test("módulo apagado o ausente: deniega; mientras carga espera en vez de redirigir", () => {
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { clinico: true }, cargando: false }), ACCESO_MODULO.DENEGADO);
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { seguimiento_clinico: false }, cargando: false }), ACCESO_MODULO.DENEGADO);
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { clinico: true }, cargando: true }), ACCESO_MODULO.CARGANDO);
});

test("falla segura: sin mapa de módulos (error de red) nunca se abre un módulo opcional; el clínico siempre", () => {
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: undefined, cargando: false }), ACCESO_MODULO.DENEGADO);
  assert.equal(resolverAccesoModulo({ modulo: "seguimiento_clinico", modulos: { seguimiento_clinico: "true" }, cargando: false }), ACCESO_MODULO.DENEGADO);
  assert.equal(resolverAccesoModulo({ modulo: "clinico", modulos: undefined, cargando: false }), ACCESO_MODULO.PERMITIDO);
});
