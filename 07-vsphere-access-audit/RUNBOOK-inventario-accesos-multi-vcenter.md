# RUNBOOK: Inventario de accesos multi-vCenter para auditoría

| Campo | Valor |
|---|---|
| **Autor** | Erick Diaz |
| **Fecha** | 2026-08-21 |
| **Ambiente objetivo** | prod (solo lectura) |
| **Dependencias** | VMware PowerCLI (`VMware.VimAutomation.Core`), PowerShell 5.1+ |
| **Duración estimada** | 15–30 min para 21 vCenters |

---

## 1. Objetivo

Generar un inventario consolidado de permisos asignados en múltiples vCenters con dominios AD distintos, en formato apto para auditoría y limpieza de cuentas.

**Cuándo aplicarlo:**
- Auditoría periódica de accesos (trimestral / semestral)
- Antes de una migración o consolidación de vCenters
- Tras una desvinculación masiva de personal
- Cuando se requiere evidencia de control de accesos para cumplimiento

**Problema que resuelve:** la extracción manual vía interfaz web requiere navegar vCenter por vCenter capturando pantallas — inviable a escala, propenso a error y sin trazabilidad. Este procedimiento reduce la recolección de horas a minutos y produce un artefacto versionable.

**Restricción de diseño clave:** `Connect-VIServer` acepta una sola credencial por invocación. En ambientes con N dominios AD distintos no es posible conectar todos los vCenters en una pasada — el script itera por grupos según el dominio de cada vCenter.

---

## 2. Prerequisitos

**Accesos:**
- Cuenta con rol **Read-Only** a nivel raíz en cada vCenter, en cada uno de los dominios AD involucrados
- Conectividad de red (443/TCP) desde la estación de trabajo hacia todos los vCenters

**Herramientas:**

```powershell
# Verificar que PowerCLI esté disponible
Get-Module -ListAvailable VMware.VimAutomation.Core
```

Output esperado:

```
    Directory: C:\Program Files\WindowsPowerShell\Modules

ModuleType Version    Name                                ExportedCommands
---------- -------    ----                                ----------------
Manifest   13.x.x     VMware.VimAutomation.Core           {Connect-VIServer, ...}
```

**Configuración previa de PowerCLI** (solo la primera vez):

```powershell
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false
Set-PowerCLIConfiguration -ParticipateInCEIP $false -Confirm:$false
```

**Archivo de inventario** — crear `vcenters.csv` mapeando cada vCenter a su dominio AD:

```
VCenter,Domain
vcsa-spc-01.spc.opsnet.com,spc.opsnet.com
vcsa-spc-02.spc.opsnet.com,spc.opsnet.com
vcsa-esc-01.esc.opsnet.com,esc.opsnet.com
vcsa-esc-02.esc.opsnet.com,esc.opsnet.com
```

**Ventana de mantención:** no requiere. El procedimiento es de solo lectura y no impacta operación.

---

## 3. Procedimiento

### Paso 1 — Validar el archivo de inventario

```powershell
Import-Csv .\vcenters.csv | Group-Object Domain | Select-Object Name, Count
```

Output esperado:

```
Name                Count
----                -----
spc.opsnet.com          6
esc.opsnet.com          5
dmz.opsnet.com          4
lab.opsnet.com          6
```

Confirmar que el total coincide con la cantidad de vCenters conocidos. Un vCenter ausente del inventario no aparecerá en el reporte y pasará desapercibido en la auditoría.

### Paso 2 — Ejecutar la recolección

```powershell
.\Get-VCenterAccessInventory.ps1 -InventoryPath .\vcenters.csv -OutputPath .\inventario-accesos.csv
```

El script solicita **una credencial por dominio AD**, no una por vCenter. Con 4 dominios son 4 prompts, independiente de cuántos vCenters haya.

Output esperado durante la ejecución:

```
vCenters a procesar: 21
Dominios AD distintos: 4
Conectando a vcsa-spc-01.spc.opsnet.com [spc.opsnet.com]...
  147 permisos extraidos
Conectando a vcsa-spc-02.spc.opsnet.com [spc.opsnet.com]...
  132 permisos extraidos
...

=== Resumen ===
Permisos totales:      2847
vCenters procesados:   21 de 21
Principals unicos:     312
Archivo generado:      .\inventario-accesos.csv
```

### Paso 3 — Revisar fallos de conexión

Si algún vCenter falló, el script genera un CSV adicional de errores:

```powershell
if (Test-Path .\inventario-accesos.errores.csv) {
    Import-Csv .\inventario-accesos.errores.csv | Format-Table -AutoSize
}
```

```
# (sin output = todos los vCenters respondieron correctamente)
```

⚠️ **No continuar con la auditoría si hay vCenters fallidos.** Un inventario incompleto entregado como completo es peor que no tener inventario: genera falsa confianza en el resultado.

---

