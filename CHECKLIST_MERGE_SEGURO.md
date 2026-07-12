# Checklist De Merge Seguro

Usa este checklist antes de hacer merge a `main` para reducir riesgo de perder logicas.

## 1) Preparar base limpia

```bash
git checkout main
git pull origin main
git checkout <tu-rama>
git rebase main
```

## 2) Validar alcance del cambio

- El PR debe tocar solo lo necesario.
- Evita mezclar backend + frontend + SQL en el mismo PR si no es estrictamente necesario.
- Si el cambio es grande, divide en PRs pequenos por tema.

## 3) Revisar archivos criticos

- Revisar manualmente diffs de:
	- `api_cotizaciones.php`
	- `api_recordatorios_citas.php`
	- `src/components/cotizacion/QuoteCartPanel.jsx`
	- `src/pages/RecordatoriosCitasPage.jsx`
- Confirmar que no desaparecen funciones/paths sensibles.

Comando util:

```bash
git diff --name-only main...HEAD
```

## 4) Resolver conflictos con cuidado

- No aceptar archivo completo por rapidez (`ours/theirs`) en archivos criticos.
- Resolver bloque por bloque.
- Releer el diff final antes de continuar.

Comandos utiles:

```bash
git status
git diff
```

## 5) Validacion funcional minima

- Crear cotizacion con servicio no-consulta programado.
- Verificar insercion en `agenda_servicios_cotizacion`.
- Confirmar que aparece en Recordatorios.
- Editar cotizacion y validar re-sincronizacion de agenda.
- Anular cotizacion y validar limpieza de agenda.

## 6) Validacion tecnica

- Lint/sintaxis en endpoints modificados.
- Build completo del sistema.

Comandos recomendados:

```bash
php -l api_cotizaciones.php
php -l api_recordatorios_citas.php
npm run build
```

## 7) Verificar regresion en main local

Despues de merge local:

```bash
git checkout main
git pull origin main
npm run build
```

## 8) Cierre seguro

- Confirmar arbol limpio antes de push.
- Commit con mensaje claro y alcance unico.
- Push a remoto y validacion rapida post-push.

Comandos:

```bash
git status -sb
git push origin main
```

## 9) Trazabilidad recomendada

- Si un flujo es sensible, deja en el PR:
	- caso de prueba manual ejecutado
	- tablas impactadas
	- endpoints impactados
	- riesgo de regresion

## 10) Regla de oro

Si hay duda en conflicto de un archivo critico, detener merge y pedir segunda revision.
