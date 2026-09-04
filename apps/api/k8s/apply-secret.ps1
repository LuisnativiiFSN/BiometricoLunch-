param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env"),
  [string]$Namespace = "app-comedor-fsn",
  [string]$SecretName = "comedor-api-secrets"
)

$ErrorActionPreference = "Stop"
$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
  throw "kubectl no esta instalado o no esta disponible en PATH."
}

$requiredKeys = @(
  "DB_SERVER",
  "DB_PORT",
  "DB_DATABASE",
  "DB_USER",
  "DB_PASSWORD",
  "BIOMETRIC_ENCRYPTION_KEY",
  "AUTH_JWT_SECRET"
)

$keysInFile = Get-Content -LiteralPath $resolvedEnvFile |
  Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
  ForEach-Object { ($_ -split '=', 2)[0].Trim() }

$missingKeys = $requiredKeys | Where-Object { $_ -notin $keysInFile }
if ($missingKeys.Count -gt 0) {
  throw "Faltan claves requeridas en el archivo .env: $($missingKeys -join ', ')"
}

$temporaryEnvFile = [System.IO.Path]::GetTempFileName()
try {
  # kubectl no interpreta las comillas como dotenv. Se eliminan solamente las
  # comillas exteriores para que el contenedor reciba el mismo valor que Node.
  $normalizedLines = Get-Content -LiteralPath $resolvedEnvFile |
    Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
    ForEach-Object {
      $parts = $_ -split '=', 2
      $key = $parts[0].Trim()
      $value = $parts[1].Trim()

      if ($value.Length -ge 2) {
        $firstCharacter = $value[0]
        $lastCharacter = $value[$value.Length - 1]
        if (($firstCharacter -eq '"' -and $lastCharacter -eq '"') -or
            ($firstCharacter -eq "'" -and $lastCharacter -eq "'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }

      "$key=$value"
    }

  [System.IO.File]::WriteAllLines(
    $temporaryEnvFile,
    $normalizedLines,
    [System.Text.UTF8Encoding]::new($false)
  )

  $secretYaml = kubectl create secret generic $SecretName `
    --namespace $Namespace `
    --from-env-file=$temporaryEnvFile `
    --dry-run=client `
    -o yaml

  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo generar el Secret de Kubernetes."
  }

  $secretYaml | kubectl apply -f -
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo crear o actualizar el Secret de Kubernetes."
  }
}
finally {
  Remove-Item -LiteralPath $temporaryEnvFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Secret '$SecretName' actualizado en el namespace '$Namespace'."
Write-Host "Las claves se tomaron de '$resolvedEnvFile' sin cambiar sus nombres."
