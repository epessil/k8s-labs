# CLAUDE.md — k8s-labs

Laboratorio SRE con artefactos de portafolio: manifiestos Kubernetes (kind + AKS), pipeline CI/CD,
automatización con Claude API, y documentación operacional. Proyecto de aprendizaje además de
portafolio: la calidad de la documentación importa tanto como la funcionalidad.

## Estructura

Carpetas temáticas con numeración secuencial (`01-` a `07-`). Al agregar una carpeta nueva,
actualizar el índice del `README.md` raíz en el mismo commit.

- `plugins/sre-toolkit/` — plugin instalable: skills, subagente y hook
- `scripts/claude-api/` — agentes TypeScript sobre la API de Claude
- `.claude-plugin/marketplace.json` — catálogo del marketplace

Para ubicar runbooks y postmortems, seguir las reglas de las skills `sre-runbook` y `sre-postmortem`.
Si el contenido no calza en ninguna carpeta existente, preguntar antes de crear una nueva.

## Ambiente

**NUNCA instalar módulos, paquetes o dependencias nuevas.** Trabajar solo con lo disponible en el
ambiente. Si algo requiere una dependencia faltante, proponer alternativa nativa o detenerse y
consultar.

- Scripts con `# ENV: prod` en la cabecera: leer y usar como referencia, no ejecutar ni modificar.
- El cluster kind local es el único ambiente donde se permite ejecución libre de pruebas.

## Convenciones de código

- PowerShell/PowerCLI: verbos aprobados (`Get-`, `Set-`, `New-`), PascalCase, cabecera con
  `.SYNOPSIS`, `.DESCRIPTION`, `.PARAMETER`, `.EXAMPLE`.
- Bash: `set -euo pipefail`, shebang `#!/usr/bin/env bash`, funciones en snake_case.
- Todo script nuevo lleva cabecera con: propósito, autor (Erick Diaz), fecha, ambiente objetivo
  (lab/prod) y dependencias.
- Comentarios y documentación en español; variables y funciones en inglés.
- El `README.md` raíz va en inglés (audiencia de portafolio); el resto de la documentación en español.

## Git

- Nunca commit directo a `main`. Crear branch con formato `tipo/descripcion-corta`.
- Antes de crear un branch: `git checkout main && git pull origin main && git checkout -b <nombre>`.
  Ramificar sin `pull` previo produce ramas desde un `main` desactualizado.
- Mensajes de commit en inglés, formato convencional: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Mostrar resumen de cambios antes de proponer un commit.
- Verificar el contenido del PR con `gh api repos/epessil/k8s-labs/pulls/<N>/files` antes de mergear.
  No usar `gh pr view --json files`: devuelve datos cacheados.
- Nunca hacer merge sin mi confirmación explícita.
- PR con `gh` CLI: título y descripción con resumen del cambio, archivos modificados y test plan.

## Interacción

- Explicar el "por qué" de decisiones técnicas no triviales.
- Si detectas un error en mi razonamiento o en código existente, señalarlo con comparación
  correcto vs incorrecto.
- Ante ambigüedad, preguntar antes de asumir.
