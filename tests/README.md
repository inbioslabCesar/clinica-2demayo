# Pruebas

Sin dependencias nuevas: usan `node --test` (Node 20+) y un runner PHP propio.

| Comando | Qué ejecuta |
|---|---|
| `npm test` | Pruebas JS + pruebas PHP unitarias (no tocan la BD) |
| `npm run test:js` | Lógica compartida del frontend (`src/utils`, `src/hooks/useSubmitGuard.js`) |
| `npm run test:php` | Reglas de agenda del médico (`modules/AgendaMedicoRegla.php`) |
| `npm run test:db` | Lo anterior + pruebas contra la **BD de desarrollo** |

## Pruebas con BD (`test:db`)

- Requieren haber aplicado `sql/2026-10-24/001_schema.sql` (columna `cotizaciones.client_request_id`).
- Llaman a `api_cotizaciones.php` en CLI como un administrador simulado (`tests/php/support/http_harness.php`)
  y verifican la idempotencia (cotizaciones y adendas), la unificación de consultas/órdenes y el quitar ítems.
- Crean datos marcados con `PHPTEST_DELETE_ME` y los **borran al terminar**
  (también limpian restos de una corrida anterior interrumpida). No ejecutar contra producción.

## Caracterización del cobro (`test:cobro`)

Red de seguridad para refactorizar `CobroModule::procesarCobro`. Ejecuta cobros **reales** (`api_cobros.php`) contra una
**BD clon** (nunca la real) y compara el estado resultante con una foto guardada (`tests/php/golden/cobro.json`).

1. `npm run test:db:clone` — clona `poli2demayo` en `poli2demayo_test` (el nombre debe terminar en `_test`; `POLI_TEST_DB` la cambia).
2. `npm run test:cobro` — compara contra la foto. Debe dar `8 iguales`.
3. `npm run test:cobro:grabar` — regraba la foto. Úsalo **solo** cuando un cambio de comportamiento sea intencional y revisado.

Escenarios: cobro completo, abono parcial + saldo, descuento, cobro unificado base + adenda, reintento idempotente,
cotización ya pagada, y reprogramación a hora ocupada / libre. Los ids se normalizan a marcadores (`<consulta_id#1>`)
para conservar las relaciones sin depender de números; fechas y horas del reloj se enmascaran.
Las cotizaciones se crean en fechas futuras aleatorias, así que se puede repetir sin reclonar.

## Nota

`tests/js/support/` registra un resolver de Node para importar los módulos de `src/` (imports sin extensión de Vite)
y stubea `src/config/config.js`, que depende del navegador.
