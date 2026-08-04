---
name: sre-runbook
description: Genera runbooks de infraestructura SRE siguiendo 
             el estándar del proyecto k8s-labs
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

- Nombre de archivo: RUNBOOK-nombre-incidente.md (mayúsculas)
- Ubicación: siempre en 04-troubleshooting/
- Autor: Erick Diaz — fecha actual
- Comandos: siempre con bloque de output esperado debajo
- Idioma: español para documentación, inglés para código y comandos
- Todo comando destructivo debe tener advertencia ⚠️ explícita
