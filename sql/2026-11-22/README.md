# 2026-11-22

Esta carpeta agrupa tres cosas independientes del día:

## 1) Herramienta de actualización de esquema (solo lectura)
- `001_verify_huella_estructura.sql`: devuelve `elementos` y `huella` (MD5) de columnas, índices y FKs normalizados.
  Ejecutarlo igual en dev y en cada cliente (phpMyAdmin > SQL, con la BD seleccionada). Si coinciden, la estructura es idéntica.
  En clientes solo coincide con dev tras aplicar el actualizador con `--nombres-exactos --incluir-fks` y si no hay objetos sobrantes.
- Huella de dev tras añadir `modulos_instalacion`: 133 tablas · 1693 columnas · 622 índices · 88 FKs → `084ed7f2815972f51cf565fc30abcddf` (2403 elementos).
- Se excluyen tablas de un solo uso: `backup`, `bkp`, `bak` (como palabra dentro del nombre) y prefijo `zfix_`.
- Herramienta: [scripts/esquema_bd/README.md](../../scripts/esquema_bd/README.md).

## 2) Corrección de ENUM con acentos dañados (solo BD `materno`, ya aplicada)
- `002_diagnostico_...` (solo lectura), `003_..._paso1_reparar.sql` y `004_..._paso2_restaurar_enum.sql`.

## 3) Módulos y licencias por instalación (Fase 1) — **cambia schema, solo aditivo**
- `005_modulos_instalacion_schema.sql`: crea `modulos_instalacion` y `modulos_instalacion_historial` (idempotente) y siembra
  `clinico=1`, `ocupacional=0`, `portal_empresas=0`. No modifica nada existente.
- `006_verify_modulos_instalacion.sql`: verificación de solo lectura (debe dar 3 filas).
- **No viaja en el build:** activar un módulo en una clínica es un cambio en SU BD. Sin la tabla, el sistema falla seguro (solo `clinico` activo).
- Se aplica con el actualizador de esquema (la tabla ya está en `db/esquema_referencia/esquema_referencia.json`) o pegando el `005` en phpMyAdmin.
