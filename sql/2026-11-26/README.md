# 2026-11-26

## Seguimiento clínico, fase 2 (módulo `seguimiento_clinico`) — **cambia schema, solo aditivo**

El médico busca pacientes de toda la clínica por DNI y revisa su historial; cada apertura de historial o detalle queda registrada.

- `001_schema_seguimiento_accesos.sql`: crea la tabla `seguimiento_clinico_accesos`. Idempotente; no modifica tablas existentes. Ya está en `db/esquema_referencia/esquema_referencia.json`, así que el actualizador de esquema también la crea.
- `002_verify_seguimiento_accesos.sql`: verificación de solo lectura (10 columnas).
- `003_info_accesos_recientes.sql`: informativo, últimos 100 accesos (para auditoría de privacidad). Ejecutar cada script por separado en phpMyAdmin.

**Orden de despliegue:** primero el schema en cada clínica (con respaldo), luego el código y, al final, activar el módulo desde el Engineer. Si falta la tabla, el endpoint la crea al primer uso; si no puede crearla, **no entrega el historial** (el registro de acceso es obligatorio).

**No viaja en el build:** la tabla y la activación del módulo viven en la BD de cada clínica.

## Seguimiento clínico, fase 3 (generar consulta con/sin cobro) — **cambia schema, solo aditivo**

El médico genera desde Seguimiento clínico una consulta de seguimiento en una hora libre de su agenda: **con cobro** (consulta `falta_cancelar` + cotización `pendiente` con la tarifa del médico) o **sin cobro / exonerada** (motivo obligatorio de 10 a 255 caracteres, sin cobro ni honorario).

- `004_schema_seguimiento_consultas.sql`: crea `seguimiento_clinico_consultas` (11 columnas; clave única `medico_id + client_request_id` para que un reintento o doble clic no duplique). Idempotente; ya está en `db/esquema_referencia/esquema_referencia.json`.
- `005_verify_seguimiento_consultas.sql`: verificación de solo lectura.
- `006_info_consultas_generadas.sql`: informativo, consultas generadas.

**Exonerada:** la cotización se guarda como `pagado` con total 0 (los triggers `*_cotizaciones_saldo_guard` fuerzan `pagado` cuando el saldo es 0) y la etiqueta `exonerada` se deriva al leer desde `seguimiento_clinico_consultas.modo = 'sin_cobro'`.

**Orden de despliegue:** schema `001` y `004` en cada clínica (con respaldo), luego el código y, al final, activar el módulo. El módulo se activa por clínica y **no viaja en el build**.
