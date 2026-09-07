[CmdletBinding()]
param(
    [switch]$Full
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repositoryRoot ".env"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host "[$Label] START"
    Push-Location $WorkingDirectory
    try {
        & $Executable @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label verification failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "[$Label] PASS"
}

function Read-EnvironmentFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "The local .env file is required. Create it at the repository root using .env.example as a guide."
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*(?:#|$)') { continue }
        if ($line -notmatch '^\s*([^=]+?)\s*=\s*(.*)\s*$') { continue }
        $values[$matches[1].Trim()] = $matches[2].Trim()
    }
    return $values
}

$settings = Read-EnvironmentFile -Path $environmentPath
if (-not $settings.ContainsKey("MYSQL_ROOT_PASSWORD") -or [string]::IsNullOrWhiteSpace($settings["MYSQL_ROOT_PASSWORD"])) {
    throw "MYSQL_ROOT_PASSWORD must be configured in .env. Never print or commit its value."
}

$previousDatabaseEnvironment = @{
    DB_URL = $env:DB_URL
    DB_USERNAME = $env:DB_USERNAME
    DB_PASSWORD = $env:DB_PASSWORD
}

try {
    Invoke-CheckedCommand -Label "Web" -WorkingDirectory (Join-Path $repositoryRoot "prompt-hub-web-frontend") -Executable "npm" -Arguments @("run", "verify")
    Invoke-CheckedCommand -Label "Extension" -WorkingDirectory (Join-Path $repositoryRoot "extension") -Executable "npm" -Arguments @("run", "verify")
    if ($Full) {
        Invoke-CheckedCommand -Label "Web Chromium E2E" -WorkingDirectory (Join-Path $repositoryRoot "prompt-hub-web-frontend") -Executable "npm" -Arguments @("run", "test:e2e")
        Invoke-CheckedCommand -Label "Web Firefox smoke" -WorkingDirectory (Join-Path $repositoryRoot "prompt-hub-web-frontend") -Executable "npm" -Arguments @("run", "test:e2e:firefox")
        Invoke-CheckedCommand -Label "Web production E2E" -WorkingDirectory (Join-Path $repositoryRoot "prompt-hub-web-frontend") -Executable "npm" -Arguments @("run", "test:e2e:prod")
    }

    $env:DB_URL = "jdbc:mysql://127.0.0.1:3306/ttalkak?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true"
    $env:DB_USERNAME = "root"
    $env:DB_PASSWORD = $settings["MYSQL_ROOT_PASSWORD"]
    Invoke-CheckedCommand -Label "Backend" -WorkingDirectory (Join-Path $repositoryRoot "backend") -Executable ".\gradlew.bat" -Arguments @("test", "--no-daemon")
}
finally {
    $env:DB_URL = $previousDatabaseEnvironment.DB_URL
    $env:DB_USERNAME = $previousDatabaseEnvironment.DB_USERNAME
    $env:DB_PASSWORD = $previousDatabaseEnvironment.DB_PASSWORD
}

if ($Full) {
    Write-Host "Full local verification (including E2E) passed."
} else {
    Write-Host "Fast local verification passed. Use -Full to include E2E."
}
