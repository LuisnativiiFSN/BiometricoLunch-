# status.ps1 - Versión corregida
# Script para ver el estado de todos los proyectos
# Uso: .\status.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$ConfigFile = "conf.json"
)

$Info = @{ ForegroundColor = "Cyan" }
$Success = @{ ForegroundColor = "Green" }
$Warning = @{ ForegroundColor = "Yellow" }

# Cargar configuracion
if (Test-Path $ConfigFile) {
    $config = Get-Content $ConfigFile | ConvertFrom-Json
} else {
    Write-Host "Archivo de configuracion no encontrado: $ConfigFile" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" @Info
Write-Host "ESTADO DEL CLUSTER" @Info
Write-Host "========================================" @Info

# Estado del cluster
Write-Host "`nNodos:" @Info
kubectl get nodes

# Ingress Controller
Write-Host "`nIngress Controller:" @Info
$ingressIP = kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
if ($ingressIP) {
    Write-Host "IP: $ingressIP" @Success
} else {
    Write-Host "Ingress Controller no encontrado" @Warning
}

# Estado por proyecto
Write-Host "`nProyectos desplegados:" @Info

foreach ($project in $config.projects) {
    Write-Host "`n  Proyecto: $($project.name)" @Info
    Write-Host "  Namespace: $($project.namespace)" @Info
    
    # Pods
    Write-Host "  Pods:" @Info
    $pods = kubectl get pods -n $project.namespace -l app=testapi 2>$null
    if ($pods -and $pods -notmatch "No resources") {
        kubectl get pods -n $project.namespace -l app=testapi
    } else {
        Write-Host "  No pods encontrados" @Warning
    }
    
    # Services
    Write-Host "`n  Services:" @Info
    $svc = kubectl get svc -n $project.namespace 2>$null
    if ($svc -and $svc -notmatch "No resources") {
        kubectl get svc -n $project.namespace
    } else {
        Write-Host "  No services encontrados" @Warning
    }
    
    # Ingress
    Write-Host "`n  Ingress:" @Info
    $ingress = kubectl get ingress -n $project.namespace 2>$null
    if ($ingress -and $ingress -notmatch "No resources") {
        kubectl get ingress -n $project.namespace
    } else {
        Write-Host "  No ingress encontrados" @Warning
    }
}

# URLs de acceso
Write-Host "`nURLs de acceso:" @Success
$ingressIP = $config.cluster.ingressIP
foreach ($project in $config.projects) {
    Write-Host "  $($project.name): http://$ingressIP/swagger/index.html" @Success
}