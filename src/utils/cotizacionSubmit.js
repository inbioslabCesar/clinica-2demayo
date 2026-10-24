// Pasos compartidos por los cotizadores (Ecografía, Rayos X, Procedimientos, Operación) al registrar una cotización.

const NO_EDITABLE_RE = /no esta en estado editable|no está en estado editable/i;

export function esErrorNoEditable(data) {
  return NO_EDITABLE_RE.test(String(data?.error || ""));
}

export async function postCotizacion({ authFetch, baseUrl, payload }) {
  const res = await authFetch(`${baseUrl}api_cotizaciones.php`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/**
 * Si hay items en el carrito del mismo paciente, pide confirmar que se limpiará al registrar.
 * Devuelve { cancelado, limpiarCarrito }.
 */
export async function confirmarLimpiezaCarrito({ Swal, cart, pacienteId, esEdicion }) {
  const cartItemsCount = Array.isArray(cart?.items) ? cart.items.length : 0;
  const esMismoPacienteCarrito = Number(cart?.patientId || 0) === Number(pacienteId || 0);
  if (cartItemsCount === 0 || !esMismoPacienteCarrito) {
    return { cancelado: false, limpiarCarrito: false };
  }
  const confirm = await Swal.fire({
    title: "Carrito activo detectado",
    text: `Hay ${cartItemsCount} item(s) en el carrito. Si ${esEdicion ? "actualizas" : "registras"} desde este cotizador, el carrito se limpiara para evitar inconsistencias.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: esEdicion ? "Actualizar y limpiar carrito" : "Registrar y limpiar carrito",
    cancelButtonText: "Cancelar",
  });
  if (!confirm.isConfirmed) return { cancelado: true, limpiarCarrito: false };
  return { cancelado: false, limpiarCarrito: true };
}

/**
 * Envía la cotización; si es una edición sobre una cotización ya pagada, ofrece crear una adenda.
 * Devuelve { data, cancelada } (cancelada = el usuario rechazó la adenda).
 */
export async function registrarConFallbackAdenda({
  authFetch,
  baseUrl,
  Swal,
  payload,
  cotizacionId,
  detallesAdenda,
  totalAdenda,
  fechaRef,
  motivoAdenda,
}) {
  let data = await postCotizacion({ authFetch, baseUrl, payload });

  if (!data?.success && cotizacionId && esErrorNoEditable(data)) {
    const confirmAdenda = await Swal.fire({
      title: "Cotización ya pagada",
      text: `La cotización #${Number(cotizacionId)} no se puede editar directamente. ¿Deseas crear una adenda nueva con estos cambios?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, crear adenda",
      cancelButtonText: "No, cancelar",
    });
    if (!confirmAdenda.isConfirmed) {
      return { data, cancelada: true };
    }
    data = await postCotizacion({
      authFetch,
      baseUrl,
      payload: {
        accion: "adenda",
        cotizacion_id: Number(cotizacionId),
        detalles: detallesAdenda,
        total: totalAdenda,
        ...(fechaRef ? { fecha_ref: fechaRef } : {}),
        motivo: motivoAdenda,
      },
    });
  }

  return { data, cancelada: false };
}

/** Mensaje de éxito, limpieza opcional del carrito y navegación posterior al registro. */
export function finalizarRegistroCotizacion({
  Swal,
  navigate,
  data,
  cotizacionId,
  pacienteId,
  irACobro,
  limpiarCarritoAlFinal,
  clearCart,
  setMensaje,
  refrescarDetalles,
}) {
  const cotizacionDestino = Number(data?.cotizacion_id || cotizacionId || 0);
  const fueAdenda = Boolean(cotizacionId) && cotizacionDestino > 0 && cotizacionDestino !== Number(cotizacionId);

  setMensaje(
    fueAdenda
      ? "Adenda creada correctamente."
      : (cotizacionId ? "Cotización actualizada correctamente." : "Cotización registrada correctamente.")
  );
  Swal.fire(
    "Listo",
    fueAdenda ? "Adenda creada." : (cotizacionId ? "Cotización actualizada." : "Cotización registrada."),
    "success"
  ).then(async () => {
    if (limpiarCarritoAlFinal) {
      clearCart();
    }
    if (irACobro && cotizacionDestino > 0) {
      navigate(`/cobrar-cotizacion/${Number(cotizacionDestino)}`);
      return;
    }
    if (cotizacionDestino > 0 && cotizacionId) {
      try {
        await refrescarDetalles(cotizacionDestino);
      } catch {
        // Continuar navegación aunque falle el refresco.
      }
      navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${Number(cotizacionDestino)}&modo=editar&back_to=/cotizaciones`, {
        state: { pacienteId: Number(pacienteId), cotizacionId: Number(cotizacionDestino), backTo: "/cotizaciones", modo: "editar" },
      });
      return;
    }
    navigate("/cotizaciones");
  });
}
