# Postmortem: CrashLoopBackOff en `crash-demo` (namespace `lab-sre`)

**Entorno:** clúster kind local (`sre-lab`) · **Severidad:** lab / demo de troubleshooting · **Estado:** resuelto y verificado

## Resumen

El Deployment `crash-demo` (namespace `lab-sre`, 2 réplicas) entró en `CrashLoopBackOff` inmediatamente después de aplicarse. Ningún pod llegaba a `Ready`. La causa no era un error de configuración de Kubernetes sino el propio contenedor terminando con `exit 1` a los pocos segundos de arrancar.

## Línea de tiempo

1. `kubectl get pods -n lab-sre` → ambos pods de `crash-demo` en `CrashLoopBackOff`, con `RESTARTS` creciendo cada pocos minutos (backoff exponencial visible en el intervalo entre reinicios).
2. `kubectl describe pod -n lab-sre -l app=crash-demo` → `State: Terminated`, `Reason: Error`, `Exit Code: 1`. El campo `Last State` mostraba el mismo patrón en el ciclo anterior — confirmación de que no fue un evento aislado.
3. `kubectl logs -n lab-sre -l app=crash-demo` → cada contenedor imprimía:
   ```
   Iniciando pod <hostname>...
   ERROR: falla critica simulada - saliendo con codigo 1
   ```
4. `kubectl logs --previous` en uno de los pods no devolvió datos (`unable to retrieve container logs`) — el container runtime ya había rotado ese log; en un incidente real esto es una razón más para capturar logs con `kubectl logs -f` o un backend de logging antes de que el pod se reinicie de nuevo, no solo confiar en `--previous`.
5. Revisado el manifiesto fuente (`crash-lab.yaml`): el `command`/`args` del contenedor hacía `sleep 5` y luego `exit 1` de forma explícita.

## Causa raíz

El contenedor terminaba con código de salida 1 por diseño del propio comando (`exit 1` al final del script embebido en `args`). Con `restartPolicy: Always` (el default de un Deployment), kubelet reinicia cualquier contenedor que termina, sin importar el motivo. Tras reinicios sucesivos y fallidos, Kubernetes aplica **backoff exponencial** entre reintentos y marca el pod como `CrashLoopBackOff` — que no es un estado de error nuevo, es una señal de "sigo reintentando, pero cada vez espero más".

Punto clave: `kubectl apply` no valida el contenido del script que corre dentro del contenedor. El recurso se crea sin ningún error visible en el momento del `apply` — el fallo solo aparece en runtime, en `describe` y en los logs.

## Resolución

```bash
# 1. Confirmar el exit code y el mensaje de error real (no asumir)
kubectl describe pod -n lab-sre -l app=crash-demo | grep -A3 "Last State"
kubectl logs -n lab-sre -l app=crash-demo

# 2. Corregir el comando del contenedor: quitar el exit 1 y dejarlo vivo
#    (04-troubleshooting/crash-lab.yaml, bloque args del container crash-demo)
#    sleep 5 && echo "OK..." && sleep infinity   <- en vez de exit 1

# 3. Aplicar el fix
kubectl apply -f 04-troubleshooting/crash-lab.yaml

# 4. Verificar — un cambio sin verificación no está terminado
kubectl rollout status deployment/crash-demo -n lab-sre
kubectl get pods -n lab-sre -o wide
```

Resultado verificado: ambos pods pasaron a `1/1 Running` con `RESTARTS: 0` tras el rollout.

## Lecciones

- **`CrashLoopBackOff` no es la causa, es el síntoma del mecanismo de reinicio.** La causa real siempre está un nivel más abajo: el exit code y los logs del contenedor.
- **`describe` primero, siempre.** El campo `Last State` con `Reason`/`Exit Code` da la pista más directa; los logs confirman el porqué.
- **`--previous` puede fallar si el runtime ya rotó el log del contenedor anterior.** No depender solo de eso para reconstruir la línea de tiempo de un CrashLoop — capturar logs en el momento (`-f`) o tener un agregador de logs es más confiable en un incidente real.
- **`kubectl apply` no ejecuta ni valida lo que el contenedor hace en su arranque.** El "éxito" del `apply` solo dice que el manifiesto es sintácticamente válido y fue aceptado por la API — no que el workload vaya a funcionar. Mismo hilo común que los otros postmortems de este repo: la verdad vive en el estado runtime, no en el exit code del comando que lo creó.
