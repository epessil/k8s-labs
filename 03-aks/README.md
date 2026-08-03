# 03 — AKS: mismo kubectl, infraestructura real

Migración del laboratorio de kind a Azure Kubernetes Service: nodos que son VMs reales, un LoadBalancer con IP pública de internet y el registry (ACR) conectado sin credenciales manuales.

## Archivos

| Archivo | Contenido |
|---|---|
| `service-loadbalancer.yaml` | Service `type: LoadBalancer` — en AKS asigna IP pública real (~14 s); en kind queda `<pending>` para siempre |
| `comandos-aks.md` | Secuencia completa `az` usada: creación, attach-acr, credenciales, escalado, limpieza |

## Conceptos aplicados

- **kind vs AKS**: en kind el "nodo" es un contenedor Docker; en AKS es una VM real (`Standard_D2s_v6`) que tarda minutos en aprovisionarse y **cobra aunque cierres la laptop**. Escalar de 1 a 2 nodos = crear una VM completa (~2-4 min), el equivalente gestionado de un VM Scale Set.
- **LoadBalancer**: a diferencia de ClusterIP, abre una puerta real de internet gestionada por el proveedor cloud. Sin port-forward, accesible desde cualquier lugar. Borrar el Service libera la IP pública.
- **Dos contextos, un kubeconfig**: `az aks get-credentials` agrega el contexto AKS junto al de kind. Regla de oro antes de cualquier comando destructivo: `kubectl config get-contexts` — el clúster equivocado activo es un incidente autoinfligido clásico.
- **Fricciones reales de una suscripción nueva** (documentadas en `comandos-aks.md`): providers no registrados (`Microsoft.ContainerService`), tamaños de VM restringidos por región, restricciones antifraude en regiones populares. El error muchas veces es de la suscripción, no del comando.
- **La limpieza no es opcional**: `az aks delete` + `az group delete` es el último paso del laboratorio, no un extra.
