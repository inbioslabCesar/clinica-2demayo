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

## 4) Catálogo de ubigeo para salud ocupacional — **cambia schema y datos, solo aditivo**
- `007_ubigeo_schema.sql`: crea `departamento`, `provincia`, `distrito` (idempotente, `CREATE TABLE IF NOT EXISTS`) en la BD **clínica**.
- `008_ubigeo_data.sql`: 25 departamentos, 196 provincias, 1862 distritos con `INSERT IGNORE` y ids fijos (sin `TRUNCATE`). **Debe importarse en UTF-8**
  (phpMyAdmin: juego de caracteres del archivo `utf8`; con la consola, `--default-character-set=utf8mb4` y `source`, no con `Get-Content | mysql`, que daña las tildes).
- `009_verify_ubigeo.sql`: debe dar `25 | 196 | 1862 | 0 | 0`.
- Solo lo usa `api_ubigeo.php` (formulario de empresas) y solo con el módulo `ocupacional` activo. **Aplicar solo donde se vaya a activar el módulo (2 de Mayo).**
- Estas tablas **no** están en `esquema_referencia.json` (la referencia sale de la BD de desarrollo): el actualizador de esquema no las crea.

## 5) Logo ocupacional (opcional, solo donde se active el módulo)
- `010_logo_ocupacional.sql`: agrega `configuracion_clinica.logo_ocupacional_url VARCHAR(500) NULL` si no existe (idempotente) y se verifica a sí mismo.
- Sin la columna todo funciona igual: `api_configuracion.php` ignora el campo y los documentos ocupacionales usan `logo_url`.

