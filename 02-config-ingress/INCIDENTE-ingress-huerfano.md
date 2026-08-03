# Postmortem: controller sin reglas + regla sin backend (dos huérfanos, cero errores)

**Entorno:** clúster kind local (`sre-lab`) · **Severidad:** lab / brecha de configuración silenciosa · **Estado:** resuelto y verificado

## Resumen

Al retomar el laboratorio de Ingress se descubrió que el Ingress Controller (nginx) llevaba **16 días corriendo en el clúster sin una sola regla que ejecutar** — instalado en una sesión anterior y nunca configurado. Al crear la regla, esta quedó apuntando a un Service que ya no existía (borrado en la limpieza de un lab previo). En ninguno de los dos estados hubo error de `apply`: ambos huérfanos convivieron felices con exit codes limpios.

## Línea de tiempo

1. **Día 0 (sesión original):** se instaló ingress-nginx en el clúster. El lab quedó interrumpido antes de crear reglas. Sin registro del pendiente.
2. **Día 16:** al re-aplicar el manifiesto de instalación, la salida delató la historia: casi todo `unchanged` y el pod del controller con `AGE 16d, RESTARTS 9` (los reinicios de WSL acumulados).
3. Se creó la regla Ingress → `kubectl apply` exitoso.
4. `kubectl describe ingress mi-app` → `mi-app:80 (<error: services "mi-app" not found>)`. La regla apuntaba a una puerta inexistente: el Service había sido borrado en la limpieza del lab anterior, y `kubectl get deployment,service` solo mostraba el `service/kubernetes` del sistema.
5. Se recrearon Deployment y Service desde los manifiestos del repo.
6. Sin tocar el Ingress, el controller re-sincronizó solo (`Events: Sync x2`): el error fue reemplazado por los endpoints reales (`10.244.0.9:8080,10.244.0.10:8080`).
7. Verificación de cierre: `curl` con header `Host` → `{"status":"ok"}`; sin `Host` → 404 del controller. Ruteo de capa 7 confirmado.

## Causa raíz

Dos brechas del mismo tipo — **referencias y dependencias que Kubernetes acepta sin validar en el `apply`**:

1. Infraestructura instalada sin configuración aplicada (controller sin reglas): ningún componente alerta que un router lleva semanas sin rutas.
2. Configuración apuntando a dependencias inexistentes (Ingress → Service borrado): el `apply` de la regla fue exitoso; la referencia rota solo era visible en `describe`.

Causa contribuyente: lab interrumpido sin registrar el estado pendiente — el "yo del futuro" no tenía forma de saber qué faltaba.

## Lecciones

- **`kubectl apply` exitoso ≠ sistema funcional.** Kubernetes es declarativo y tolerante a referencias rotas: acepta un Ingress hacia un Service inexistente igual que aceptó un HPA hacia un Deployment borrado (incidente previo del proyecto). El patrón se repite: la verdad vive en `describe`, no en el exit code.
- **La evidencia negativa pesa igual que la positiva.** El diagnóstico del Service faltante no estaba en ninguna fila del `get` — estaba en la fila que *no* aparecía. Leer salidas es también leer ausencias.
- **La reconciliación sana referencias, no resucita borrados.** El reconciliation loop mantiene lo declarado que existe; lo borrado deliberadamente no vuelve. Pero al re-declarar el Service, el controller convergió solo — el estado deseado escrito es el que permite auto-sanación.
- **Todo lab interrumpido necesita un registro del pendiente.** Un `PENDIENTE.md` de una línea habría evitado 16 días de router fantasma.
- Paralelo con infraestructura tradicional: es el clásico balanceador aprovisionado sin VIPs configuradas, o la regla de firewall hacia un servidor decomisionado — el monitoreo de "¿está corriendo?" dice verde mientras la función de negocio no existe.
