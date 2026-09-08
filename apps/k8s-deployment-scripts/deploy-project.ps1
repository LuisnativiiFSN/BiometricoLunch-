# deploy-project.ps1
# Script para desplegar un proyecto especifico
# Uso: .\deploy-project.ps1 -ProjectName "ExampleAPI"

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectName,
    
    [Parameter(Mandatory=$false)]
    [string]$ConfigFile = "conf.json",
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun = $false
)

# Colores para la consola
$Info = @{ ForegroundColor = "Cyan" }
$Success = @{ ForegroundColor = "Green" }
$Warning = @{ ForegroundColor = "Yellow" }
$Error = @{ ForegroundColor = "Red" }

Write-Host "========================================" @Info
Write-Host "Desplegando proyecto: $ProjectName" @Info
Write-Host "========================================" @Info

# Cargar configuracion
if (Test-Path $ConfigFile) {
    $config = Get-Content $ConfigFile | ConvertFrom-Json
    Write-Host "[OK] Configuracion cargada" @Success
} else {
    Write-Host "[ERROR] Archivo de configuracion no encontrado: $ConfigFile" @Error
    exit 1
}

# Buscar el proyecto en la configuracion
$project = $config.projects | Where-Object { $_.name -eq $ProjectName }
if (-not $project) {
    Write-Host "[ERROR] Proyecto $ProjectName no encontrado en conf.json" @Error
    exit 1
}

Write-Host "[INFO] Ruta de manifiestos: $($project.path)" @Info
Write-Host "[INFO] Namespace: $($project.namespace)" @Info
Write-Host "[INFO] Imagen Docker: $($project.dockerImage)" @Info

# ============================================
# FUNCIÓN: Verificar y crear namespace
# ============================================
function Ensure-Namespace {
    param([string]$namespace)
    
    Write-Host "[INFO] Verificando namespace: $namespace" @Info
    
    # Verificar si el namespace existe
    $nsExists = kubectl get namespace $namespace --ignore-not-found=true 2>$null
    
    if ($nsExists) {
        Write-Host "[OK] Namespace '$namespace' ya existe" @Success
    } else {
        Write-Host "[WARNING] Namespace '$namespace' no existe, creando..." @Warning
        
        # Crear el namespace
        kubectl create namespace $namespace
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Namespace '$namespace' creado exitosamente" @Success
            
            # Opcional: Agregar labels al namespace
            kubectl label namespace $namespace purpose=development managed-by=deploy-script --overwrite > $null
            Write-Host "[INFO] Labels agregadas al namespace" @Info
        } else {
            Write-Host "[ERROR] No se pudo crear el namespace" @Error
            exit 1
        }
    }
}

# ============================================
# FUNCIÓN: Aplicar manifiesto con namespace
# ============================================
function Apply-Manifest {
    param(
        [string]$filePath,
        [string]$namespace,
        [string]$type
    )
    
    Write-Host "  Aplicando $type..." -NoNewline
    
    # Verificar que el archivo existe
    if (-not (Test-Path $filePath)) {
        Write-Host " [ERROR]" @Error
        Write-Host "    Archivo no encontrado: $filePath" @Error
        return $false
    }
    
    # Aplicar el manifiesto con el namespace especificado
    $result = kubectl apply -f $filePath -n $namespace 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" @Success
        return $true
    } else {
        Write-Host " [ERROR]" @Error
        Write-Host "    $result" @Error
        return $false
    }
}

# ============================================
# FUNCIÓN: Verificar archivos YAML
# ============================================
function Test-YamlFiles {
    param([string]$path)
    
    $requiredFiles = @("deployment.yaml", "service.yaml", "ingress.yaml")
    $missingFiles = @()
    
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $path $file
        if (-not (Test-Path $filePath)) {
            $missingFiles += $file
        }
    }
    
    if ($missingFiles.Count -gt 0) {
        Write-Host "[ERROR] Archivos faltantes en la carpeta:" @Error
        foreach ($file in $missingFiles) {
            Write-Host "   - $file" @Error
        }
        return $false
    }
    
    Write-Host "[OK] Todos los manifiestos encontrados" @Success
    return $true
}

