# Runbook: `ImagePullBackOff`

**Autor:** Erick Diaz
**Fecha:** 2026-08-04
**Ambiente objetivo:** kind (`sre-lab`, namespace `lab-sre`) — procedimiento también aplicable a AKS sin modificaciones (mismo mecanismo de `kubelet`/CRI, cambia solo cómo se gestionan los `imagePullSecrets`).

## 1. Objetivo

Diagnosticar y resolver un pod que no logra arrancar por fallo al descargar su imagen de contenedor (`ImagePullBackOff` / `ErrImagePull`), identificando la causa raíz exacta antes de aplicar un fix, sin asumir "es un typo" sin evidencia.

Aplica cuando:

- `kubectl get pods` muestra uno o más pods en estado `ImagePullBackOff` o `ErrImagePull`.
- El pod nunca llega a `Running`; no hay contenedor iniciado, por lo tanto `kubectl logs` no tiene nada que mostrar.

## 2. Prerequisitos

- Acceso `kubectl` con permisos de lectura sobre el namespace afectado (`get`, `describe`, `logs`, `events`).
- Para aplicar el fix: permisos de `apply`/`edit` sobre el `Deployment`/`Pod` en cuestión.
- Si la causa es un registry privado: credenciales válidas del registry (usuario/token o `docker login` funcional) para reconstruir el `imagePullSecret`.
- No requiere ventana de mantención en lab; en `prod`/AKS, confirmar si el `Deployment` afectado es crítico antes de tocarlo fuera de horario acordado.

## 3. Procedimiento

### Paso 1 — Confirmar el alcance

```bash
kubectl get pods -n <namespace> -o wide
```

Output esperado (ejemplo):

```
NAME                          READY   STATUS             RESTARTS   AGE
crash-demo-6f8d9c7b4c-2xk9p   0/1     ImagePullBackOff   0          2m
```

`RESTARTS` en `0` y `READY 0/1` es la firma típica: a diferencia de `CrashLoopBackOff`, el contenedor nunca arrancó, así que no hay reinicios que contar.

### Paso 2 — `describe`, siempre antes de asumir la causa

```bash
kubectl describe pod -n <namespace> <nombre-pod>
```

Buscar en la sección `Events` (no en `Status`, que solo dice `ImagePullBackOff`):

```
Events:
  Type     Reason     Age                From               Message
  ----     ------     ----               ----               -------
  Normal   Scheduled  3m                 default-scheduler  Successfully assigned lab-sre/crash-demo-... to sre-lab-control-plane
  Normal   Pulling    2m (x4 over 3m)    kubelet            Pulling image "flacuss74/mi-app:2.9"
  Warning  Failed     2m (x4 over 3m)    kubelet            Failed to pull image "flacuss74/mi-app:2.9": rpc error: code = NotFound desc = failed to pull and unpack image: ... manifest unknown
  Warning  Failed     2m (x4 over 3m)    kubelet            Error: ErrImagePull
  Warning  BackOff    1m (x8 over 3m)    kubelet            Back-off pulling image "flacuss74/mi-app:2.9"
  Warning  Failed     1m (x8 over 3m)    kubelet            Error: ImagePullBackOff
```

El mensaje bajo el primer `Failed` es la evidencia real de la causa — todo lo que sigue (`BackOff`, `ImagePullBackOff`) es el mecanismo de reintento, no la causa.

### Paso 3 — Mapear el mensaje de `Events` a la causa

| Mensaje en `Events` | Causa probable | Dónde mirar |
|---|---|---|
| `manifest unknown` / `not found` | El tag no existe en el registry (typo, tag nunca publicado, o borrado) | `image:` en el manifiesto vs. tags reales del registry |
| `unauthorized` / `authentication required` | Registry privado sin `imagePullSecrets`, o credencial vencida/incorrecta | `spec.imagePullSecrets` del Pod/ServiceAccount, vigencia del token |
| `429 Too Many Requests` / `toomanyrequests` | Rate limit de Docker Hub (anónimo o cuenta free) | Si el pull es anónimo, autenticarse; revisar volumen de pulls del nodo |
| `no such host` / `dial tcp ... i/o timeout` | El nodo no resuelve o no alcanza el registry (DNS o red) | Egress del nodo, NetworkPolicy, DNS del clúster |
| `image operating system "linux" cannot be used on this platform` (o similar de arquitectura) | Imagen construida para otra arquitectura (ej. `arm64` vs `amd64`) | Cómo se construyó/publicó la imagen, `--platform` del build |

### Paso 4 — Confirmar el nombre y tag exactos contra el manifiesto fuente

```bash
grep -n "image:" <manifiesto>.yaml
```

