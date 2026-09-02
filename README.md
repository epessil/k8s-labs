# k8s-labs

A working SRE lab, not a tutorial follow-along: real manifests deployed to a local **kind** cluster and to **Azure Kubernetes Service (AKS)**, a working GitHub → Jenkins → Kubernetes CD pipeline, a multi-vCenter **VMware vSphere** access-audit automation, AI-assisted diagnostic tooling, and 8 postmortems of the incidents that happened along the way — written the way production incidents actually get closed: with evidence, not assumptions.

> Project rule: **"ejecutar sin verificar es no haber terminado"** ("running it without verifying is not being done") — every change is confirmed with evidence (`curl`, `kubectl get/describe`, `grep` of environment variables).

## What this demonstrates

- **Incident diagnosis under ambiguity** — 8 postmortems (symptom → diagnosis → root cause → fix → verification → lesson), including a 7-incident chain across a single CD build-out where each fix exposed the next failure.
- **Operating across environments, not just one cluster** — the same workload deployed to a local kind cluster, migrated to AKS (real nodes, real cloud LoadBalancer, real cost), and a separate PowerCLI automation auditing access across 21 production vCenters spanning multiple AD domains.
- **Automation with guardrails, not just automation** — a `PreToolUse` hook blocks destructive `kubectl`/`docker`/`rm` commands before execution; the vSphere audit script is read-only by design against production.
- **Documentation as a deliverable, not an afterthought** — every runbook follows the same mandatory 6-section format (Objetivo/Prerequisitos/Procedimiento/Verificación/Rollback/Escalamiento), enforced by a Claude Code skill so the standard can't drift.
- **AI-assisted operations, built and governed, not just consumed** — diagnostic agents progressing from a single API call to an autonomous tool-use loop with extended thinking, plus the Claude Code subagent/skills/hook that keep that tooling safe, all packaged as an installable plugin.

## Environment

