# Postmortem: `kubectl set env` aplicó solo el último `--from` (falla silenciosa)

**Entorno:** clúster kind local (`sre-lab`) · **Severidad:** lab / pérdida silenciosa de configuración · **Estado:** resuelto y verificado

## Resumen

Al inyectar un ConfigMap y un Secret al Deployment en un solo comando con dos flags `--from`, el comando terminó **exitoso** (`deployment.apps/mi-app env updated`), pero solo las variables del **último** `--from` quedaron aplicadas. Las del primero desaparecieron sin advertencia, error ni evento.

## Comando problemático vs. correcto

```bash
# INCORRECTO — se ve razonable, termina "exitoso", pierde datos:
kubectl set env deployment/mi-app \
  --from=configmap/mi-app-config \
  --from=secret/mi-app-secret
# Resultado real: solo las variables del Secret quedan; el ConfigMap se pierde.

# CORRECTO — un --from por comando, verificando entre medio:
kubectl set env deployment/mi-app --from=configmap/mi-app-config
kubectl set env deployment/mi-app --from=secret/mi-app-secret
```

## Cómo se detectó

Únicamente por la verificación post-cambio de rutina:

```bash
kubectl exec deployment/mi-app -- env | grep -E "ENTORNO|MENSAJE|DB_PASSWORD"
```

`DB_PASSWORD` estaba; `ENTORNO` y `MENSAJE`, no. Sin ese `grep`, la app habría corrido con configuración incompleta indefinidamente — el tipo de bug que aparece semanas después disfrazado de otra cosa.

## Causa raíz

Comportamiento del CLI: `kubectl set env` no acumula múltiples `--from` en una invocación; el último pisa al anterior. No es un error del clúster ni del manifiesto — es una semántica no obvia de la herramienta, sin warning.

## Lecciones

- **Exit code 0 ≠ intención cumplida.** El comando hizo exactamente lo que su semántica define, no lo que yo quise decir. "Ejecutar sin verificar es no haber terminado" dejó de ser una frase y pasó a ser política.
- **Las fallas silenciosas solo se cazan verificando**: no hay log, evento ni error que las delate.
- **Preferir manifiestos declarativos** (`envFrom` en el YAML, como en `deployment-con-recursos.yaml`) sobre comandos imperativos para configuración: el YAML versionado es revisable, reproducible y no depende de semánticas ocultas del CLI.
