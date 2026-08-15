# INCIDENTE-05: metrics-server sin datos por falta de --kubelet-insecure-tls

| Campo | Valor |
|---|---|
| **Fecha** | 15 de agosto de 2026 |
| **Severidad** | Sev3 (sin impacto directo a usuarios finales; degrada observabilidad y HPA) |
| **Detectado por** | `healthcheck-agent-v3.ts` (Claude API, Sonnet, Tool Use + Thinking) |
| **Clúster afectado** | `sre-lab` (kind) |
| **MTTR estimado** | `[POR CONFIRMAR — duración aprox. desde detección hasta `kubectl top nodes` funcionando]` |

---

## 1. Resumen

El agente de healthcheck (`healthcheck-agent-v3.ts`) detectó que `metrics-server` no estaba entregando métricas en el clúster `sre-lab`. La causa raíz fue la ausencia del flag `--kubelet-insecure-tls` en el Deployment de `metrics-server`: por defecto, `metrics-server` valida el certificado TLS del kubelet de cada nodo, y en un clúster `kind` ese certificado es autofirmado y no pasa esa validación — el resultado es un timeout silencioso al intentar scrapear métricas, no un error explícito. Se corrigió agregando el flag vía `kubectl patch`, y se verificó con `kubectl top nodes`.

## 2. Línea de tiempo

| Hora (aprox.) | Evento |
|---|---|
| ~11:00 | `healthcheck-agent-v3.ts` reporta anomalía: `metrics-server` no responde / sin datos de métricas. |
| ~11:0X | Diagnóstico manual: `kubectl describe pod -n kube-system -l k8s-app=metrics-server`, revisión de la sección Events. |
| ~11:0X | Primer patch aplicado: `kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'` |
| ~11:0X | `[POR CONFIRMAR]` — ver sección 4, hipótesis A/B sobre el segundo patch. |
| ~11:0X | Segundo patch aplicado (idéntico al primero). |
| ~11:0X | `kubectl get pods -n kube-system -l k8s-app=metrics-server` confirma pod Running. |
| ~11:0X | Verificación final: `kubectl top nodes` devuelve datos. Incidente cerrado. |

## 3. Impacto

- `kubectl top nodes` / `kubectl top pods` sin datos durante la ventana del incidente.
- El HPA del laboratorio depende de `metrics-server` para calcular el uso de CPU contra `resources.requests`: mientras `metrics-server` estuvo caído, cualquier HPA activo habría mostrado `TARGETS <unknown>` y no habría podido escalar (mismo síntoma que el incidente #3 documentado en el glosario, sección 6).
- Sin impacto en `mi-app` ni en el tráfico servido: el Deployment, el Service y el Ingress siguieron respondiendo con normalidad. El impacto fue puramente de observabilidad/autoescalado.

## 4. Causa raíz

`metrics-server` se conecta al Kubelet de cada nodo para leer sus métricas de CPU/memoria. Esa conexión es HTTPS, y por defecto `metrics-server` valida el certificado del Kubelet contra una CA reconocida. En un clúster `kind`, el certificado del Kubelet es autofirmado (no hay una CA corporativa detrás, a diferencia de un clúster gestionado como AKS/EKS) — la validación falla, la conexión no se establece, y el pod de `metrics-server` queda técnicamente Running pero sin poder reportar datos.

El flag `--kubelet-insecure-tls` le indica a `metrics-server` que omita esa validación de certificado — aceptable en un laboratorio local, **no** en un clúster productivo con nodos reales expuestos.

**Confirmado:** el historial de bash muestra el mismo patch aplicado dos veces (líneas 959 y 1027). 
La causa es que entre ambos se ejecutó un `kind delete cluster` con reconstrucción completa del 
ambiente (semanas 1 a 14 del roadmap SRE). El patch de la línea 959 se aplicó sobre el clúster 
original y se perdió con su eliminación; al recrear el ambiente, `metrics-server` volvió a 
desplegarse desde el `components.yaml` upstream — sin el flag — y hubo que reaplicarlo (línea 1027).

Esto no es un fallo del fix, sino de su persistencia: `kubectl patch` modifica el estado vivo del 
clúster, no el manifest versionado. Todo fix aplicado de forma imperativa desaparece en la siguiente 
reconstrucción del ambiente.

## 5. Qué funcionó / qué no funcionó

**Funcionó:**
- El healthcheck automatizado (`healthcheck-agent-v3.ts`) detectó el problema sin intervención manual — validación en vivo de que el agente con Tool Use + Thinking cumple su propósito de monitoreo proactivo.
- El diagnóstico por capas (Events del pod → causa en la config del Deployment) llevó directo a la causa raíz sin necesidad de revisar logs de aplicación.
- La verificación de cierre (`kubectl top nodes` con datos reales) siguió la regla de oro del proyecto: "ejecutar sin verificar es no haber terminado".

**No funcionó / a mejorar:**
- El fix se aplicó como `kubectl patch` imperativo, sin persistirlo en un manifest versionado — si la hipótesis B es correcta, esto significa que el fix no sobrevive a una recreación del clúster y el incidente puede repetirse indefinidamente.
- No hay un check explícito de "¿tiene `metrics-server` el flag `--kubelet-insecure-tls`?" antes de dar por buena una recreación del clúster kind — se descubre reactivamente, cuando el HPA o el healthcheck ya fallaron.

## 6. Acciones correctivas

| Acción | Dueño | Fecha objetivo |
|---|---|---|
| Persistir el flag `--kubelet-insecure-tls` en un manifest versionado dentro del repo (copia local de `components.yaml` con el arg incluido, o patch de kustomize aplicado tras el `apply`), eliminando la dependencia del `kubectl patch` manual | Erick | `[definir]` |
| Crear/actualizar un runbook de bootstrap del clúster kind que consolide TODOS los pasos post-rebuild conocidos: metrics-server + patch TLS, `docker network connect kind jenkins`, `kind get kubeconfig --internal`. Hoy están dispersos entre postmortems distintos y se redescubren por falla | Erick | `[definir]` |
| Agregar verificación de `metrics-server` (Running + `kubectl top nodes` con datos) al checklist de validación post-rebuild, para detectarlo antes que el HPA o el healthcheck agent | Erick | `[definir]` |

---

*Detectado y diagnosticado con apoyo de `healthcheck-agent-v3.ts` (Claude Sonnet, Tool Use + Thinking). Postmortem #5 del repo `k8s-labs`.*
