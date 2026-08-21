---
name: sre-postmortem
description: Usar cuando el usuario pida documentar un incidente ya ocurrido, escribir un postmortem, un analisis post-incidente o un RCA (root cause analysis) de infraestructura. Aplica cuando la falla YA fue resuelta y se quiere dejar registro. NO usar para procedimientos preventivos ni runbooks.
---

Cuando generes un postmortem con este skill, SIEMPRE sigue estas reglas:

## Metadata obligatoria (tabla al inicio)

Fecha, severidad, detectado por, cluster/ambiente afectado, MTTR.

## Estructura obligatoria (6 secciones exactas)

1. **Resumen** — que paso, en una frase
2. **Linea de tiempo** — deteccion, diagnostico, fix, verificacion (con horas)
3. **Impacto** — que se degrado y que NO se vio afectado
4. **Causa raiz** — el porque tecnico, no el sintoma
5. **Que funciono / que no funciono** — separado explicitamente
6. **Acciones correctivas** — tabla con accion, dueno y fecha objetivo

## Convenciones obligatorias

- Nombre de archivo: `INCIDENTE-NN-descripcion.md` con numeracion secuencial
- Autor: Erick Diaz — fecha del incidente
- Idioma: espanol para documentacion, ingles para codigo y comandos
- NUNCA dejar una fecha objetivo en blanco o como `[definir]`
- Si un dato no se conoce, marcarlo como `[POR CONFIRMAR]` explicitamente, nunca inventarlo

## Persistencia de fixes (regla critica)

El lab se reconstruye periodicamente (`kind delete cluster` + rebuild). Todo fix documentado
debe indicar si sobrevive o no a la recreacion del ambiente:

- Si el fix es imperativo (`kubectl patch`, `kubectl edit`, `docker network connect`), el
  postmortem DEBE registrarlo como deuda tecnica en Acciones correctivas.
- Preferir siempre la forma declarativa (manifest versionado) sobre la imperativa.

## Ubicacion por dominio

- `04-troubleshooting/` — incidentes de diagnostico y fallas generales
- `05-cicd-jenkins-webhook-deploy/` — incidentes de pipeline y deploy
- `06-observability-healthcheck-agent/` — incidentes de monitoreo y metricas
- Si no calza en ninguna, PREGUNTAR antes de crear carpeta nueva

Al agregar un postmortem, actualizar el indice del `README.md` raiz en el mismo commit.
