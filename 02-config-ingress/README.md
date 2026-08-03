# 02 — Configuración, autoescalado e Ingress (Semana 10)

ConfigMap, Secret, HPA por CPU y exposición vía Ingress Controller (nginx) con ruteo por hostname, en el clúster kind `sre-lab`.

## Archivos

| Archivo | Contenido |
|---|---|
| `configmap.yaml` | Config no sensible (`ENTORNO`, `MENSAJE`) |
| `secret.yaml` | Secret genérico — **valor de ejemplo, nunca el real** (base64 = codificado, no cifrado) |
| `deployment-con-recursos.yaml` | Deployment con `resources.requests` (prerrequisito del HPA) y env desde ConfigMap/Secret |
| `hpa.yaml` | HPA: CPU 50%, min 2, max 6 réplicas — escaló a 6 pods con CPU al 153% bajo carga |
| `ingress.yaml` | Regla Ingress: `Host: mi-app.local` → Service `mi-app:80` |
| `INCIDENTE-hpa-unknown.md` | Postmortem: HPA con `TARGETS <unknown>` |
| `INCIDENTE-set-env-silencioso.md` | Postmortem: `kubectl set env` pisando flags en silencio |
| `INCIDENTE-ingress-huerfano.md` | Postmortem: controller 16 días sin reglas + regla apuntando a backend inexistente |

## La cadena completa

```
curl -H "Host: mi-app.local"
   ↓
port-forward 8888 → ingress-nginx-controller (namespace ingress-nginx)
   ↓
Ingress mi-app         <- la REGLA: matchea por hostname (capa 7)
   ↓
Service mi-app (port 80)
   ↓
Pods Flask (targetPort 8080) — balanceado entre réplicas
```

Verificado en el clúster: `kubectl describe ingress mi-app` mostró el backend
resuelto a los endpoints reales de ambos pods:

```
Host           Path  Backends
mi-app.local   /     mi-app:80 (10.244.0.9:8080,10.244.0.10:8080)
```

## Conceptos aplicados

- **Ingress = regla, Controller = ejecutor.** El recurso `Ingress` no hace nada solo; necesita un Ingress Controller (nginx en este caso) que lea las reglas y las aplique. Analogía: escribir la regla de firewall sin tener el firewall instalado. En kind el controller se instala aparte y vive en su propio namespace (`ingress-nginx`).
- **Service vs Ingress**: el Service es una puerta de red por aplicación (capa 4); el Ingress es un reverse proxy compartido que rutea por hostname/ruta (capa 7). Una sola entrada, N servicios detrás — el equivalente cloud-native de un balanceador de aplicación delante de varias granjas de servidores.
- **El Ingress habla con Services, nunca con pods.** Su `backend.service.port.number` apunta al puerto del **Service** (80), no al de la app (8080). La cadena de puertos: Ingress(80) → Service(80) → targetPort(8080).
- **Sync declarativo**: la regla se aplicó antes de que existiera el Service (backend en error). Al crear el Service, el controller re-sincronizó solo y sanó la regla sin re-aplicar nada — el estado deseado ya estaba declarado.

## Prueba con contraste (la evidencia)

```bash
# Terminal 1 — túnel al CONTROLLER (no al Service; -n obligatorio, vive en otro namespace):
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8888:80

# Terminal 2:
# CON el Host que matchea la regla → el Ingress rutea:
curl -H "Host: mi-app.local" http://localhost:8888/health
# → {"status":"ok"}

# SIN Host → el router no tiene regla que aplicar:
curl http://localhost:8888/health
# → 404 Not Found (nginx)
```

**El 404 no es un error del lab — es el lab.** Un port-forward directo al Service respondería `/health` sin importar el Host (túnel de capa 4). Que la misma URL responda distinto según el header `Host` demuestra ruteo de capa 7. En producción el DNS entrega ese Host automáticamente; en el lab se inyecta con `-H` (no hay DNS para `mi-app.local`).

## Instalación del controller (kind)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl get pods -n ingress-nginx   # esperar controller Running 1/1
# Los pods admission-* en Completed son Jobs de configuración: misión única,
# salida limpia (equivalente a Exited (0) en Docker) y auto-limpieza por TTL.
```
