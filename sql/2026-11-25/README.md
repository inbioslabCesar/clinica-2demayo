# 2026-11-25

Esta carpeta agrupa varias lógicas del día; cada script indica su tema.

## Portal del paciente: publicar archivos subidos (PDF / imágenes) — **cambia schema, solo aditivo**

- `004_schema_archivos_portal.sql`: agrega `publicar_paciente` a `documentos_externos_archivos` y `ordenes_imagen_archivos`, `titulo` a
  `ordenes_imagen_archivos` y `laboratorio_origen` a `documentos_externos_paciente`. Idempotente; no modifica datos existentes
  (todo lo ya subido queda **sin publicar**, nada se hace visible retroactivamente). Requiere `DELIMITER` (usar el cliente `mysql`, no `multi_query`).
  Ya está en `db/esquema_referencia/esquema_referencia.json`, así que el actualizador de esquema también lo aplica.
- `005_verify_archivos_portal.sql`: verificación de solo lectura.

**Orden de despliegue:** primero el schema en cada clínica (con respaldo), luego el código. El código tolera la ausencia de columnas, pero la función no opera hasta que existan.

**No viaja en el build:** el módulo `portal_pacientes` y los interruptores `publicar_laboratorio` / `publicar_imagenologia` (`paciente_portal_config`, por defecto activos) viven en la BD de cada clínica.
La regla de `.htaccess` que cierra `uploads/documentos_externos/` y `uploads/imagenes_diagnostico/` sí viaja en el deploy; verificar después que una URL directa responde 403.