| Component | Detail |
|---|---|
| Local cluster | kind (`sre-lab`), 1 control-plane node on Docker in WSL |
| Cloud cluster | AKS (Azure), 2 `Standard_D2s_v6` nodes, `brazilsouth` region |
| Application | Flask (Python), port 8080, `/health` endpoint |
| Ingress | ingress-nginx (kind variant), hostname-based routing verified via 200/404 contrast |
| Registries | Docker Hub (`flacuss74/mi-app`) and Azure Container Registry |
| CI/CD | Declarative Jenkins pipeline → see [mi-app-ci](https://github.com/epessil/mi-app-ci) |
| Virtualization | VMware vSphere, 21 vCenters across multiple AD domains (audit automation, read-only) |

## Index

| Folder | Content | Origin |
|---|---|---|
| [`01-fundamentos/`](01-fundamentos/) | Deployment, ClusterIP Service, rolling updates, rollback | Week 9 (kind) |
| [`02-config-ingress/`](02-config-ingress/) | ConfigMap, Secret, HPA, Ingress + **3 postmortems** | Week 10 (kind) |
| [`03-aks/`](03-aks/) | LoadBalancer with public IP, ACR attach, node scaling | Week 12 (AKS) |
| [`04-troubleshooting/`](04-troubleshooting/) | Deployment that crashes on purpose + postmortem and `CrashLoopBackOff`/`ImagePullBackOff` runbooks | kind |
| [`05-cicd-jenkins-webhook-deploy/`](05-cicd-jenkins-webhook-deploy/) | End-to-end CD: GitHub webhook → Jenkins → build/test/push → automatic deploy to Kubernetes with rollout verification + **3 postmortems** covering 7 chained incidents | Weeks 13–14 (kind + Jenkins) |
| [`06-observability-healthcheck-agent/`](06-observability-healthcheck-agent/) | Observability & healthcheck agents (v1 crontab → v2 Tool Use → v3 Thinking) + **postmortem** on metrics-server TLS in kind | Weeks 10–15 (kind) |
| [`07-vsphere-access-audit/`](07-vsphere-access-audit/) | Read-only PowerCLI inventory of access permissions across 21 vCenters / multiple AD domains, for compliance and access-cleanup audits | prod (read-only) |

## Included postmortems

The `INCIDENTE-*.md` files document real lab failures using an SRE postmortem format (symptom → diagnosis → root cause → fix → verification → lesson):

- [`INCIDENTE-hpa-unknown.md`](02-config-ingress/INCIDENTE-hpa-unknown.md) — HPA with `TARGETS <unknown>`: two chained causes (missing metrics-server + undeclared requests)
- [`INCIDENTE-set-env-silencioso.md`](02-config-ingress/INCIDENTE-set-env-silencioso.md) — `kubectl set env` with two `--from` flags: the last one silently overwrites the previous one
- [`INCIDENTE-ingress-huerfano.md`](02-config-ingress/INCIDENTE-ingress-huerfano.md) — controller running for 16 days with no rules + an accepted Ingress rule pointing to a nonexistent Service
- [`INCIDENTE-crashloopbackoff-demo.md`](04-troubleshooting/INCIDENTE-crashloopbackoff-demo.md) — deployment crashed on purpose to build and validate the `CrashLoopBackOff` runbook against a real failure
- [`INCIDENTE-webhook-github-jenkins.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-webhook-github-jenkins.md) — GitHub webhook rejected with 403 "No valid crumb", then timing out: CSRF proxy compatibility + wrong payload URL path
- [`INCIDENTE-jenkins-arranque-y-credenciales.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-jenkins-arranque-y-credenciales.md) — Jenkins down after a WSL restart, lost admin credential recovered via Groovy script in init.groovy.d, and a credential-ID mismatch breaking the pipeline
- [`INCIDENTE-red-nombre-puerto-deploy.md`](05-cicd-jenkins-webhook-deploy/INCIDENTE-red-nombre-puerto-deploy.md) — Jenkins blind to the kind cluster (isolated Docker networks → internal kubeconfig), a misreferenced Deployment, and a 5000-vs-8080 port mismatch causing CrashLoopBackOff
- [`INCIDENTE-05-metrics-server-kubelet-tls.md`](06-observability-healthcheck-agent/INCIDENTE-05-metrics-server-kubelet-tls.md) — metrics-server on kind cannot validate the kubelet's self-signed cert: `--kubelet-insecure-tls` required locally (not on AKS/EKS), leaving `kubectl top` empty and HPA at `TARGETS <unknown>`

Common thread across all of them: **Kubernetes accepts configuration with broken references without erroring on `apply`** — the truth lives in `describe` and in post-change verification, not in the exit code.

The `05` series documents 7 chained incidents from a single CD implementation — each fix revealed the next failure. Closing evidence: build #7 green, triggered by `Started by GitHub push`, with the resulting image verified running in the cluster.

## AI-Assisted SRE Tooling

Claude-powered diagnostics and governance built on top of this lab, from a single-shot API call to an autonomous tool-use agent, plus the Claude Code plugin (subagent, skills, hook) that keeps it operating safely — packaged for installation via this repo's own plugin marketplace.

| Artifact | Description | Tech |
|---|---|---|
| [`scripts/claude-api/diagnose-pod.ts`](scripts/claude-api/diagnose-pod.ts) | One-shot diagnosis of a single pod: feeds `kubectl describe` output to Claude and returns root cause, evidence, and remediation. | TypeScript, `@anthropic-ai/sdk`, Claude Sonnet |
| [`scripts/claude-api/healthcheck-agent.ts`](scripts/claude-api/healthcheck-agent.ts) (v1) | Periodic cluster healthcheck run via crontab: fixed `kubectl` commands collect cluster state, then a single Claude call produces a Markdown report. | TypeScript, `@anthropic-ai/sdk`, Claude Haiku, crontab |
| [`scripts/claude-api/healthcheck-agent-v2.ts`](scripts/claude-api/healthcheck-agent-v2.ts) | Autonomous healthcheck agent: Claude drives a Tool Use loop (`get_cluster_pods`, `get_pod_logs`, `create_incident`), choosing which tool to call and when, until it decides the healthcheck is complete. | TypeScript, `@anthropic-ai/sdk` Tool Use, Claude Haiku |
| [`scripts/claude-api/healthcheck-agent-v3.ts`](scripts/claude-api/healthcheck-agent-v3.ts) | Same Tool Use agent loop as v2, with extended thinking enabled (budget 8000 tokens) so Claude reasons before deciding which tool to invoke. | TypeScript, `@anthropic-ai/sdk` Tool Use + Thinking, Claude Sonnet |
| [`plugins/sre-toolkit/agents/k8s-diagnostician.md`](plugins/sre-toolkit/agents/k8s-diagnostician.md) | Read-only diagnostic subagent for kind cluster incidents (`CrashLoopBackOff`, `Pending`, `ImagePullBackOff`); limited to `get`/`describe`/`logs`/`events`, never remediates on its own. | Claude Code subagent (Bash, Read, Grep, Glob) |
| [`plugins/sre-toolkit/skills/sre-runbook`](plugins/sre-toolkit/skills/sre-runbook/SKILL.md) | Generates preventive incident runbooks following the project's mandatory 6-section format (Objetivo/Prerequisitos/Procedimiento/Verificación/Rollback/Escalamiento). | Claude Code skill |
| [`plugins/sre-toolkit/skills/sre-postmortem`](plugins/sre-toolkit/skills/sre-postmortem/SKILL.md) | Generates postmortems for already-resolved incidents (Resumen/Línea de tiempo/Impacto/Causa raíz/Qué funcionó/Acciones correctivas) — this is what produced the 8 `INCIDENTE-*.md` files above. | Claude Code skill |
| [`plugins/sre-toolkit/scripts/check-destructive.sh`](plugins/sre-toolkit/scripts/check-destructive.sh) | `PreToolUse` safety hook that blocks destructive commands (`kubectl delete/drain/cordon`, `rm -rf`, `pkill`, …) before execution unless explicitly confirmed by the user. | Bash, Claude Code hooks (JSON stdin/stdout) |
| [`CLAUDE.md`](CLAUDE.md) | Repo-level governance: non-negotiable environment rules, coding conventions, runbook format, and git workflow that all agents, subagents, and hooks must follow. | Claude Code project instructions |

Install the packaged toolkit in any Claude Code project:

```bash
/plugin marketplace add epessil/k8s-labs
```

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
