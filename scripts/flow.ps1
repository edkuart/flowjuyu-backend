param(
    [string]$Command
)

function Analyze-Backend {

    Write-Host ""
    Write-Host "FLOWJUYU BACKEND ANALYSIS"
    Write-Host "-------------------------"

    Write-Host ""
    Write-Host "Controllers:"
    Get-ChildItem src/controllers -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name

    Write-Host ""
    Write-Host "Routes:"
    Get-ChildItem src/routes -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name

    Write-Host ""
    Write-Host "Services:"
    Get-ChildItem src/services -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name

    Write-Host ""
    Write-Host "Models:"
    Get-ChildItem src/models -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name

    Write-Host ""
    Write-Host "Middleware:"
    Get-ChildItem src/middleware -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name

    Write-Host ""
    Write-Host "Utils:"
    Get-ChildItem src/utils -Filter *.ts -ErrorAction SilentlyContinue |
        Select-Object Name
}

switch ($Command) {

    "context" {
        .\scripts\context-pack.ps1
    }

    "analyze" {
        Analyze-Backend
    }

    default {
        Write-Host ""
        Write-Host "Flow CLI"
        Write-Host "Commands:"
        Write-Host "flow context"
        Write-Host "flow analyze"
    }
}