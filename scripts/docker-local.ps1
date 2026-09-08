param(
    [ValidateSet('up', 'down', 'build', 'status', 'logs', 'restart')]
    [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repositoryRoot 'apps\api\.env'

if (-not (Test-Path -LiteralPath $environmentPath)) {
    throw "No existe $environmentPath"
}

$passwordLine = Get-Content -LiteralPath $environmentPath |
    Where-Object { $_ -match '^DB_PASSWORD=' } |
    Select-Object -First 1
if (-not $passwordLine) {
    throw 'DB_PASSWORD no está definido en apps/api/.env'
}

$password = ($passwordLine -replace '^DB_PASSWORD=', '').Trim()
if ($password.Length -ge 2 -and $password[0] -eq '"' -and $password[-1] -eq '"') {
    $password = $password.Substring(1, $password.Length - 2)
}

$env:MC_DB_PASSWORD = $password
try {
    Push-Location $repositoryRoot
    try {
        switch ($Action) {
            'up' {
                $env:DOCKER_BUILDKIT = '0'
                $env:COMPOSE_DOCKER_CLI_BUILD = '0'
                docker compose up -d --build --force-recreate
            }
            'build' {
                $env:DOCKER_BUILDKIT = '0'
                $env:COMPOSE_DOCKER_CLI_BUILD = '0'
                docker compose build
            }
            'down' { docker compose down }
            'status' { docker compose ps }
            'logs' { docker compose logs --tail 200 }
            'restart' { docker compose restart }
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Docker Compose terminó con código $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:MC_DB_PASSWORD -ErrorAction SilentlyContinue
}
