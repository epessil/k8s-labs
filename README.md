# k8s-labs

Laboratorios de Kubernetes de mi plan de transición Infraestructura → SRE.
Manifiestos reales usados en un clúster local **kind** y en **Azure Kubernetes Service (AKS)**, más postmortems de los incidentes que ocurrieron en el camino.

> Regla del proyecto: **"ejecutar sin verificar es no haber terminado"** — cada cambio se confirma con evidencia (`curl`, `kubectl get/describe`, `grep` de variables de entorno).

## Entorno

| Componente | Detalle |
|---|---|
| Clúster local | kind (`sre-lab`), 1 nodo control-plane sobre Docker en WSL |
| Clúster cloud | AKS (Azure), 2 nodos `Standard_D2s_v6`, región `brazilsouth` |
| Aplicación | Flask (Python), puerto 8080, endpoint `/health` |
| Ingress | ingress-nginx (variante kind), ruteo por hostname verificado con contraste 200/404 |
| Registries | Docker Hub (`flacuss74/mi-app`) y Azure Container Registry |
| CI/CD | Pipeline Jenkins declarativo → ver [mi-app-ci](https://github.com/epessil/mi-app-ci) |

## Índice

| Carpeta | Contenido | Origen |
|---|---|---|
| [`01-fundamentos/`](01-fundamentos/) | Deployment, Service ClusterIP, rolling updates, rollback | Semana 9 (kind) |
| [`02-config-ingress/`](02-config-ingress/) | ConfigMap, Secret, HPA, Ingress + **3 postmortems** | Semana 10 (kind) |
| [`03-aks/`](03-aks/) | LoadBalancer con IP pública, ACR attach, escalado de nodos | Semana 12 (AKS) |
| [`04-troubleshooting/`](04-troubleshooting/) | Deployment que crashea a propósito + postmortem y runbook de `CrashLoopBackOff` | kind |

## Postmortems incluidos

Los archivos `INCIDENTE-*.md` documentan fallas reales del laboratorio con formato de postmortem SRE (síntoma → diagnóstico → causa raíz → fix → verificación → lección):

- [`INCIDENTE-hpa-unknown.md`](02-config-ingress/INCIDENTE-hpa-unknown.md) — HPA con `TARGETS <unknown>`: dos causas encadenadas (metrics-server ausente + requests sin declarar)
- [`INCIDENTE-set-env-silencioso.md`](02-config-ingress/INCIDENTE-set-env-silencioso.md) — `kubectl set env` con dos `--from`: el último pisa al anterior sin advertencia
- [`INCIDENTE-ingress-huerfano.md`](02-config-ingress/INCIDENTE-ingress-huerfano.md) — controller 16 días corriendo sin reglas + regla Ingress aceptada apuntando a un Service inexistente

Hilo común de los tres: **Kubernetes acepta configuración con referencias rotas sin error en el `apply`** — la verdad vive en `describe` y en la verificación post-cambio, no en el exit code.

## AI-Assisted SRE Tooling

Claude-powered diagnostics and governance built on top of this lab, from a single-shot API call to an autonomous tool-use agent, plus the Claude Code artifacts (subagent, skill, hook) that keep it operating safely.

| Artifact | Description | Tech |
|---|---|---|
| [`scripts/claude-api/diagnose-pod.ts`](scripts/claude-api/diagnose-pod.ts) | One-shot diagnosis of a single pod: feeds `kubectl describe` output to Claude and returns root cause, evidence, and remediation. | TypeScript, `@anthropic-ai/sdk`, Claude Sonnet |
| [`scripts/claude-api/healthcheck-agent.ts`](scripts/claude-api/healthcheck-agent.ts) (v1) | Periodic cluster healthcheck run via crontab: fixed `kubectl` commands collect cluster state, then a single Claude call produces a Markdown report. | TypeScript, `@anthropic-ai/sdk`, Claude Haiku, crontab |
| [`scripts/claude-api/healthcheck-agent-v2.ts`](scripts/claude-api/healthcheck-agent-v2.ts) | Autonomous healthcheck agent: Claude drives a Tool Use loop (`get_cluster_pods`, `get_pod_logs`, `create_incident`), choosing which tool to call and when, until it decides the healthcheck is complete. | TypeScript, `@anthropic-ai/sdk` Tool Use, Claude Haiku |
| [`.claude/agents/k8s-diagnostician`](.claude/agents/k8s-diagnostician.md) | Read-only diagnostic subagent for kind cluster incidents (`CrashLoopBackOff`, `Pending`, `ImagePullBackOff`); limited to `get`/`describe`/`logs`/`events`, never remediates on its own. | Claude Code subagent (Bash, Read, Grep, Glob) |
| [`.claude/skills/sre-runbook`](.claude/skills/sre-runbook.md) | Generates incident runbooks under `04-troubleshooting/` following the project's mandatory 6-section format (Objetivo/Prerequisitos/Procedimiento/Verificación/Rollback/Escalamiento). | Claude Code skill |
| [`.claude/hooks/check-destructive.sh`](.claude/hooks/check-destructive.sh) | `PreToolUse` safety hook that blocks destructive commands (`kubectl delete/drain/cordon`, `rm -rf`, `pkill`, …) before execution unless explicitly confirmed by the user. | Bash, Claude Code hooks (JSON stdin/stdout) |
| [`CLAUDE.md`](CLAUDE.md) | Repo-level governance: non-negotiable environment rules, coding conventions, runbook format, and git workflow that all agents, subagents, and hooks must follow. | Claude Code project instructions |

## Uso rápido (kind)

```bash
kind create cluster --name sre-lab
kind load docker-image mi-app:2.0 --name sre-lab

# Base: app + service
kubectl apply -f 01-fundamentos/

# Config + HPA + Ingress (requiere ingress-nginx instalado y metrics-server para el HPA)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl apply -f 02-config-ingress/

# Probar el ruteo de capa 7
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8888:80 &
curl -H "Host: mi-app.local" http://localhost:8888/health   # {"status":"ok"}
curl http://localhost:8888/health                            # 404 (sin Host no hay regla que matchee)
```
