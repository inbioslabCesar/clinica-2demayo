import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quote_cart_v1";
const QUOTE_CART_CONTEXT_KEY = "__clinica_quote_cart_context_singleton__";
const globalScope = typeof globalThis !== "undefined" ? globalThis : window;
const QuoteCartContext = globalScope[QUOTE_CART_CONTEXT_KEY] || createContext(null);
if (!globalScope[QUOTE_CART_CONTEXT_KEY]) {
  globalScope[QUOTE_CART_CONTEXT_KEY] = QuoteCartContext;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildItemKey(item) {
  const serviceType = String(item.serviceType || "otros").toLowerCase();
  const packageKey = ["paquete", "perfil"].includes(serviceType)
    ? [
        Number(item.packageId || item.serviceId || 0),
        String(item.packageCode || ""),
        String(item.packageType || serviceType),
      ].join("::")
    : "";
  const consultaKey = serviceType === "consulta"
    ? [
        Number(item.consultaId || 0),
        Number(item.consultaMedicoId || 0),
        item.consultaFecha || "",
        item.consultaHora || "",
        item.consultaTipoConsulta || "",
      ].join("::")
    : "";

  return [
    serviceType,
    item.serviceId || "na",
    Number(item.unitPrice || 0).toFixed(2),
    item.presentation || "default",
    item.derivado ? "derivado" : "no-derivado",
    item.derivado ? (item.tipoDerivacion || "") : "",
    item.derivado ? Number(item.valorDerivacion || 0).toFixed(2) : "0.00",
    item.derivado ? (item.laboratorioReferencia || "") : "",
    packageKey,
    consultaKey,
  ].join("::");
}

export function QuoteCartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const parsed = safeParse(sessionStorage.getItem(STORAGE_KEY));
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
      const items = parsed.items.map((item) => ({
        ...item,
        key: buildItemKey(item || {}),
      }));
      return {
        patientId: parsed.patientId || null,
        patientName: parsed.patientName || "",
        items,
      };
    }
    return { patientId: null, patientName: "", items: [] };
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const clearCart = useCallback(() => {
    setCart({ patientId: null, patientName: "", items: [] });
  }, []);

  const setPatient = useCallback((patientId, patientName) => {
    setCart((prev) => ({
      ...prev,
      patientId: patientId || null,
      patientName: patientName || "",
    }));
  }, []);

  const addItems = useCallback((payload) => {
    const {
      patientId,
      patientName,
      items,
    } = payload || {};

    if (!patientId || !Array.isArray(items) || items.length === 0) return;

    setCart((prev) => {
      if (prev.patientId && Number(prev.patientId) !== Number(patientId)) {
        return prev;
      }

      const map = new Map();
      for (const it of prev.items) {
        map.set(it.key, { ...it });
      }

      for (const raw of items) {
        const normalized = {
          key: buildItemKey(raw),
          serviceType: raw.serviceType || "otros",
          serviceId: raw.serviceId || null,
          description: raw.description || "Item",
          unitPrice: Number(raw.unitPrice || 0),
          quantity: Number(raw.quantity || 1),
          presentation: raw.presentation || "default",
          source: raw.source || raw.serviceType || "otros",
          derivado: Boolean(raw.derivado),
          tipoDerivacion: raw.tipoDerivacion || "",
          valorDerivacion: Number(raw.valorDerivacion || 0),
          laboratorioReferencia: raw.laboratorioReferencia || "",
          // Metadata de consulta (solo para serviceType=consulta)
          consultaMedicoId: raw.consultaMedicoId || null,
          consultaFecha: raw.consultaFecha || "",
          consultaHora: raw.consultaHora || "",
          consultaTipoConsulta: raw.consultaTipoConsulta || "",
          consultaId: raw.consultaId || null,
          packageId: raw.packageId || null,
          packageCode: raw.packageCode || "",
          packageType: raw.packageType || "",
          componentes: Array.isArray(raw.componentes) ? raw.componentes : [],
          cotizacionId: raw.cotizacionId || null,
        };
        normalized.quantity = Math.max(1, normalized.quantity);

        if (map.has(normalized.key)) {
          const old = map.get(normalized.key);
          old.quantity = Number(old.quantity || 0) + normalized.quantity;
          old.description = old.description || normalized.description;
          old.consultaMedicoId = old.consultaMedicoId || normalized.consultaMedicoId || null;
          old.consultaFecha = old.consultaFecha || normalized.consultaFecha || "";
          old.consultaHora = old.consultaHora || normalized.consultaHora || "";
          old.consultaTipoConsulta = old.consultaTipoConsulta || normalized.consultaTipoConsulta || "";
          old.consultaId = old.consultaId || normalized.consultaId || null;
          map.set(normalized.key, old);
        } else {
          map.set(normalized.key, normalized);
        }
      }

      return {
        patientId,
        patientName: patientName || prev.patientName || "",
        items: Array.from(map.values()),
      };
    });
  }, []);

  const removeItem = useCallback((key) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.key !== key),
    }));
  }, []);

  const updateQuantity = useCallback((key, quantity) => {
    const qty = Math.max(1, Number(quantity || 1));
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.key === key ? { ...it, quantity: qty } : it)),
    }));
  }, []);

  const total = useMemo(() => {
    return cart.items.reduce((acc, it) => acc + Number(it.unitPrice || 0) * Number(it.quantity || 0), 0);
  }, [cart.items]);

  const count = useMemo(() => cart.items.reduce((acc, it) => acc + Number(it.quantity || 0), 0), [cart.items]);

  const value = useMemo(() => ({
    cart,
    total,
    count,
    clearCart,
    setPatient,
    addItems,
    removeItem,
    updateQuantity,
  }), [cart, total, count, clearCart, setPatient, addItems, removeItem, updateQuantity]);

  return <QuoteCartContext.Provider value={value}>{children}</QuoteCartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuoteCart() {
  const ctx = useContext(QuoteCartContext);
  if (!ctx) {
    throw new Error("useQuoteCart must be used inside QuoteCartProvider");
  }
  return ctx;
}
