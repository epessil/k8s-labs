# Incidente: Jenkins sin red al clúster + Deployment mal referenciado + CrashLoopBackOff por puerto

**Fecha:** 10 de agosto de 2026
**Componente:** Conectividad Jenkins ↔ kind, etapa `Deploy to Kubernetes` del Jenkinsfile
**Severidad:** Laboratorio — bloqueó el CD hasta resolverse en cadena

## Síntoma

Tres fallos secuenciales al intentar que Jenkins desplegara automáticamente a Kubernetes:

1. `kubectl` ejecutado dentro del contenedor de Jenkins no lograba listar nodos del clúster `sre-lab`.
2. Ya con conectividad resuelta, el pipeline fallaba con `Error from server (NotFound): deployments.apps "mi-app-deployment" not found`.
3. Al crear ese Deployment manualmente por error (en vez de corregir el nombre) y luego probar un rollback con un tag antiguo de la imagen, el pod nuevo entró en `CrashLoopBackOff` con 11 reinicios.

## Diagnóstico

**Fallo 1 — sin red:**
```bash
docker network ls
docker inspect jenkins --format '{{json .NetworkSettings.Networks}}'
```
`kind` crea su propia red Docker (`kind`) al levantar el clúster. Jenkins estaba únicamente en la red `bridge` por defecto — dos redes Docker aisladas en el mismo host.

**Fallo 2 — nombre incorrecto:**
```bash
kubectl get deployments
```
El Deployment real y sano (2/2, corriendo hace 7 días) se llamaba `mi-app`, no `mi-app-deployment` como asumía el Jenkinsfile.

**Fallo 3 — CrashLoopBackOff:**
```bash
kubectl logs <pod> --previous
kubectl describe pod <pod>
```
El log mostró la app sirviendo en `http://10.244.0.11:5000`, mientras el Events del `describe` mostraba las liveness/readiness probes fallando contra el puerto `8080` con `connection refused`. La imagen usada en la prueba manual (`1.0`) era una versión vieja que aún hablaba en el puerto 5000; el Deployment `mi-app` ya estaba configurado para el estándar más nuevo (8080).

## Causa raíz

- **Fallo 1:** redes Docker aisladas por defecto — dos contenedores en el mismo host físico no se ven entre sí sin compartir explícitamente una red. Además, el kubeconfig generado con el flujo estándar usa `127.0.0.1:<puerto-mapeado>`, válido solo desde el host — no desde otro contenedor, donde `127.0.0.1` se refiere a sí mismo.
- **Fallo 2:** el nombre del Deployment en el Jenkinsfile se escribió por convención, sin confirmarlo contra `kubectl get deployments`.
- **Fallo 3:** desajuste de contrato entre versiones de la misma imagen — una imagen vieja (puerto 5000) desplegada sobre una configuración de Deployment ya migrada a un estándar nuevo (puerto 8080). No fue un bug de Kubernetes ni de la app: cada una cumplía su propia especificación, pero eran especificaciones distintas.

## Fix

**Fallo 1 — conectar las redes y generar un kubeconfig portable:**
```bash
docker network connect kind jenkins
docker exec -it -u root jenkins bash
apt update && apt install -y curl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
exit

kind get kubeconfig --name sre-lab --internal > kubeconfig-jenkins.yaml
docker exec -u root jenkins mkdir -p /var/jenkins_home/.kube
docker cp kubeconfig-jenkins.yaml jenkins:/var/jenkins_home/.kube/config
docker exec -u root jenkins chown -R jenkins:jenkins /var/jenkins_home/.kube
```

**Fallo 2 — corregir el nombre en el Jenkinsfile:**
```groovy
DEPLOYMENT_NAME = "mi-app"
CONTAINER_NAME  = "mi-app"
```
(el Deployment duplicado creado por error, `mi-app-deployment`, se eliminó con `kubectl delete deployment/service mi-app-deployment`).

**Fallo 3 — desplegar una versión de la imagen con el puerto correcto**, no intentar "arreglar" la vieja:
```bash
kubectl set image deployment/mi-app mi-app=flacuss74/mi-app:2.4
kubectl rollout status deployment/mi-app
```

## Verificación

- `docker exec jenkins kubectl get nodes` → `sre-lab-control-plane Ready`, ejecutado desde dentro de Jenkins.
- `kubectl rollout status deployment/mi-app` → `successfully rolled out`, con 0 `RESTARTS` en los pods nuevos.
- `kubectl logs -l app=mi-app --tail=20` mostrando `GET /health HTTP/1.1" 200` en bucle limpio — confirmando que las probes ya alcanzan el puerto correcto.
- Pipeline completo (`mi-app-ci` build #7) en verde, con `kubectl describe deployment mi-app | grep Image` mostrando el tag generado por el propio build (`flacuss74/mi-app:7`), no un tag suelto de prueba manual.

## Lección

Un kubeconfig no es portable entre contenedores sin ajustar — `127.0.0.1` significa algo distinto según desde dónde se ejecute, y `kind get kubeconfig --internal` existe justamente para ese caso. Además, un `kubectl rollout status` puede reportar éxito engañosamente si el Deployment ya estaba sano de antes (el comando confirma el estado actual, no necesariamente que *tu* cambio se haya aplicado) — verificar con `describe deployment | grep Image` es más confiable que confiar en el mensaje de la operación anterior. Por último: nunca se "repara" una imagen vieja para que calce con una configuración nueva — se despliega una versión que ya cumpla el contrato vigente, y el pipeline automático (que construye desde el código actual) es justamente lo que previene este problema hacia adelante.