## 4. Verificación

### Verificación 1 — Integridad del CSV

```powershell
$data = Import-Csv .\inventario-accesos.csv
$data.Count
($data | Select-Object -ExpandProperty VCenter -Unique).Count
```

Output esperado: la segunda cifra debe coincidir con la cantidad de vCenters del inventario. Si es menor, hubo fallos silenciosos.

### Verificación 2 — Contraste puntual contra la interfaz

Elegir un vCenter al azar y comparar el conteo del CSV contra lo que muestra la interfaz web en **Administration → Access Control → Global Permissions**:

```powershell
$data | Where-Object VCenter -eq 'vcsa-spc-01.spc.opsnet.com' | Measure-Object
```

Las cifras deben coincidir. Una diferencia indica que el rol de la cuenta de lectura no alcanza a ver todos los objetos.

### Verificación 3 — Correlación entre dominios

Dado que el `sAMAccountName` es consistente entre dominios, un mismo usuario aparece con distintos prefijos. Verificar que la normalización funcionó:

```powershell
$data | Group-Object PrincipalAccount |
    Where-Object { ($_.Group.PrincipalDomain | Select-Object -Unique).Count -gt 1 } |
    Select-Object Name, Count |
    Sort-Object Count -Descending |
    Select-Object -First 10
```

Output esperado: lista de cuentas presentes en más de un dominio. Estos son los casos que la extracción manual tendía a contar como personas distintas.

---

## 5. Rollback

**No aplica.** El procedimiento es de solo lectura: no modifica permisos, roles ni objetos en los vCenters.

Si se requiere descartar el resultado, basta con eliminar los archivos generados:

```powershell
Remove-Item .\inventario-accesos.csv, .\inventario-accesos.errores.csv -ErrorAction SilentlyContinue
```

⚠️ Si el inventario se usó como insumo para **ejecutar** una limpieza de permisos, el rollback corresponde a ese procedimiento, no a este. Documentar la remediación en un runbook separado con su propio rollback.

---

## 6. Escalamiento

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Connect-VIServer` falla con error de certificado | PowerCLI no configurado para ignorar certificados autofirmados | Aplicar `Set-PowerCLIConfiguration` del punto 2 |
| Autenticación rechazada en un dominio completo | Cuenta bloqueada, expirada o sin permisos en ese dominio | Contactar al administrador del dominio AD correspondiente |
| Un vCenter puntual no responde | vCenter caído, o firewall bloqueando 443 desde la estación | Validar con `Test-NetConnection -Port 443` y escalar al equipo de plataforma |
| El conteo de permisos es menor al esperado | Rol de la cuenta sin visibilidad sobre ciertos objetos | Solicitar Read-Only a nivel raíz, no a nivel de carpeta |
| `Get-VIPermission` retorna vacío en todos los vCenters | Versión de PowerCLI incompatible con la versión de vCenter | Verificar matriz de compatibilidad VMware |

**Contacto:** equipo de Plataforma / Virtualización.

---

## Anexo — Análisis de hallazgos

El CSV consolidado es el insumo. Los cuatro hallazgos típicos de una auditoría de accesos:

### Cuentas huérfanas (personal desvinculado)

Requiere contrastar contra AD. Sin acceso a AD, exportar la lista de principals únicos y validarla con el equipo de identidades:

```powershell
$data | Select-Object PrincipalDomain, PrincipalAccount -Unique |
    Where-Object { $_.PrincipalDomain -ne 'LOCAL' -and $_.IsGroup -eq 'False' } |
    Export-Csv .\principals-a-validar.csv -NoTypeInformation
```

Este es el hallazgo de mayor severidad: un acceso activo de alguien que ya no pertenece a la organización.

### Permisos de Administrator fuera de TI

```powershell
$data | Where-Object Role -match 'Admin' |
    Select-Object VCenter, Principal, Role, Entity |
    Sort-Object Principal
```

### Usuarios individuales en vez de grupos

```powershell
$data | Where-Object IsGroup -eq 'False' |
    Group-Object PrincipalAccount |
    Select-Object Name, Count |
    Sort-Object Count -Descending
```

Cada permiso individual es deuda operacional: no se revoca al salir alguien del equipo, y multiplica el trabajo de mantención.

### Permisos duplicados o redundantes

Un usuario que recibe el mismo rol directamente **y** vía grupo, o un permiso explícito sobre un objeto hijo cuando el padre ya propaga:

```powershell
$data | Group-Object PrincipalAccount, Role, Entity |
    Where-Object Count -gt 1 |
    Select-Object Name, Count
```

### Formato de entrega

Planilla con dos hojas:
1. **Consolidado** — el CSV completo, filtrable
2. **Hallazgos** — una tabla por cada categoría anterior, con columna de acción propuesta y responsable

---

*Runbook generado siguiendo el estándar `sre-runbook` del proyecto k8s-labs.*
