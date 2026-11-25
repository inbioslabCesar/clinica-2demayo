# 2026-11-24

## Portal del paciente (módulo `portal_pacientes`) — **cambia schema, solo aditivo**

El paciente entra en `/resultados` con DNI + PIN de 6 dígitos y descarga sus resultados de laboratorio e imagenología.

- `001_schema_portal_pacientes.sql`: crea 4 tablas (`paciente_portal_accesos`, `paciente_portal_liberaciones`, `paciente_portal_config`, `paciente_portal_eventos`). Idempotente; no toca tablas existentes. Ya están en `db/esquema_referencia/esquema_referencia.json`, así que el actualizador de esquema también las crea.
- `002_activar_modulo_portal_pacientes.sql`: **datos/configuración**. Activa el módulo en UNA clínica (solo donde se contrate). Alternativa: panel Engineer → Módulos.
- `003_verify_portal_pacientes.sql`: verificación de solo lectura.

**No viaja en el build:** el módulo nace apagado y su activación es un cambio en la BD de cada clínica. Sin el módulo activo, `api_paciente_portal.php` y `api_paciente_portal_gestion.php` responden 403.

Reglas de entrega: ver el comentario de cabecera de `modules/PortalPaciente.php`. Opciones por clínica (`paciente_portal_config`, sin filas = valores por defecto):
`modo_liberacion` = `automatico` | `manual`, `bloquear_deuda` = `1` | `0`.
