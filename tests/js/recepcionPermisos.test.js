import test from "node:test";
import assert from "node:assert/strict";
import { permisosDisponibles, getPermisosRecepcionista, hasPermiso } from "../../src/config/recepcionPermisos.js";

const keys = (lista) => lista.map((p) => p.key);

test("los permisos ocupacionales solo se ofrecen con el módulo activo", () => {
  assert.ok(!keys(permisosDisponibles(() => false)).includes("access_salud_ocupacional"));
  assert.ok(!keys(permisosDisponibles((m) => m === "clinico")).includes("gestionar_empresas_ocupacional"));
  assert.ok(keys(permisosDisponibles((m) => m === "ocupacional")).includes("access_salud_ocupacional"));
  assert.ok(keys(permisosDisponibles(() => false)).includes("ver_pacientes"));
});

test("la personalización ya no se ofrece en el formulario de usuarios pero su clave se conserva", () => {
  assert.ok(!keys(permisosDisponibles(() => true)).includes("ver_tema"));
  const u = { rol: "recepcionista", permisos: ["ver_tema"] };
  assert.deepEqual(getPermisosRecepcionista(u), ["ver_tema"], "no debe caer en el acceso de compatibilidad");
});

test("una recepcionista antigua sin permisos nunca recibe acceso ocupacional", () => {
  const antigua = { rol: "recepcionista", permisos: [] };
  assert.ok(!getPermisosRecepcionista(antigua).includes("access_salud_ocupacional"));
  assert.equal(hasPermiso(antigua, "access_salud_ocupacional"), false);
});

test("la recepcionista conserva el acceso ocupacional solo si se le asignó", () => {
  const u = { rol: "recepcionista", permisos: ["access_salud_ocupacional", "registrar_trabajadores_ocupacional"] };
  assert.equal(hasPermiso(u, "registrar_trabajadores_ocupacional"), true);
  assert.equal(hasPermiso(u, "gestionar_empresas_ocupacional"), false);
  assert.equal(hasPermiso({ rol: "administrador" }, "gestionar_empresas_ocupacional"), true);
});