# ============================================
# PROGRAMA PRINCIPAL
# ============================================

# Verificar que la carpeta k8s existe
$k8sPath = $project.path
if (-not (Test-Path $k8sPath)) {
    $errorMsg = "[ERROR] Carpeta k8s no encontrada: $k8sPath"
    Write-Host $errorMsg @Error
    Write-Host "[WARNING] Verifica que la ruta sea correcta" @Warning
    Write-Host "   Ruta esperada: source\$ProjectName\k8s" @Info
    exit 1
}

# Verificar archivos necesarios
if (-not (Test-YamlFiles -path $k8sPath)) {
    exit 1
}

# Verificar/Crear namespace (AQUÍ ESTÁ LA SOLUCIÓN)
Ensure-Namespace -namespace $project.namespace

# Dry run mode
if ($DryRun) {
    Write-Host "[DRY RUN MODE] Validando manifiestos..." @Warning
    foreach ($file in @("deployment.yaml", "service.yaml", "ingress.yaml")) {
        $filePath = Join-Path $k8sPath $file
        Write-Host "Validando: $file" @Info
        kubectl apply -f $filePath -n $project.namespace --dry-run=client -o yaml
    }
    Write-Host "[OK] Validacion completada (sin cambios aplicados)" @Success
    exit 0
}

# Aplicar los manifiestos
Write-Host "`nAplicando manifiestos..." @Info

# 1. Aplicar deployment
$deploymentPath = Join-Path $k8sPath "deployment.yaml"
if (-not (Apply-Manifest -filePath $deploymentPath -namespace $project.namespace -type "deployment")) {
    exit 1
}

# 2. Aplicar service
$servicePath = Join-Path $k8sPath "service.yaml"
if (-not (Apply-Manifest -filePath $servicePath -namespace $project.namespace -type "service")) {
    exit 1
}

# 3. Aplicar ingress
$ingressPath = Join-Path $k8sPath "ingress.yaml"
if (-not (Apply-Manifest -filePath $ingressPath -namespace $project.namespace -type "ingress")) {
    Write-Host "[WARNING] El ingress podría ser opcional, continuando..." @Warning
}

Write-Host "[OK] Manifiestos aplicados correctamente" @Success

# Esperar que los pods esten listos
Write-Host "`nEsperando que los pods esten listos..." @Info
Start-Sleep -Seconds 5

# Verificar estado de los pods
Write-Host "`nEstado de los pods:" @Info
kubectl get pods -n $project.namespace

# Verificar servicios
Write-Host "`nServicios:" @Info
kubectl get svc -n $project.namespace

# Verificar ingress
Write-Host "`nIngress:" @Info
kubectl get ingress -n $project.namespace

# Mostrar URLs de acceso
Write-Host "`nURLs de acceso:" @Success
$ingressIP = $config.cluster.ingressIP
$namespace = $project.namespace
Write-Host "  API Base:    http://$ingressIP/api" @Success
Write-Host "  Swagger UI:  http://$ingressIP/swagger/index.html" @Success
Write-Host "  Health:      http://$ingressIP/api/health" @Success

# Mostrar comandos utiles
Write-Host "`nComandos utiles:" @Info
Write-Host "  Ver logs:     kubectl logs -f -n $namespace -l app=exampleapi" @Info
Write-Host "  Ver estado:   kubectl get all -n $namespace" @Info
Write-Host "  Port-forward: kubectl port-forward -n $namespace svc/exampleapi-service 8080:80" @Info
Write-Host "  Eliminar:     .\cleanup-project.ps1 -ProjectName $ProjectName" @Info

Write-Host "`n========================================" @Info
Write-Host "Despliegue de $ProjectName completado" @Success
Write-Host "========================================" @Info