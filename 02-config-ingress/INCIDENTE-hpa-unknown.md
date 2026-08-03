# Postmortem: HPA con TARGETS `<unknown>`

**Entorno:** clúster kind local (`sre-lab`) · **Severidad:** lab / bloqueante para el objetivo del día · **Estado:** resuelto y verificado

## Resumen

Tras crear un HorizontalPodAutoscaler para el Deployment `mi-app`, la columna `TARGETS` de `kubectl get hpa` mostraba `<unknown>/50%` de forma persistente. El autoescalado nunca se activó, sin ningún error explícito en la creación del recurso.

## Línea de tiempo

1. `kubectl autoscale deployment mi-app --cpu-percent=50 --min=2 --max=6` → recurso creado sin error.
2. `kubectl get hpa` → `TARGETS: <unknown>/50%`. Se esperó asumiendo demora de métricas.
3. Tras varios minutos sin cambio, `kubectl describe hpa mi-app` → eventos `FailedGetResourceMetric`.
4. Dos causas encadenadas identificadas (ver abajo), aplicadas en orden, verificado el resultado.

## Causa raíz (fueron dos)

1. **kind no trae metrics-server**: el HPA calcula sobre métricas que alguien tiene que recolectar. Sin metrics-server instalado, no hay dato que comparar contra el 50%. Además, tras instalarlo, la APIService tarda en propagarse en kind — hay una ventana donde ya está "instalado" pero aún responde vacío.
2. **El Deployment no tenía `resources.requests.cpu`**: el 50% del HPA es *porcentaje del request*. Sin request declarado, la división no tiene denominador. `<unknown>` no era un bug: era el sistema diciendo honestamente "no tengo con qué calcular".

## Resolución

```bash
# 1. Instalar metrics-server (con el parche de TLS para kind) y ESPERAR la propagación
kubectl top pods            # cuando esto responde, las métricas fluyen

# 2. Declarar el denominador
kubectl set resources deployment mi-app --requests=cpu=100m,memory=64Mi

# 3. Verificar — un cambio sin verificación no está terminado
kubectl get hpa             # TARGETS pasó de <unknown> a un porcentaje real
```

Bajo carga sintética el HPA escaló de 4 a 6 pods con CPU al 153% del request.

## Lecciones

- **`<unknown>` es un síntoma de dependencias faltantes, no de configuración incorrecta del HPA.** El recurso HPA se crea feliz aunque su cadena de suministro de datos no exista.
- **`describe` antes que adivinar**: los eventos del recurso (`FailedGetResourceMetric`) apuntaban directo a la causa; esperar "por si acaso" solo quemó tiempo.
- **Los requests no son opcionales** si hay autoescalado: son la unidad de medida del sistema completo.
- Paralelo con mi background de infraestructura: es el mismo patrón que un cluster vSphere con DRS activado pero sin datos de vCenter — la política existe, el motor de decisión está ciego.
