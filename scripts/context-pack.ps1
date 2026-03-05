param(
  [string]$Out = "CONTEXT_PACK.md"
)

"# Flowjuyu Context Pack" | Out-File $Out -Encoding utf8

"" | Add-Content $Out
"## Repo tree" | Add-Content $Out
"`" | Add-Content $Out

tree /A |
Select-String -NotMatch "node_modules|.git|.next|dist" |
ForEach-Object { $_.Line } |
Add-Content $Out

"`" | Add-Content $Out

"" | Add-Content $Out
"## package.json" | Add-Content $Out
"`json" | Add-Content $Out
Get-Content package.json | Add-Content $Out
"`" | Add-Content $Out

Write-Host "Context pack generated:"
Write-Host $Out
