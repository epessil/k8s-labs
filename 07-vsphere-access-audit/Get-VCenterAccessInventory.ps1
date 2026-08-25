<#
.SYNOPSIS
    Extrae el inventario consolidado de permisos de multiples vCenters con dominios AD distintos.

.DESCRIPTION
    Recorre una lista de vCenters agrupados por dominio AD, extrae todos los permisos
    asignados (usuario/grupo, rol, herencia) y genera un CSV consolidado listo para
    analisis de auditoria.

    Resuelve el problema de credenciales heterogeneas: Connect-VIServer acepta una sola
    credencial por invocacion, por lo que con N dominios AD distintos se requiere iterar
    por grupos de vCenters en vez de conectar todos de una pasada.

.PARAMETER InventoryPath
    Ruta al archivo CSV que mapea cada vCenter con su dominio AD.
    Formato esperado: VCenter,Domain

.PARAMETER OutputPath
    Ruta del CSV consolidado de salida.

.EXAMPLE
    .\Get-VCenterAccessInventory.ps1 -InventoryPath .\vcenters.csv -OutputPath .\inventario-accesos.csv

.NOTES
    Autor: Erick Diaz
    Fecha: 2026-08-21
    Ambiente objetivo: prod (solo lectura)
    Dependencias: VMware PowerCLI (modulo VMware.VimAutomation.Core)

    ADVERTENCIA: este script solo LEE. No modifica permisos ni objetos en los vCenters.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InventoryPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = ".\inventario-accesos.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DomainCredentialMap {
    <#
        Solicita una credencial por cada dominio AD unico presente en el inventario.
        Se pide una sola vez por dominio, no una vez por vCenter.
    #>
    param([string[]]$Domains)

    $credMap = @{}
    foreach ($domain in $Domains) {
        Write-Host "Credencial para el dominio: $domain" -ForegroundColor Cyan
        $credMap[$domain] = Get-Credential -Message "Usuario con permisos de lectura en $domain"
    }
    return $credMap
}

function Get-NormalizedPrincipal {
    <#
        Separa DOMINIO\usuario en sus componentes.
        Permite correlacionar la misma persona entre dominios distintos, dado que
        el sAMAccountName se mantiene consistente entre los dominios del ambiente.
    #>
    param([string]$Principal)

    if ($Principal -match '^(?<domain>[^\\]+)\\(?<account>.+)$') {
        return [PSCustomObject]@{
            Domain  = $Matches['domain']
            Account = $Matches['account']
        }
    }

    # Principals locales o de SSO no traen dominio (ej: VSPHERE.LOCAL o cuentas de servicio)
    return [PSCustomObject]@{
        Domain  = "LOCAL"
        Account = $Principal
    }
}

# --- Carga del inventario de vCenters ---

if (-not (Test-Path $InventoryPath)) {
    throw "No se encontro el archivo de inventario: $InventoryPath"
}

$vcenterList = Import-Csv -Path $InventoryPath
$domains = $vcenterList | Select-Object -ExpandProperty Domain -Unique

Write-Host "vCenters a procesar: $($vcenterList.Count)" -ForegroundColor Green
Write-Host "Dominios AD distintos: $($domains.Count)" -ForegroundColor Green

$credentials = Get-DomainCredentialMap -Domains $domains

# --- Recoleccion ---

$results = [System.Collections.Generic.List[PSObject]]::new()
$failed  = [System.Collections.Generic.List[PSObject]]::new()

foreach ($vc in $vcenterList) {

    Write-Host "Conectando a $($vc.VCenter) [$($vc.Domain)]..." -ForegroundColor Yellow

    try {
        $conn = Connect-VIServer -Server $vc.VCenter `
                                 -Credential $credentials[$vc.Domain] `
                                 -ErrorAction Stop
    }
    catch {
        Write-Warning "Fallo la conexion a $($vc.VCenter): $($_.Exception.Message)"
        $failed.Add([PSCustomObject]@{
            VCenter = $vc.VCenter
            Domain  = $vc.Domain
            Error   = $_.Exception.Message
        })
        continue
    }

    try {
        $permissions = Get-VIPermission -Server $conn

        foreach ($perm in $permissions) {
            $normalized = Get-NormalizedPrincipal -Principal $perm.Principal

            $results.Add([PSCustomObject]@{
                VCenter          = $vc.VCenter
                VCenterDomain    = $vc.Domain
                Principal        = $perm.Principal
                PrincipalDomain  = $normalized.Domain
                PrincipalAccount = $normalized.Account
                IsGroup          = $perm.IsGroup
                Role             = $perm.Role
                Entity           = $perm.Entity.Name
                EntityType       = $perm.Entity.GetType().Name
                Propagate        = $perm.Propagate
                CollectedAt      = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            })
        }

        Write-Host "  $($permissions.Count) permisos extraidos" -ForegroundColor Gray
    }
    catch {
        Write-Warning "Fallo la extraccion en $($vc.VCenter): $($_.Exception.Message)"
        $failed.Add([PSCustomObject]@{
            VCenter = $vc.VCenter
            Domain  = $vc.Domain
            Error   = $_.Exception.Message
        })
    }
    finally {
        Disconnect-VIServer -Server $conn -Confirm:$false
    }
}

# --- Salida ---

$results | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Green
Write-Host "Permisos totales:      $($results.Count)"
Write-Host "vCenters procesados:   $($vcenterList.Count - $failed.Count) de $($vcenterList.Count)"
Write-Host "Principals unicos:     $(($results | Select-Object -ExpandProperty PrincipalAccount -Unique).Count)"
Write-Host "Archivo generado:      $OutputPath"

if ($failed.Count -gt 0) {
    $failedPath = [System.IO.Path]::ChangeExtension($OutputPath, "errores.csv")
    $failed | Export-Csv -Path $failedPath -NoTypeInformation -Encoding UTF8
    Write-Warning "$($failed.Count) vCenter(s) fallaron. Detalle en: $failedPath"
}
