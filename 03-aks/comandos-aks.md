# Secuencia az usada en el laboratorio AKS

```bash
# 0. Autenticacion (WSL no puede abrir el navegador -> device code obligatorio)
az login --use-device-code
az account show   # confirmar suscripcion ANTES de crear nada

# 1. Providers (cuentas nuevas no los traen registrados; tarda 1-3 min)
az provider register --namespace Microsoft.ContainerService
az provider show --namespace Microsoft.ContainerService --query registrationState -o tsv

# 2. Crear el cluster (region y tamano de VM validados antes con list-skus:
#    Standard_B2s no permitido en brazilsouth para esta suscripcion -> Standard_D2s_v6)
az aks create \
  --resource-group rg-sre-lab \
  --name aks-sre-lab \
  --node-count 1 \
  --node-vm-size Standard_D2s_v6 \
  --attach-acr <mi-acr> \
  --generate-ssh-keys

# 3. Conectar kubectl (agrega un SEGUNDO contexto al kubeconfig)
az aks get-credentials --resource-group rg-sre-lab --name aks-sre-lab
kubectl config get-contexts   # verificar contexto activo SIEMPRE

# 4. Desplegar y exponer
kubectl apply -f ../01-fundamentos/deployment.yaml
kubectl apply -f service-loadbalancer.yaml
kubectl get service mi-app-public -w   # EXTERNAL-IP paso de <pending> a IP publica en ~14s
curl http://<EXTERNAL-IP>/health

# 5. Escalar nodos (VM real, ~2-4 min) y verificar distribucion de pods
az aks scale --resource-group rg-sre-lab --name aks-sre-lab --node-count 2
kubectl get pods -o wide   # 2/2 pods distribuidos entre los dos nodos

# 6. LIMPIEZA — el paso final del laboratorio, no un extra (AKS cobra de fondo)
az aks delete --resource-group rg-sre-lab --name aks-sre-lab --yes --no-wait
az group delete --name rg-sre-lab --yes --no-wait
```
