# Incidente: Webhook de GitHub rechazado (403 crumb) y luego con timeout

**Fecha:** 10 de agosto de 2026
**Componente:** Integración GitHub → ngrok → Jenkins (job `mi-app-ci`)
**Severidad:** Laboratorio — bloqueó el disparo automático del pipeline hasta resolverse

## Síntoma

Tras configurar el webhook en GitHub (Settings → Webhooks) con el plugin GitHub Integration instalado en Jenkins, un push a `main` no disparaba ningún build. En **Recent Deliveries** de GitHub, la entrega mostraba `403` con el cuerpo:
```
Error 403 No valid crumb was included in the request
```
Corregido eso, la siguiente entrega falló distinto, con:
```
context deadline exceeded (Client.Timeout exceeded while awaiting headers)
```

## Diagnóstico

**Primer fallo (403):** el mensaje de error, extraído del *body* completo de la respuesta (no solo el código HTTP), fue explícito: `No valid crumb was included in the request`. Jenkins protege todo `POST` con un token anti-CSRF ("crumb") ligado al origen de la petición; al llegar la petición a través de un proxy externo (ngrok), Jenkins no reconocía ese origen como confiable.

**Segundo fallo (timeout):** revisando el panel de inspección de ngrok (`http://127.0.0.1:4040`), la petición fallida mostraba:
```
POST /    403 Forbidden
```
en vez de `POST /github-webhook/`. La Payload URL configurada en GitHub no incluía el path completo del endpoint — apuntaba a la raíz del túnel.

## Causa raíz

- **403:** Jenkins sin la opción de compatibilidad con proxy activada en su protección CSRF — trata cualquier POST externo llegado a través de un intermediario como sospechoso por defecto.
- **Timeout:** la Payload URL del webhook en GitHub no tenía el path `/github-webhook/` (con la barra final), que es la ruta exacta con excepción de seguridad especial en Jenkins para eventos de GitHub. Al llegar a `/` en cambio, Jenkins la trataba como una petición normal a la interfaz web, sujeta al crumb — de ahí que el primer síntoma (403) y el segundo (timeout) fueran, en el fondo, la misma causa de fondo vista en dos configuraciones incompletas distintas del mismo webhook.

## Fix

**1. Habilitar compatibilidad de proxy en CSRF:**
`Manage Jenkins → Security → CSRF Protection → Enable proxy compatibility` → Guardar.

**2. Corregir la Payload URL del webhook** en GitHub → Settings → Webhooks → editar:
```
https://<url-ngrok>.ngrok-free.dev/github-webhook/
```
(con la barra final, path completo).

## Verificación

- GitHub → Recent Deliveries → botón **Redeliver** en la entrega fallida, sin necesidad de un commit nuevo.
- Panel de ngrok mostrando `POST /github-webhook/ → 200 OK`.
- Log del contenedor de Jenkins (`docker logs -f jenkins`) confirmando la recepción y el disparo:
  ```
  Received PushEvent for https://github.com/epessil/mi-app-ci ... ⇒ .../github-webhook/
  Poked mi-app-ci
  SCM changes detected in mi-app-ci. Triggering #4
  ```
- Build disparado con causa `Started by GitHub push by epessil` (confirmado en la sección "Causa" del build), no un click manual.

## Lección

Un mismo síntoma superficial ("el webhook no hace nada") puede tener causas distintas en capas distintas del mismo mecanismo — primero seguridad (crumb/CSRF), después enrutamiento (path exacto del endpoint). El diagnóstico efectivo fue de afuera hacia adentro: túnel (¿ngrok vivo?) → entrega HTTP (¿qué código y qué *body* exacto devuelve GitHub?) → recepción interna (¿aparece en los logs del contenedor?) → causa (¿el mensaje de error nombra el problema real, o solo el código genérico?). El código HTTP por sí solo (403, timeout) no alcanza para diagnosticar — el *body* de la respuesta y el path exacto de la petición fueron los datos que realmente resolvieron el caso.
