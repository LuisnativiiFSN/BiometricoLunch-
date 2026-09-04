# logs.ps1
# Script para ver logs de un proyecto
# Uso: .\logs.ps1 -ProjectName "ExampleAPI" [-Follow]

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectName,
    
    [Parameter(Mandatory=$false)]
    [string]$ConfigFile = "config.json",
    
    [Parameter(Mandatory=$false)]
    [switch]$Follow = $false,
    
    [Parameter(Mandatory=$false)]
    [int]$Tail = 50
)

$Info = @{ ForegroundColor = "Cyan" }

# Cargar configuración
if (Test-Path $ConfigFile) {
    $config = Get-Content $ConfigFile | ConvertFrom-Json
}

# Buscar el proyecto
$project = $config.projects | Where-Object { $_.name -eq $ProjectName }
if (-not $project) {
    Write-Host "❌ Proyecto $ProjectName no encontrado" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" @Info
Write-Host "Logs del proyecto: $ProjectName" @Info
Write-Host "Namespace: $($project.namespace)" @Info
Write-Host "========================================" @Info

# Obtener el nombre del pod
$podName = kubectl get pods -n $project.namespace -l app=testapi -o jsonpath='{.items[0].metadata.name}' 2>$null

if (-not $podName) {
    Write-Host "❌ No se encontraron pods para el proyecto $ProjectName" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Pod: $podName" @Info

if ($Follow) {
    kubectl logs -n $project.namespace $podName --tail=$Tail -f
} else {
    kubectl logs -n $project.namespace $podName --tail=$Tail
}