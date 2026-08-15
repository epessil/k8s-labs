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

**`[POR CONFIRMAR]`** — el historial de bash muestra el mismo patch aplicado dos veces (líneas 959 y 1027), con un `describe pod` de por medio revisando Events. Marca cuál corresponde:

- [ ] **Hipótesis A**: el primer patch se aplicó correctamente pero el pod tardó en reiniciar / el rollout no había completado aún cuando se revisó; el segundo patch fue redundante (no hizo nada nuevo, el problema ya se estaba resolviendo solo).
- [ ] **Hipótesis B**: el clúster `kind` fue recreado entre el primer y el segundo patch (o el pod de `metrics-server` fue reprogramado desde el manifest original sin el flag), por lo que el fix del primer patch se perdió y hubo que reaplicarlo. **Esta es la hipótesis más relevante para las acciones correctivas** — ver sección 6.

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
| Persistir el flag `--kubelet-insecure-tls` en un manifest versionado (patch de kustomize o YAML propio aplicado tras el `kubectl apply` de `components.yaml`), en vez de depender de un `kubectl patch` manual post-hoc | Erick | `[definir]` |
| (Si aplica hipótesis B) Documentar en el runbook de bootstrap del clúster kind el paso "aplicar metrics-server + patch de TLS" como parte del checklist estándar de reconstrucción, junto a los pasos ya conocidos de reconexión de Jenkins (`docker network connect kind jenkins`, `kind get kubeconfig --internal`) | Erick | `[definir]` |
| Agregar un check de `metrics-server` (Running + con datos) al script de verificación post-rebuild del clúster, para detectar esto antes de que lo note el HPA o el healthcheck agent | Erick | `[definir]` |

---

*Detectado y diagnosticado con apoyo de `healthcheck-agent-v3.ts` (Claude Sonnet, Tool Use + Thinking). Postmortem #5 del repo `k8s-labs`.*
