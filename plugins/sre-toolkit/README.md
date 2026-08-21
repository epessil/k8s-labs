# sre-toolkit

Plugin de Claude Code que empaqueta el tooling SRE desarrollado en el laboratorio `k8s-labs`:
generación estandarizada de documentación operacional, diagnóstico read-only de clusters
Kubernetes, y protección técnica contra comandos destructivos.

Nace de incidentes reales documentados en este repositorio, no de ejemplos teóricos.

## Contenido

| Artefacto | Tipo | Función |
|---|---|---|
| `sre-runbook` | Skill | Genera runbooks preventivos con estándar de 6 secciones (Objetivo, Prerequisitos, Procedimiento, Verificación, Rollback, Escalamiento) |
| `sre-postmortem` | Skill | Genera postmortems de incidentes ya resueltos (Resumen, Línea de tiempo, Impacto, Causa raíz, Qué funcionó, Acciones correctivas) |
| `k8s-diagnostician` | Subagente | Diagnostica pods y nodos en contexto aislado. Solo lectura: get, describe, logs, events |
| `check-destructive.sh` | Hook PreToolUse | Bloquea kubectl delete/drain/cordon/taint, rollout restart, docker rm/rmi/prune, rm -rf, pkill, killall |

## Instalación

    /plugin marketplace add epessil/k8s-labs
    /plugin install sre-toolkit@k8s-labs

## Uso

Las skills se activan automáticamente según el contexto de la petición, o manualmente:

    /sre-runbook          # documentar un procedimiento
    /sre-postmortem       # documentar un incidente ocurrido

El subagente se invoca al pedir diagnóstico de un problema en el cluster. El hook opera
de forma transparente sobre toda ejecución de Bash, sin invocación manual.

## Diseño

**Separación runbook / postmortem.** Son documentos con propósito opuesto: uno es preventivo,
el otro forense. Mantenerlos en skills separadas permite que cada `description` active con
precisión en lugar de competir por el mismo contexto.

**Read-only reforzado técnicamente.** El subagente declara acceso de solo lectura en su
frontmatter, pero `tools: Bash` es irrestricto por naturaleza. El hook `check-destructive.sh`
es la capa que hace cumplir esa restricción independiente de lo que el agente solicite.

**Denylist deliberada.** El hook bloquea patrones destructivos conocidos y permite el resto.
En un laboratorio una allowlist estricta interrumpe el trabajo constantemente; el trade-off
es intencional y no aplicaría en un ambiente productivo.

**Persistencia de fixes.** Ambas skills incluyen la regla de distinguir fixes imperativos
(`kubectl patch`, `docker network connect`) de declarativos. Los primeros no sobreviven a un
`kind delete cluster` y deben registrarse como deuda técnica. Regla derivada del incidente
documentado en `06-observability-healthcheck-agent/`.

## Advertencia

Los plugins de Claude Code ejecutan código en la máquina donde se instalan. Revisar
`scripts/check-destructive.sh` antes de instalar, como con cualquier script de terceros.

## Autor

Erick Diaz — Infrastructure Engineer en transición a SRE.
