# Runbook: `CrashLoopBackOff`

## Objetivo

Procedimiento reutilizable para diagnosticar y resolver un pod en `CrashLoopBackOff`, sin asumir la causa antes de mirar evidencia. Basado en el caso documentado en [`INCIDENTE-crashloopbackoff-demo.md`](INCIDENTE-crashloopbackoff-demo.md).

Aplica cuando:

- `kubectl get pods` muestra uno o más pods en estado `CrashLoopBackOff`.
- `RESTARTS` crece con el tiempo y el intervalo entre reinicios aumenta (backoff exponencial).

## Prerequisitos

- Acceso `get`/`describe`/`logs` sobre el namespace afectado (Pasos 1-5, solo lectura). Acceso `apply`/`rollout` si se va a ejecutar el Paso 6.
- `kubectl` configurado contra el contexto correcto: verificar con `kubectl config current-context` antes de ejecutar cualquier comando.
- Manifiesto fuente del recurso (Deployment/Pod) disponible localmente o en el repo de GitOps, para comparar contra lo que está corriendo en el clúster.
- Diagnóstico (Pasos 1-5) no requiere ventana de mantención. Si el Paso 6 modifica un Deployment en `prod`, seguir la ventana de mantención estándar del equipo antes de aplicar el fix.

## Procedimiento

### Paso 1 — Confirmar el alcance

```bash
kubectl get pods -n <namespace> -o wide
kubectl get pods -n <namespace> -l app=<label> -w   # observar si TODAS las réplicas o solo algunas
```

¿Es un pod aislado (posible problema de nodo/recursos) o todas las réplicas del Deployment (posible problema de imagen/config/comando)?

### Paso 2 — `describe`, siempre antes que logs

```bash
kubectl describe pod -n <namespace> -l app=<label>
```

Buscar:
- `Last State` → `Reason` (`Error`, `OOMKilled`, `Completed`) y `Exit Code`.
- `Events` → `Back-off restarting failed container`, `Failed to pull image`, `Liveness probe failed`, etc.

El `Reason`/`Exit Code` acota inmediatamente la familia de causa antes de leer una sola línea de log.

### Paso 3 — Logs del contenedor

```bash
kubectl logs -n <namespace> -l app=<label>
kubectl logs -n <namespace> -l app=<label> --previous   # estado del intento anterior
```

`--previous` puede fallar (`unable to retrieve container logs`) si el runtime ya rotó el log del intento anterior — no depender solo de esto en un incidente real; capturar con `-f` o usar un agregador de logs si el crashloop es persistente.

### Paso 4 — Mapear el `Exit Code` / `Reason` a la causa

| Señal | Causa probable | Dónde mirar |
|---|---|---|
| `Exit Code: 1` (o distinto de 0) sin `OOMKilled` | El proceso/script del contenedor termina solo (bug, `exit` explícito, dependencia no disponible) | `command`/`args` del manifiesto, logs de la app |
| `Reason: OOMKilled` | El contenedor excede `resources.limits.memory` | `resources.limits` en el manifiesto vs. consumo real |
| `Failed to pull image` | Imagen inexistente, tag incorrecto, o falta credencial de registry privado | `image:` en el manifiesto, `imagePullSecrets` |
| `Liveness probe failed` en `Events`, contenedor sí arranca | Probe mal configurado (timeout corto, path incorrecto) mata un proceso que iba a estar listo | `livenessProbe` en el manifiesto |
| Exit inmediato, sin logs útiles | Falta un comando/entrypoint válido en la imagen, o config/secret requerido ausente | `command`, `env`, `envFrom`, Secrets/ConfigMaps referenciados |

### Paso 5 — Revisar el manifiesto fuente

`kubectl apply` no valida qué hace el contenedor en runtime — solo que el YAML es sintácticamente válido. Confirmar contra el archivo fuente (no solo contra lo que ya está en el clúster) que `command`/`args`/`env`/`resources` son los esperados.

### Paso 6 — Aplicar el fix

```bash
kubectl apply -f <manifiesto-corregido>.yaml
kubectl rollout status deployment/<nombre> -n <namespace>
```

## Verificación

Cierre el incidente solo cuando se cumplan **todas** las siguientes condiciones:

```bash
kubectl get pods -n <namespace> -o wide
kubectl get pods -n <namespace> -l app=<label>
```

- Pods en `<N>/<N> Running`.
- `RESTARTS: 0` desde el último rollout (revisar `AGE` del pod para confirmar que es posterior al `apply`).
- Si aplica, el endpoint/health check del servicio responde correctamente.

Si alguna condición no se cumple, no cerrar el incidente: volver al Paso 2 con la evidencia nueva, o pasar a Rollback si el fix empeoró la situación.

## Rollback

Si el fix aplicado en el Paso 6 no resuelve el `CrashLoopBackOff` o introduce un problema nuevo:

```bash
kubectl rollout undo deployment/<nombre> -n <namespace>
kubectl rollout status deployment/<nombre> -n <namespace>
kubectl get pods -n <namespace> -o wide
```

- `rollout undo` revierte al `ReplicaSet` anterior (la revisión previa a la aplicada en el Paso 6), no requiere tener el YAML anterior a mano.
- Confirmar el estado post-rollback con los mismos criterios de la sección **Verificación**.
- Si el estado previo al Paso 6 *ya* estaba en `CrashLoopBackOff` (el fix no cambió nada o el problema es previo al último deploy), `rollout undo` no alcanza — escalar según la sección siguiente en vez de seguir revirtiendo a ciegas.

## Escalamiento

Si tras el Paso 4 la causa no es evidente (p. ej. crash intermitente que no reproduce en `describe`/`logs`), capturar:
- YAML completo del recurso (`kubectl get deploy/pod <nombre> -o yaml`)
- Logs de todos los reinicios recientes (`--previous` de cada pod afectado)
- Eventos del namespace (`kubectl get events -n <namespace> --sort-by=.lastTimestamp`)

y escalar con esa evidencia adjunta en vez de reintentar cambios a ciegas.

## Lecciones aplicadas (de incidentes reales de este repo)

- `CrashLoopBackOff` es el síntoma del mecanismo de reinicio, no la causa — la causa siempre está un nivel más abajo.
- `describe` antes que `logs`: el `Exit Code`/`Reason` acota la búsqueda.
- La verdad vive en el estado runtime, no en el resultado del `apply`.
