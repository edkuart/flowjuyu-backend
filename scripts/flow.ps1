param(
    [string]$Command
)

switch ($Command) {

    "context" {
        Write-Host ""
        Write-Host "Generating context pack..."
        .\scripts\context-pack.ps1
    }

    "analyze" {
        Write-Host ""
        Write-Host "Flowjuyu AI analysis checklist"
        Write-Host "--------------------------------"
        Write-Host "1. Check unused dependencies"
        Write-Host "2. Check dead files"
        Write-Host "3. Check route coverage"
        Write-Host "4. Check controller usage"
        Write-Host ""
        Write-Host "Next step: send CONTEXT_PACK.md to AI agent"
    }

    "spec" {
        Write-Host ""
        Write-Host "Create a new spec:"
        Write-Host "Example:"
        Write-Host "New-Item specs\my-feature.md"
    }

    default {
        Write-Host ""
        Write-Host "Flow CLI"
        Write-Host "Commands:"
        Write-Host "flow context"
        Write-Host "flow analyze"
        Write-Host "flow spec"
    }
}