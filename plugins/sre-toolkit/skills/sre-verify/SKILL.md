---
name: sre-verify
description: Usar SIEMPRE despues de ejecutar un cambio de estado - aplicar manifiestos, mover o renombrar archivos, hacer commit, mergear un PR, instalar o migrar configuracion, modificar un recurso del cluster. Comprueba con evidencia que el cambio quedo como se esperaba antes de darlo por terminado. NO usar para monitoreo periodico ni healthchecks programados.
---

Regla del proyecto: **ejecutar sin verificar es no haber terminado**.

Toda accion que modifica estado se cierra con evidencia observable, no con una afirmacion.

## Principio

| Insuficiente | Correcto |
|---|---|
| "El deployment se aplico correctamente" | Output de `kubectl get pods` mostrando `1/1 Running` |
| "El archivo quedo en su lugar" | `ls -l` de la ruta destino |
| "El commit incluye los cambios" | `git show --stat HEAD` |

La verificacion produce output que el usuario puede leer. Un exit code 0 no es evidencia:
un comando puede tener exito y dejar el sistema en un estado distinto al esperado.

## Verificacion por tipo de cambio

### Archivos movidos o renombrados

```bash
ls -l <ruta-destino>
```

Confirmar que el archivo llego, y revisar permisos. Archivos provenientes de `/mnt/c` en WSL
llegan con modo 755 aunque sean documentos; corregir con `chmod 644` si corresponde.

**Ademas: buscar referencias rotas.** Mover un archivo no actualiza lo que lo apunta.

```bash
grep -rn "<nombre-archivo-anterior>" . --exclude-dir=.git
```

Una referencia a una ruta que ya no existe puede fallar de forma silenciosa y no bloqueante:
el sistema sigue operando sin la funcion que esa referencia proveia.

### Operaciones Git

Antes del commit, confirmar que el staging contiene exactamente lo esperado:

```bash
git status --short
```

Prefijos: `A` nuevo, `M` modificado, `R` movido, `D` eliminado. Si aparece algo no esperado,
o falta algo esperado, detenerse antes de comitear.

Despues del commit:

```bash
git show --stat HEAD
```

Antes de crear un branch, confirmar que `main` local esta actualizado:

```bash
git checkout main && git pull origin main && git checkout -b <nombre>
```

Ramificar sin `pull` produce ramas desde un estado desactualizado, y archivos ya eliminados
en el remoto reaparecen.

### Pull requests

```bash
gh api repos/epessil/k8s-labs/pulls/<N>/files | grep -oE '"filename":[[:space:]]*"[^"]*"'
```

No usar `gh pr view --json files`: devuelve datos cacheados que pueden no reflejar el ultimo push.

Confirmar tambien la rama base:

```bash
gh pr view <N> --json baseRefName,headRefName
```

### Cambios en el cluster Kubernetes

Dos niveles, ambos obligatorios:

```bash
# 1. Estado del recurso
kubectl get pods -n <namespace> -l <selector>

# 2. Prueba funcional
curl -H "Host: <host>" http://localhost:<puerto>/health
```

El primero confirma que Kubernetes acepto la configuracion. El segundo confirma que la
configuracion hace lo que se esperaba. Kubernetes acepta configuraciones con referencias
rotas sin fallar en `apply`: un Service que apunta a un selector inexistente se crea sin error.

Si el cambio afecta metricas o autoescalado:

```bash
kubectl top nodes
kubectl get hpa -n <namespace>
```

`TARGETS <unknown>` en un HPA indica que metrics-server no esta entregando datos.

### Configuracion, hooks y controles de seguridad

Al verificar un control de seguridad, identificar **que capa actuo**. Un bloqueo puede venir de:

- Una instruccion en `CLAUDE.md` (interpretativa, satisfecha por confirmacion conversacional)
- Un hook `PreToolUse` (mecanica, no negociable)
- La allowlist de permisos (preventiva)

Que la accion se detenga no confirma que el control especifico funcione. Buscar el mensaje
literal del control esperado en el output. Un hook que falla con `not found` produce un error
no bloqueante: la accion continua sin proteccion.

Verificar existencia y permisos del ejecutable:

```bash
ls -l <ruta-del-script>
```

## Cuando la verificacion falla

No continuar con los pasos siguientes. Reportar:

1. Que se esperaba
2. Que se observo
3. Que comando produjo esa evidencia

Un resultado parcial presentado como completo es peor que un fallo declarado: genera confianza
en un estado que no existe.