`kubectl apply` no valida que la imagen exista — solo que el YAML es sintácticamente correcto. El typo puede estar en el archivo fuente, no en lo que ya quedó aplicado en el clúster.

Si se sospecha typo o tag inexistente, confirmar contra el registry desde fuera del clúster:

```bash
docker pull <imagen>:<tag>
```

Output esperado si el problema es el tag:

```
Error response from daemon: manifest for <imagen>:<tag> not found: manifest unknown
```

### Paso 5 — Si la causa es autenticación, verificar el `imagePullSecret`

```bash
kubectl get sa <service-account> -n <namespace> -o jsonpath='{.imagePullSecrets}'
kubectl get secret <nombre-secret> -n <namespace> -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d
```

Confirmar que el secret referenciado existe en el **mismo namespace** que el Pod (un `imagePullSecret` de otro namespace no aplica) y que el JSON decodificado tiene el `auth` correcto para el registry en cuestión.

### Paso 6 — Aplicar el fix y verificar

```bash
kubectl apply -f <manifiesto-corregido>.yaml
kubectl rollout status deployment/<nombre> -n <namespace>
kubectl get pods -n <namespace> -o wide
```

Output esperado tras el fix:

```
deployment "crash-demo" successfully rolled out
NAME                          READY   STATUS    RESTARTS   AGE
crash-demo-7d5f8b9c6d-4mnqz   1/1     Running   0          30s
```

## 4. Verificación

Cerrar el incidente solo cuando se cumplan **todas**:

- `kubectl get pods -n <namespace>` muestra `<N>/<N> Running` para todas las réplicas del Deployment afectado.
- `kubectl describe pod` ya no muestra eventos `Failed`/`BackOff` recientes en la sección `Events`.
- Si el fix fue una imagen nueva: `kubectl get pod <nombre> -o jsonpath='{.spec.containers[0].image}'` coincide exactamente con el tag esperado (evita cerrar con un tag `:latest` que enmascara el problema en vez de resolverlo).

## 5. Rollback

Si el fix aplicado no resuelve el problema o introduce uno nuevo (ej. el tag "corregido" tampoco existe):

```bash
kubectl rollout undo deployment/<nombre> -n <namespace>
kubectl rollout status deployment/<nombre> -n <namespace>
```

> ⚠️ `rollout undo` vuelve a la revisión anterior del Deployment. Si esa revisión previa **también** apuntaba a una imagen defectuosa (ej. el incidente empezó porque el pipeline CI publicó dos tags malos seguidos), esto no resuelve nada — confirmar con `kubectl rollout history deployment/<nombre> -n <namespace>` cuál revisión es realmente la última sana antes de decidir el rollback.

Si se modificó un `imagePullSecret` existente y el cambio causó una regresión adicional:

> ⚠️ Antes de borrar o sobreescribir un `imagePullSecret` en uso, confirmar que ningún otro Deployment/CronJob del namespace depende de él (`kubectl get pods -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.imagePullSecrets}{"\n"}{end}'`). Borrarlo a ciegas puede convertir un incidente de un Deployment en uno de todo el namespace.

## 6. Escalamiento

Escalar si tras el Paso 3 el mensaje de `Events` no encaja en ninguna causa conocida, o si la causa identificada requiere acceso que no se tiene (ej. credenciales de un registry gestionado por otro equipo, o firewall/egress de red gestionado por el equipo de plataforma).

Antes de escalar, capturar y adjuntar:

- `kubectl describe pod -n <namespace> <nombre-pod>` completo (sección `Events` íntegra).
- `kubectl get pod <nombre-pod> -n <namespace> -o yaml` (para confirmar `image`, `imagePullSecrets`, `serviceAccount` reales en el clúster).
- Resultado de `docker pull <imagen>:<tag>` ejecutado fuera del clúster, si fue posible.
- Nombre exacto del registry y namespace/proyecto donde debería vivir la imagen.

Contactar:

- **Imagen no existe / pipeline CI no la publicó:** equipo dueño del pipeline de build/CI de esa imagen.
- **Falla de autenticación contra registry privado / ACR:** equipo de plataforma o quien administra las credenciales del registry.
- **Rate limit o falla de red/DNS hacia el registry:** equipo de red/plataforma (en AKS, revisar egress y reglas de NSG/firewall del clúster).

## Lecciones aplicadas

- `ImagePullBackOff` es el mecanismo de reintento, no la causa — la causa real está en el primer evento `Failed` de `describe`, antes de que aparezca `BackOff`.
- A diferencia de `CrashLoopBackOff`, acá nunca hubo contenedor corriendo: `kubectl logs` no aporta nada, todo el diagnóstico vive en `Events`.
- `kubectl apply` no valida que la imagen exista en el registry — la validación real ocurre recién cuando el `kubelet` intenta el pull.
