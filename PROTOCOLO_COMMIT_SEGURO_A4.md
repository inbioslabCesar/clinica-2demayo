# PROTOCOLO COMMIT SEGURO (A4)

## OBJETIVO
Trabajar rapido en main sin perder logica ni romper funcionalidades.

## ORDEN DIARIO (EJECUTAR SIEMPRE)

### 1) INICIO
1. `git checkout main`
2. `git pull origin main`
3. `git status -sb`

### 2) DESARROLLO
1. Un cambio logico por bloque.
2. No mezclar refactor masivo con logica de negocio.
3. Si crece mucho, dividir en 2 o 3 commits pequenos.

### 3) PRE-COMMIT TECNICO
1. `npm run lint`
2. `npm run build`
3. Si tocaste backend PHP: `php -l api_archivo.php`

### 4) PRE-COMMIT FUNCIONAL
1. Probar el flujo que tocaste (inicio a fin).
2. Revisar que no rompiste flujo relacionado.

### 5) COMMIT
1. `git status --short`
2. `git diff`
3. `git add -A`
4. `git commit -m "fix(modulo): descripcion corta"`

### 6) PUSH
1. `git push origin main`
2. Confirmar push exitoso sin errores.

### 7) POST-PUSH
1. `npm run build`
2. Reprobar flujo critico

## SI ALGO FALLA
1. `git log --oneline -n 10`
2. `git revert HASH`
3. `git push origin main`

## REGLAS DE ORO
1. Si hay duda, no pushes.
2. Primero valida, luego commit.
3. Commit pequeno = riesgo pequeno.
4. Build rojo = no push.

## CHECKLIST EXPRESS (MARCAR)
- [ ] Actualice main
- [ ] Lint sin errores
- [ ] Build OK
- [ ] Prueba manual OK
- [ ] Commit claro
- [ ] Push OK
- [ ] Verificacion final OK
