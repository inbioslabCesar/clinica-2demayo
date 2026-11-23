// Textos y formato de la suscripción del sistema (puros, sin React, para poder probarlos).

export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function formatoMonto(monto, moneda = "PEN") {
  if (monto === null || monto === undefined || monto === "" || Number.isNaN(Number(monto))) return "";
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${Number(monto).toFixed(2)}`;
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Texto del banner y su tono ("aviso" ámbar, "vencida" rojo). null si no hay nada que mostrar. */
export function textoBanner(info) {
  if (!info || !info.mostrar || info.bloqueado) return null;
  if (info.estado === "aviso") {
    const d = Number(info.dias_restantes);
    const cuando = d <= 0 ? "Su pago vence hoy" : `Faltan ${plural(d, "día", "días")} para el pago de su servicio`;
    return { tono: "aviso", texto: `${cuando} (${fechaCorta(info.fecha_vencimiento)}).` };
  }
  if (info.estado === "vencida") {
    const atraso = Math.abs(Number(info.dias_restantes));
    return {
      tono: "vencida",
      texto: `Pago vencido hace ${plural(atraso, "día", "días")}. Podrá usar el sistema hasta el ${fechaCorta(info.fecha_limite)}; luego se suspenderá.`,
    };
  }
  return null;
}

export const ETIQUETA_METODO = {
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  deposito: "Depósito",
  otro: "Otro",
};

/** Enlace de WhatsApp para enviar el comprobante, o "" si no hay número configurado. */
export function enlaceWhatsapp(numero, mensaje) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (digitos.length < 6) return "";
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje || "")}`;
}
