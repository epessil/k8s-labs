# 01 — Fundamentos: Deployment + Service

Despliegue base de la app Flask en el clúster kind: 2 réplicas gestionadas por un Deployment y un Service ClusterIP como puerta de red estable.

## Archivos

| Archivo | Recurso |
|---|---|
| `deployment.yaml` | Deployment `mi-app`, 2 réplicas, imagen `mi-app:2.0` |
| `service.yaml` | Service ClusterIP, puerto 80 → targetPort 8080 |

## Conceptos aplicados

- **Reconciliation loop**: borrar un pod es inútil, el Deployment lo revive. La limpieza apunta al padre (`kubectl delete deployment`), la cascada hace el resto.
- **Puertos**: `port` del Service es libre elección (80); `targetPort` es donde escucha la app (8080) — se descubre, no se inventa.
- **ClusterIP**: IP virtual con significado solo dentro del clúster (reglas iptables). Desde el host la ruta no existe — no es un firewall, es que no hay camino. Análogo a un port group aislado sin uplink en vSphere. El puente es `kubectl port-forward`.
- **Rolling update**: `kubectl set image` crea un ReplicaSet nuevo; nacen los pods nuevos primero, mueren los viejos después — cero downtime, observado con `kubectl get pods -w`.
- **Rollback vs roll forward**: `kubectl rollout undo` solo exige que ayer funcionara; roll forward exige conocer la imagen buena. A las 3 AM, undo primero, entender después.

## Despliegue y verificación

```bash
kubectl apply -f deployment.yaml -f service.yaml
kubectl get pods -o wide
kubectl port-forward service/mi-app 8888:80 &
curl http://localhost:8888/health
```
