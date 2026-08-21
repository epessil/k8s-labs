---
name: sre-runbook
description: Usar cuando el usuario pida crear, escribir o documentar un runbook, procedimiento operacional, guia de troubleshooting o proceso de mantencion de infraestructura (Kubernetes, kind, AKS, VMware/vSphere, Windows Server, Linux). Genera documentos preventivos con el estandar de 6 secciones del proyecto. NO usar para documentar incidentes ya ocurridos.
---

Cuando generes un runbook con este skill, SIEMPRE sigue estas reglas:

## Estructura obligatoria (6 secciones exactas)

1. **Objetivo** — qué resuelve y cuándo aplicarlo
2. **Prerequisitos** — accesos, herramientas, ventana de mantención si aplica
3. **Procedimiento** — pasos numerados con comandos exactos y output esperado
4. **Verificación** — cómo confirmar que el resultado es correcto
5. **Rollback** — cómo revertir si algo sale mal
6. **Escalamiento** — a quién contactar si el procedimiento falla

## Convenciones obligatorias

- Nombre de archivo: `RUNBOOK-nombre-incidente.md` (mayúsculas)
- Autor: Erick Diaz — fecha actual
- Comandos: siempre con bloque de output esperado debajo
- Idioma: español para documentación, inglés para código y comandos
- Todo comando destructivo debe tener advertencia ⚠️ explícita

## Ubicación por tipo de contenido

El repo usa carpetas temáticas numeradas. Ubicar según el dominio del contenido, NO por defecto en una sola carpeta:

- `04-troubleshooting/` — runbooks de diagnóstico y resolución de fallas
- `05-cicd-jenkins-webhook-deploy/` — runbooks de pipeline, deploy y CI/CD
- `06-observability-healthcheck-agent/` — runbooks de monitoreo, métricas y healthchecks
- Si el contenido no calza en ninguna carpeta existente, PREGUNTAR antes de crear una nueva

Al agregar un runbook a una carpeta, actualizar el índice del `README.md` raíz en el mismo commit.

## Persistencia de fixes (regla crítica)

El lab se reconstruye periódicamente (`kind delete cluster` + rebuild). Todo fix documentado en un
runbook debe indicar explícitamente si sobrevive o no a la recreación del ambiente:

- Si el fix es imperativo (`kubectl patch`, `kubectl edit`, `docker network connect`), el runbook
  DEBE incluir una advertencia de que se pierde al recrear el cluster, y referenciar dónde queda
  persistido de forma versionada.
- Preferir siempre la forma declarativa (manifest en el repo) sobre la imperativa. Si solo existe
  la imperativa, marcarlo como deuda técnica en la sección de Escalamiento.

## Formato de comandos

Todo comando va en bloque con su output esperado inmediatamente debajo:

```bash
kubectl get pods -n kube-system -l k8s-app=metrics-server
```

```
NAME                              READY   STATUS    RESTARTS   AGE
metrics-server-7f4b6c8d9-x2k4p    1/1     Running   0          2m
```

Si el comando no produce output en caso de éxito, indicarlo explícitamente con `# (sin output = OK)`.

