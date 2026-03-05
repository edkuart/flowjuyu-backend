param(
    [string]$Command
)

function List-Files($path, $title) {

    Write-Host ""
    Write-Host $title
    Write-Host "----------------"

    Get-ChildItem $path -Include *.ts, *.js -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
            Write-Host $_.Name
        }
}

function Analyze-Backend {

    Write-Host ""
    Write-Host "FLOWJUYU BACKEND ANALYSIS"
    Write-Host "========================="

    List-Files "src/controllers" "Controllers"
    List-Files "src/routes" "Routes"
    List-Files "src/services" "Services"
    List-Files "src/models" "Models"
    List-Files "src/middleware" "Middleware"
    List-Files "src/utils" "Utils"
}

function Flow-Doctor {

    Write-Host ""
    Write-Host "FLOWJUYU HEALTH REPORT"
    Write-Host "======================"

    $files = Get-ChildItem src -Include *.ts -Recurse

    Write-Host ""
    Write-Host "Checking duplicate filenames..."

    $duplicates = $files |
        Where-Object { $_.Name -ne "index.ts" } |
        Group-Object Name |
        Where-Object { $_.Count -gt 1 }

    if ($duplicates) {

        Write-Host ""
        Write-Host "Duplicate files detected:"

        foreach ($dup in $duplicates) {

            Write-Host ""
            Write-Host $dup.Name

            foreach ($file in $dup.Group) {
                Write-Host "   " $file.FullName
            }
        }

    } else {

        Write-Host "No duplicate filenames detected"
    }

    Write-Host ""
    Write-Host "Checking route naming..."

    $routes = Get-ChildItem src/routes -Filter *.ts

    foreach ($route in $routes) {

        if ($route.Name -notlike "*.routes.ts") {

            Write-Host "Non-standard route file:" $route.Name
        }
    }

    Write-Host ""
    Write-Host "Checking controllers without routes..."

    $controllers = Get-ChildItem src/controllers -Filter *.controller.ts

    foreach ($controller in $controllers) {

        $name = $controller.BaseName.Replace(".controller","")

        $match = Select-String -Path src/routes/*.ts -Pattern $name -Quiet

        if (!$match) {

            Write-Host "Possible unused controller:" $controller.Name
        }
    }

    Write-Host ""
    Write-Host "Checking services usage..."

    $services = Get-ChildItem src/services -Filter *.service.ts

    foreach ($service in $services) {

        $name = $service.BaseName.Replace(".service","")

        $match = Select-String -Path src/**/*.ts -Pattern $name -Quiet

        if (!$match) {

            Write-Host "Possible unused service:" $service.Name
        }
    }

    Write-Host ""
    Write-Host "Doctor scan complete"
}

switch ($Command) {

    "context" {

        Write-Host ""
        Write-Host "Generating context pack..."
        Write-Host ""

        .\scripts\context-pack.ps1
    }

    "analyze" {

        Analyze-Backend
    }

    "doctor" {

        Flow-Doctor
    }

    default {

        Write-Host ""
        Write-Host "Flowjuyu CLI"
        Write-Host "------------"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host ""
        Write-Host "flow analyze   -> analyze backend structure"
        Write-Host "flow doctor    -> backend health report"
        Write-Host "flow context   -> generate CONTEXT_PACK.md"
        Write-Host ""
    }
}