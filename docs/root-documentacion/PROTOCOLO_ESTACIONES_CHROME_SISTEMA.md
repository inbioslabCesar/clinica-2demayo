# Protocolo Operativo - Estaciones del Sistema (1 pagina)

Objetivo: mantener el sistema fluido y evitar bloqueos tipo "Ups! Algo salio mal" en PCs de recepcion, laboratorio, farmacia y medico.

## 1) Configuracion inicial (una sola vez por PC)

1. Crear un perfil nuevo de Chrome llamado `Sistema Clinica`.
2. No sincronizar extensiones del perfil personal.
3. En `Configuracion > Al iniciar`, seleccionar `Abrir la pagina Nueva pestana`.
4. Desactivar `Continuar donde lo dejaste`.
5. En `Idiomas`, desactivar `Ofrecer traducir paginas`.
6. Marcar `Nunca traducir este sitio` para el dominio del sistema.
7. Desactivar extensiones no esenciales (traductores, inyectores, utilidades de script).
8. Probar `Aceleracion por hardware`:
   - Si la PC es antigua: desactivarla y reiniciar Chrome.
   - Si el rendimiento empeora: activarla de nuevo.

## 2) Regla de uso diario por trabajador

1. Usar solo el perfil `Sistema Clinica` para el sistema.
2. No abrir otras webs en ese perfil (WhatsApp Web, YouTube, Zoom, etc.).
3. Mantener 1 pestana principal del sistema por usuario.
4. Reiniciar Chrome cada 3-4 horas de turno.
5. Reiniciar laptop al inicio del dia (evitar hibernacion continua por varios dias).

## 3) Recovery rapido (cuando se ponga lento)

1. Cerrar Chrome completo.
2. Abrir nuevamente el perfil `Sistema Clinica`.
3. Borrar solo datos del sitio del dominio del sistema (cookies/cache/storage del sitio).
4. Iniciar sesion otra vez.
5. Si mejora de inmediato: causa confirmada en entorno local del navegador.

## 4) Diagnostico rapido (2 minutos)

1. Si 1 sola PC falla y otra PC limpia funciona: problema local (perfil/extensiones/cache/GPU).
2. Si varias PCs fallan al mismo tiempo: revisar hosting/servidor.

## 5) Matriz de decision para soporte

1. Sintoma: logo no carga, login se cuelga, aparece ErrorBoundary.
   - Accion: desactivar traduccion, extensiones, y limpiar datos del sitio.
2. Sintoma: funciona bien al inicio y luego se degrada.
   - Accion: perfil dedicado + reinicio de Chrome programado.
3. Sintoma: lentitud simultanea en varias areas.
   - Accion: revisar recursos del hosting (CPU/RAM/PHP workers/MySQL conexiones).

## 6) Checklist de cierre (OK/NO)

- [ ] Perfil `Sistema Clinica` creado
- [ ] Traduccion desactivada para el sitio
- [ ] Extensiones no esenciales desactivadas
- [ ] Sincronizacion de perfil personal desactivada
- [ ] Prueba de login y navegacion OK
- [ ] Registro de hora y responsable de validacion

---

Responsable TI: ____________________

Fecha: ____________________

Sede/Area: ____________________
