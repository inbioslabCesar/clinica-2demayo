import test from "node:test";
import assert from "node:assert/strict";
import { fechaCorta, formatoMonto, textoBanner, enlaceWhatsapp } from "../../src/utils/licenciaFormato.js";

test("textoBanner: aviso previo, vence hoy, vencida y estados sin banner", () => {
  const aviso = textoBanner({ mostrar: true, estado: "aviso", dias_restantes: 10, fecha_vencimiento: "2026-12-31" });
  assert.equal(aviso.tono, "aviso");
  assert.match(aviso.texto, /Faltan 10 días/);
  assert.match(aviso.texto, /31\/12\/2026/);
  assert.match(textoBanner({ mostrar: true, estado: "aviso", dias_restantes: 1, fecha_vencimiento: "2026-12-31" }).texto, /Faltan 1 día para/);
  assert.match(textoBanner({ mostrar: true, estado: "aviso", dias_restantes: 0, fecha_vencimiento: "2026-12-31" }).texto, /vence hoy/);
  const vencida = textoBanner({ mostrar: true, estado: "vencida", dias_restantes: -3, fecha_limite: "2027-01-05" });
  assert.equal(vencida.tono, "vencida");
  assert.match(vencida.texto, /hace 3 días/);
  assert.match(vencida.texto, /05\/01\/2027/);
  assert.equal(textoBanner({ mostrar: false }), null);
  assert.equal(textoBanner({ mostrar: true, estado: "bloqueada", bloqueado: true }), null);
  assert.equal(textoBanner(null), null);
});

test("formato de fecha, monto y WhatsApp", () => {
  assert.equal(fechaCorta("2026-12-31"), "31/12/2026");
  assert.equal(fechaCorta(null), "");
  assert.equal(formatoMonto("150", "PEN"), "S/ 150.00");
  assert.equal(formatoMonto(20, "USD"), "US$ 20.00");
  assert.equal(formatoMonto(null), "");
  assert.equal(enlaceWhatsapp("+51 999-111-222", "Hola mundo"), "https://wa.me/51999111222?text=Hola%20mundo");
  assert.equal(enlaceWhatsapp("", "x"), "");
});
