[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repositoryRoot ".env"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host "[$Label] 시작"
    Push-Location $WorkingDirectory
    try {
        & $Executable @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label 검증이 종료 코드 $LASTEXITCODE`(으`)로 실패했습니다."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "[$Label] 통과"
}

function Read-EnvironmentFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "로컬 검증에 필요한 .env 파일이 없습니다. .env.example을 참고해 저장소 루트에 생성하세요."
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
    throw ".env에 MYSQL_ROOT_PASSWORD가 설정되어야 합니다. 값은 출력하거나 커밋하지 마세요."
}

$previousDatabaseEnvironment = @{
    DB_URL = $env:DB_URL
    DB_USERNAME = $env:DB_USERNAME
    DB_PASSWORD = $env:DB_PASSWORD
}

try {
    Invoke-CheckedCommand -Label "Web" -WorkingDirectory (Join-Path $repositoryRoot "prompt-hub-web-frontend") -Executable "npm" -Arguments @("run", "verify")
    Invoke-CheckedCommand -Label "Extension" -WorkingDirectory (Join-Path $repositoryRoot "extension") -Executable "npm" -Arguments @("run", "verify")

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

Write-Host "로컬 전체 검증을 통과했습니다."
