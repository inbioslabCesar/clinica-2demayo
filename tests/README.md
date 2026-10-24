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
  y verifican la idempotencia: mismo `client_request_id` → misma cotización, incluso con 4 envíos simultáneos.
- Crean cotizaciones informativas marcadas con `PHPTEST_DELETE_ME` y las **borran al terminar**
  (también limpian restos de una corrida anterior interrumpida). No ejecutar contra producción.

## Nota

`tests/js/support/` registra un resolver de Node para importar los módulos de `src/` (imports sin extensión de Vite)
y stubea `src/config/config.js`, que depende del navegador.
