---
name: sre-runbook
description: Usar cuando el usuario pida crear, escribir o documentar un runbook, procedimiento operacional, guía de troubleshooting, proceso de mantención o documentación post-incidente de infraestructura (Kubernetes, kind, AKS, VMware/vSphere, Windows Server, Linux). Aplica el estándar de 6 secciones del proyecto k8s-labs. También aplica al documentar la remediación de un incidente ya resuelto.
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

## Postmortems (variante del runbook)

Cuando lo pedido sea documentar un incidente ya ocurrido (no un procedimiento preventivo), usar
nombre `INCIDENTE-NN-descripcion.md` con numeración secuencial, y estas secciones en lugar de las 6
estándar:

1. **Resumen** — qué pasó, en una frase
2. **Línea de tiempo** — detección, diagnóstico, fix, verificación (con horas)
3. **Impacto** — qué se degradó y qué NO se vio afectado
4. **Causa raíz** — el porqué técnico, no el síntoma
5. **Qué funcionó / qué no funcionó** — separado explícitamente
6. **Acciones correctivas** — tabla con acción, dueño y fecha objetivo (nunca dejar la fecha en blanco)

Incluir siempre una tabla de metadata al inicio: fecha, severidad, detectado por, cluster afectado, MTTR.
