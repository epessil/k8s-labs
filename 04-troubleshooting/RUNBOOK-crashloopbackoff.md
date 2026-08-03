# Runbook: `CrashLoopBackOff`

**Objetivo:** procedimiento reutilizable para diagnosticar y resolver un pod en `CrashLoopBackOff`, sin asumir la causa antes de mirar evidencia. Basado en el caso documentado en [`INCIDENTE-crashloopbackoff-demo.md`](INCIDENTE-crashloopbackoff-demo.md).

## Cuándo usar este runbook

- `kubectl get pods` muestra uno o más pods en estado `CrashLoopBackOff`.
- `RESTARTS` crece con el tiempo y el intervalo entre reinicios aumenta (backoff exponencial).

## Paso 1 — Confirmar el alcance

```bash
kubectl get pods -n <namespace> -o wide
kubectl get pods -n <namespace> -l app=<label> -w   # observar si TODAS las réplicas o solo algunas
```

¿Es un pod aislado (posible problema de nodo/recursos) o todas las réplicas del Deployment (posible problema de imagen/config/comando)?

## Paso 2 — `describe`, siempre antes que logs

```bash
kubectl describe pod -n <namespace> -l app=<label>
```

Buscar:
- `Last State` → `Reason` (`Error`, `OOMKilled`, `Completed`) y `Exit Code`.
- `Events` → `Back-off restarting failed container`, `Failed to pull image`, `Liveness probe failed`, etc.

El `Reason`/`Exit Code` acota inmediatamente la familia de causa antes de leer una sola línea de log.

## Paso 3 — Logs del contenedor

```bash
kubectl logs -n <namespace> -l app=<label>
kubectl logs -n <namespace> -l app=<label> --previous   # estado del intento anterior
```

`--previous` puede fallar (`unable to retrieve container logs`) si el runtime ya rotó el log del intento anterior — no depender solo de esto en un incidente real; capturar con `-f` o usar un agregador de logs si el crashloop es persistente.

## Paso 4 — Mapear el `Exit Code` / `Reason` a la causa

| Señal | Causa probable | Dónde mirar |
|---|---|---|
| `Exit Code: 1` (o distinto de 0) sin `OOMKilled` | El proceso/script del contenedor termina solo (bug, `exit` explícito, dependencia no disponible) | `command`/`args` del manifiesto, logs de la app |
| `Reason: OOMKilled` | El contenedor excede `resources.limits.memory` | `resources.limits` en el manifiesto vs. consumo real |
| `Failed to pull image` | Imagen inexistente, tag incorrecto, o falta credencial de registry privado | `image:` en el manifiesto, `imagePullSecrets` |
| `Liveness probe failed` en `Events`, contenedor sí arranca | Probe mal configurado (timeout corto, path incorrecto) mata un proceso que iba a estar listo | `livenessProbe` en el manifiesto |
| Exit inmediato, sin logs útiles | Falta un comando/entrypoint válido en la imagen, o config/secret requerido ausente | `command`, `env`, `envFrom`, Secrets/ConfigMaps referenciados |

## Paso 5 — Revisar el manifiesto fuente

`kubectl apply` no valida qué hace el contenedor en runtime — solo que el YAML es sintácticamente válido. Confirmar contra el archivo fuente (no solo contra lo que ya está en el clúster) que `command`/`args`/`env`/`resources` son los esperados.

## Paso 6 — Aplicar el fix y verificar (no dar por cerrado sin esto)

```bash
kubectl apply -f <manifiesto-corregido>.yaml
kubectl rollout status deployment/<nombre> -n <namespace>
kubectl get pods -n <namespace> -o wide
```

Cierre solo cuando: pods en `<N>/<N> Running`, `RESTARTS: 0` desde el último rollout, y (si aplica) el endpoint/health check responde.

## Escalación

Si tras el Paso 4 la causa no es evidente (p. ej. crash intermitente que no reproduce en `describe`/`logs`), capturar:
- YAML completo del recurso (`kubectl get deploy/pod <nombre> -o yaml`)
- Logs de todos los reinicios recientes (`--previous` de cada pod afectado)
- Eventos del namespace (`kubectl get events -n <namespace> --sort-by=.lastTimestamp`)

y escalar con esa evidencia adjunta en vez de reintentar cambios a ciegas.

## Lecciones aplicadas (de incidentes reales de este repo)

- `CrashLoopBackOff` es el síntoma del mecanismo de reinicio, no la causa — la causa siempre está un nivel más abajo.
- `describe` antes que `logs`: el `Exit Code`/`Reason` acota la búsqueda.
- La verdad vive en el estado runtime, no en el resultado del `apply`.
