param(
    [string]$Out = "CONTEXT_PACK.md"
)

"# Flowjuyu Context Pack" | Out-File $Out -Encoding utf8

Add-Content $Out ""
Add-Content $Out "## Repo tree"

# usar tree ignorando node_modules
$tree = cmd /c "tree /A /F"

foreach ($line in $tree) {

    if ($line -notmatch "node_modules" `
        -and $line -notmatch "\.git" `
        -and $line -notmatch "\.next" `
        -and $line -notmatch "dist") {

        Add-Content $Out $line
    }
}

Add-Content $Out ""
Add-Content $Out "## package.json"

Get-Content package.json | Add-Content $Out

Write-Output ""
Write-Output "Context pack generated:"
Write-Output $Out