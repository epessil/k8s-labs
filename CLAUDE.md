# CLAUDE.md — infra-runbooks

## Contexto del proyecto

Repositorio de runbooks y scripts operacionales de infraestructura (VMware/vSphere, Windows Server, Linux, Kubernetes). Los runbooks generados aquí son parte de un portafolio profesional SRE, por lo que la calidad y documentación importan tanto como la funcionalidad.

## Estructura del repositorio

- `runbooks/` — runbooks en Markdown (healthchecks, procedimientos de incidentes, mantenciones)
- `scripts/powercli/` — scripts PowerCLI / PowerShell para vSphere y Windows Server
- `scripts/bash/` — scripts Bash y definiciones de crontab para Linux
- `scripts/k8s/` — manifiestos y scripts para el cluster kind (lab local)
- `templates/` — plantillas base de runbooks

## Estructura de carpetas k8s-labs

- Usar numeración secuencial: `01-`, `02-`, `03-`, `04-`...
- Cada carpeta representa un módulo temático del lab
- Los runbooks de troubleshooting van en `04-troubleshooting/`
- Al agregar un módulo nuevo, actualizar el índice del README.md raíz

## Reglas de ambiente (NO negociables)

- **NUNCA instalar módulos, paquetes o dependencias nuevas.** Trabajar únicamente con lo ya disponible en el ambiente. Si un script requiere un módulo faltante, proponer una alternativa con herramientas nativas o detenerse y consultarme.
- Los scripts marcados con `# ENV: prod` en su cabecera son de solo lectura conceptual: se pueden leer y usar como referencia, pero NO ejecutar ni modificar sin autorización explícita.
- No ejecutar comandos destructivos (delete, remove, restart de servicios, kill de procesos) sin pedir confirmación, incluso en el lab.
- El cluster kind local es el único ambiente donde se permite ejecución libre de pruebas.

## Convenciones de código

- Scripts PowerShell/PowerCLI: verbos aprobados (Get-, Set-, New-), nombres en PascalCase, cabecera con `.SYNOPSIS`, `.DESCRIPTION`, `.PARAMETER`, `.EXAMPLE`.
- Scripts Bash: `set -euo pipefail` obligatorio, shebang `#!/usr/bin/env bash`, funciones en snake_case.
- Todo script nuevo incluye cabecera con: propósito, autor (Erick Diaz), fecha, ambiente objetivo (lab/prod) y dependencias.
- Comentarios y documentación en español; nombres de variables y funciones en inglés.

## Formato de runbooks

Todo runbook sigue la plantilla de `templates/runbook-base.md` con estas secciones:

1. **Objetivo** — qué resuelve y cuándo aplicarlo
2. **Prerequisitos** — accesos, herramientas, ventana de mantención si aplica
3. **Procedimiento** — pasos numerados, con comandos exactos y output esperado
4. **Verificación** — cómo confirmar que el resultado es correcto
5. **Rollback** — cómo revertir si algo sale mal
6. **Escalamiento** — a quién contactar si el procedimiento falla

## Flujo de trabajo Git

- Nunca hacer commit directo a `main`. Crear branch con formato `tipo/descripcion-corta` (ej: `feat/healthcheck-cpu-vms`, `fix/crontab-backup`).
- Mensajes de commit en inglés, formato convencional: `feat:`, `fix:`, `docs:`, `refactor:`.
- Antes de proponer un commit, mostrar resumen de los cambios realizados.
- Los PR requieren mi revisión; nunca hacer merge automático.
- Usar `gh` CLI para crear PRs cuando esté disponible. Título y descripción del PR deben incluir: resumen del cambio, archivos modificados y test plan con evidencia de verificación.
- Si `gh` no está disponible, generar el link de PR manual con la URL del repo.

## Estilo de interacción

- Explicar el "por qué" de decisiones técnicas no triviales (esto es un proyecto de aprendizaje además de portafolio).
- Si detectas un error en mi razonamiento o en código existente, señalarlo directamente con comparación correcto vs incorrecto.
- Ante ambigüedad en un requerimiento, preguntar antes de asumir.
