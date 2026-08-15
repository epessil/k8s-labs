# k8s-labs

Kubernetes labs from my Infrastructure → SRE transition plan.
Real manifests used on a local **kind** cluster and on **Azure Kubernetes Service (AKS)**, plus postmortems of the incidents that happened along the way.

> Project rule: **"ejecutar sin verificar es no haber terminado"** ("running it without verifying is not being done") — every change is confirmed with evidence (`curl`, `kubectl get/describe`, `grep` of environment variables).

## Environment

| Component | Detail |
|---|---|
| Local cluster | kind (`sre-lab`), 1 control-plane node on Docker in WSL |
| Cloud cluster | AKS (Azure), 2 `Standard_D2s_v6` nodes, `brazilsouth` region |
| Application | Flask (Python), port 8080, `/health` endpoint |
| Ingress | ingress-nginx (kind variant), hostname-based routing verified via 200/404 contrast |
| Registries | Docker Hub (`flacuss74/mi-app`) and Azure Container Registry |
| CI/CD | Declarative Jenkins pipeline → see [mi-app-ci](https://github.com/epessil/mi-app-ci) |

## Index

| Folder | Content | Origin |
|---|---|---|
| [`01-fundamentos/`](01-fundamentos/) | Deployment, ClusterIP Service, rolling updates, rollback | Week 9 (kind) |
| [`02-config-ingress/`](02-config-ingress/) | ConfigMap, Secret, HPA, Ingress + **3 postmortems** | Week 10 (kind) |
| [`03-aks/`](03-aks/) | LoadBalancer with public IP, ACR attach, node scaling | Week 12 (AKS) |
| [`04-troubleshooting/`](04-troubleshooting/) | Deployment that crashes on purpose + postmortem and `CrashLoopBackOff` runbook | kind |
| [`05-cicd-jenkins-webhook-deploy/`](05-cicd-jenkins-webhook-deploy/) | End-to-end CD: GitHub webhook → Jenkins → build/test/push → automatic deploy to Kubernetes with rollout verification + **3 postmortems** covering 7 chained incidents | Weeks 13–14 (kind + Jenkins) |
| [`06-observability-healthcheck-agent/`](06-observability-healthcheck-agent/) | Observability & healthcheck agents (v1 crontab → v2 Tool Use → v3 Thinking) + **postmortem** on metrics-server TLS in kind | Weeks 10–15 (kind) |

## Included postmortems

The `INCIDENTE-*.md` files document real lab failures using an SRE postmortem format (symptom → diagnosis → root cause → fix → verification → lesson):

- [`INCIDENTE-hpa-unknown.md`](02-config-ingress/INCIDENTE-hpa-unknown.md) — HPA with `TARGETS <unknown>`: two chained causes (missing metrics-server + undeclared requests)
- [`INCIDENTE-set-env-silencioso.md`](02-config-ingress/INCIDENTE-set-env-silencioso.md) — `kubectl set env` with two `--from` flags: the last one silently overwrites the previous one
- [`INCIDENTE-ingress-huerfano.md`](02-config-ingress/INCIDENTE-ingress-huerfano.md) — controller running for 16 days with no rules + an accepted Ingress rule pointing to a nonexistent Service
- [`INCIDENTE-webhook-github-jenkins.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-webhook-github-jenkins.md) — GitHub webhook rejected with 403 "No valid crumb", then timing out: CSRF proxy compatibility + wrong payload URL path
- [`INCIDENTE-jenkins-arranque-y-credenciales.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-jenkins-arranque-y-credenciales.md) — Jenkins down after a WSL restart, lost admin credential recovered via Groovy script in init.groovy.d, and a credential-ID mismatch breaking the pipeline
- [`INCIDENTE-red-nombre-puerto-deploy.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-red-nombre-puerto-deploy.md) — Jenkins blind to the kind cluster (isolated Docker networks → internal kubeconfig), a misreferenced Deployment, and a 5000-vs-8080 port mismatch causing CrashLoopBackOff
- [`INCIDENTE-05-metrics-server-kubelet-tls.md`](06-observability-healthcheck-agent/INCIDENTE-05-metrics-server-kubelet-tls.md) — metrics-server on kind cannot validate the kubelet's self-signed cert: `--kubelet-insecure-tls` required locally (not on AKS/EKS), leaving `kubectl top` empty and HPA at `TARGETS <unknown>`

Common thread across all three: **Kubernetes accepts configuration with broken references without erroring on `apply`** — the truth lives in `describe` and in post-change verification, not in the exit code.

The `05` series documents 7 chained incidents from a single CD implementation — each fix revealed the next failure. Closing evidence: build #7 green, triggered by `Started by GitHub push`, with the resulting image verified running in the cluster.

## AI-Assisted SRE Tooling

Claude-powered diagnostics and governance built on top of this lab, from a single-shot API call to an autonomous tool-use agent, plus the Claude Code artifacts (subagent, skill, hook) that keep it operating safely.

| Artifact | Description | Tech |
|---|---|---|
| [`scripts/claude-api/diagnose-pod.ts`](scripts/claude-api/diagnose-pod.ts) | One-shot diagnosis of a single pod: feeds `kubectl describe` output to Claude and returns root cause, evidence, and remediation. | TypeScript, `@anthropic-ai/sdk`, Claude Sonnet |
| [`scripts/claude-api/healthcheck-agent.ts`](scripts/claude-api/healthcheck-agent.ts) (v1) | Periodic cluster healthcheck run via crontab: fixed `kubectl` commands collect cluster state, then a single Claude call produces a Markdown report. | TypeScript, `@anthropic-ai/sdk`, Claude Haiku, crontab |
| [`scripts/claude-api/healthcheck-agent-v2.ts`](scripts/claude-api/healthcheck-agent-v2.ts) | Autonomous healthcheck agent: Claude drives a Tool Use loop (`get_cluster_pods`, `get_pod_logs`, `create_incident`), choosing which tool to call and when, until it decides the healthcheck is complete. | TypeScript, `@anthropic-ai/sdk` Tool Use, Claude Haiku |
| [`scripts/claude-api/healthcheck-agent-v3.ts`](scripts/claude-api/healthcheck-agent-v3.ts) | Same Tool Use agent loop as v2, with extended thinking enabled (budget 8000 tokens) so Claude reasons before deciding which tool to invoke. | TypeScript, `@anthropic-ai/sdk` Tool Use + Thinking, Claude Sonnet |
| [`.claude/agents/k8s-diagnostician`](.claude/agents/k8s-diagnostician.md) | Read-only diagnostic subagent for kind cluster incidents (`CrashLoopBackOff`, `Pending`, `ImagePullBackOff`); limited to `get`/`describe`/`logs`/`events`, never remediates on its own. | Claude Code subagent (Bash, Read, Grep, Glob) |
| [`.claude/skills/sre-runbook`](.claude/skills/sre-runbook.md) | Generates incident runbooks under `04-troubleshooting/` following the project's mandatory 6-section format (Objetivo/Prerequisitos/Procedimiento/Verificación/Rollback/Escalamiento). | Claude Code skill |
| [`.claude/hooks/check-destructive.sh`](.claude/hooks/check-destructive.sh) | `PreToolUse` safety hook that blocks destructive commands (`kubectl delete/drain/cordon`, `rm -rf`, `pkill`, …) before execution unless explicitly confirmed by the user. | Bash, Claude Code hooks (JSON stdin/stdout) |
| [`CLAUDE.md`](CLAUDE.md) | Repo-level governance: non-negotiable environment rules, coding conventions, runbook format, and git workflow that all agents, subagents, and hooks must follow. | Claude Code project instructions |

## Quick start (kind)

```bash
kind create cluster --name sre-lab
kind load docker-image mi-app:2.0 --name sre-lab

# Base: app + service
kubectl apply -f 01-fundamentos/

# Config + HPA + Ingress (requires ingress-nginx installed and metrics-server for the HPA)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl apply -f 02-config-ingress/

# Test layer 7 routing
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 8888:80 &
curl -H "Host: mi-app.local" http://localhost:8888/health   # {"status":"ok"}
curl http://localhost:8888/health                            # 404 (no Host means no rule matches)
```
