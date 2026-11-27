# 2026-11-26

## Seguimiento clínico, fase 2 (módulo `seguimiento_clinico`) — **cambia schema, solo aditivo**

El médico busca pacientes de toda la clínica por DNI y revisa su historial; cada apertura de historial o detalle queda registrada.

- `001_schema_seguimiento_accesos.sql`: crea la tabla `seguimiento_clinico_accesos`. Idempotente; no modifica tablas existentes. Ya está en `db/esquema_referencia/esquema_referencia.json`, así que el actualizador de esquema también la crea.
- `002_verify_seguimiento_accesos.sql`: verificación de solo lectura (10 columnas).
- `003_info_accesos_recientes.sql`: informativo, últimos 100 accesos (para auditoría de privacidad). Ejecutar cada script por separado en phpMyAdmin.

**Orden de despliegue:** primero el schema en cada clínica (con respaldo), luego el código y, al final, activar el módulo desde el Engineer. Si falta la tabla, el endpoint la crea al primer uso; si no puede crearla, **no entrega el historial** (el registro de acceso es obligatorio).

**No viaja en el build:** la tabla y la activación del módulo viven en la BD de cada clínica.
