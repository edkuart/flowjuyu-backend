param(
    [string]$Command,
    [string]$Name
)

$src = "src"

# --------------------------------------------------
# LIST FILES
# --------------------------------------------------

function List-Files($path, $title) {

    Write-Host ""
    Write-Host $title
    Write-Host "----------------"

    Get-ChildItem $path -Include *.ts, *.js -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
            Write-Host $_.Name
        }
}

# --------------------------------------------------
# ANALYZE BACKEND
# --------------------------------------------------

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

# --------------------------------------------------
# ARCHITECTURE MAP
# --------------------------------------------------

function Map-System {

    Write-Host ""
    Write-Host "FLOWJUYU ARCHITECTURE MAP"
    Write-Host "========================="
    Write-Host ""

    $routes = Get-ChildItem "src/routes" -Filter *.ts

    foreach ($route in $routes) {

        Write-Host $route.Name

        $controllers = @{}

        $content = Get-Content $route.FullName

        foreach ($line in $content) {

            if ($line -match "\.\./controllers/([a-zA-Z0-9\.\-]+)\.controller") {

                $name = $Matches[1] + ".controller.ts"
                $controllers[$name] = $true
            }
        }

        foreach ($c in $controllers.Keys) {
            Write-Host "   → $c"
        }

        Write-Host ""
    }
}

# --------------------------------------------------
# LIST ENDPOINTS
# --------------------------------------------------

function List-Endpoints {

    Write-Host ""
    Write-Host "FLOWJUYU ENDPOINTS"
    Write-Host "=================="
    Write-Host ""

    $routes = Get-ChildItem "src/routes" -Filter *.ts

    foreach ($route in $routes) {

        Write-Host $route.Name
        Write-Host "--------------"

        $content = Get-Content $route.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            'router\.(get|post|put|patch|delete)\s*\(\s*["'']([^"'']+)["'']'
        )

        foreach ($match in $matches) {

            $method = $match.Groups[1].Value.ToUpper()
            $path = $match.Groups[2].Value

            Write-Host ("{0,-7} {1}" -f $method, $path)
        }

        Write-Host ""
    }
}

# --------------------------------------------------
# FLOW DOCTOR
# --------------------------------------------------

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

# --------------------------------------------------
# GRAPH GENERATOR
# --------------------------------------------------

function Generate-Graph {

    Write-Host ""
    Write-Host "Generating architecture graph..."
    Write-Host ""

    $output = @()
    $output += '```mermaid'
    $output += "flowchart TD"
    $output += ""

    $routes = Get-ChildItem "src/routes" -Filter *.ts

    foreach ($route in $routes) {

        $routeName = $route.BaseName

        $content = Get-Content $route.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            '\.\./controllers/([a-zA-Z0-9\.\-]+)\.controller'
        )

        foreach ($match in $matches) {

            $controller = $match.Groups[1].Value

            $output += "$routeName --> $controller"
        }
    }

    $controllers = Get-ChildItem "src/controllers" -Filter *.ts

    foreach ($controllerFile in $controllers) {

        $controller = $controllerFile.BaseName

        $content = Get-Content $controllerFile.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            '\.\./services/([a-zA-Z0-9\.\-]+)\.service'
        )

        foreach ($match in $matches) {

            $service = $match.Groups[1].Value

            $output += "$controller --> $service"
        }

        $modelMatches = [regex]::Matches(
            $content,
            '\.\./models/([a-zA-Z0-9\.\-]+)'
        )

        foreach ($match in $modelMatches) {

            $model = $match.Groups[1].Value

            $output += "$controller --> $model"
        }
    }

    $output += '```'

    $output | Set-Content "ARCHITECTURE_GRAPH.md"

    Write-Host "Graph generated: ARCHITECTURE_GRAPH.md"
}

function System-Stats {

    Write-Host ""
    Write-Host "FLOWJUYU SYSTEM REPORT"
    Write-Host "======================"
    Write-Host ""

    $routes = (Get-ChildItem src/routes -Filter *.ts).Count
    $controllers = (Get-ChildItem src/controllers -Filter *.ts).Count
    $services = (Get-ChildItem src/services -Filter *.ts).Count
    $models = (Get-ChildItem src/models -Filter *.ts).Count
    $middleware = (Get-ChildItem src/middleware -Filter *.ts).Count

    # contar endpoints
    $endpointCount = 0
    $routeFiles = Get-ChildItem src/routes -Filter *.ts

    foreach ($route in $routeFiles) {

        $content = Get-Content $route.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            'router\.(get|post|put|patch|delete)\s*\('
        )

        $endpointCount += $matches.Count
    }

    Write-Host ("Routes:        {0}" -f $routes)
    Write-Host ("Controllers:   {0}" -f $controllers)
    Write-Host ("Services:      {0}" -f $services)
    Write-Host ("Models:        {0}" -f $models)
    Write-Host ("Middleware:    {0}" -f $middleware)
    Write-Host ("Endpoints:     {0}" -f $endpointCount)
    Write-Host ""

    # evaluación simple
    if ($controllers -gt 0 -and $routes -gt 0) {

        Write-Host "Architecture Health: GOOD"
    }
    else {

        Write-Host "Architecture Health: NEEDS REVIEW"
    }

    Write-Host ""
}

function Security-Audit {

    Write-Host ""
    Write-Host "FLOWJUYU SECURITY REPORT"
    Write-Host "========================"
    Write-Host ""

    $routes = Get-ChildItem src/routes -Filter *.ts

    foreach ($route in $routes) {

        $content = Get-Content $route.FullName -Raw

        $endpointMatches = [regex]::Matches(
            $content,
            'router\.(get|post|put|patch|delete)\s*\(\s*["'']([^"'']+)["'']'
        )

        foreach ($match in $endpointMatches) {

            $method = $match.Groups[1].Value.ToUpper()
            $path = $match.Groups[2].Value

            # revisar si hay auth en el archivo
            $hasAuth = $content -match "verifyToken|authMiddleware|requireRole"

            if (-not $hasAuth) {

                Write-Host "⚠ Route without auth middleware:"
                Write-Host "$method $path"
                Write-Host ""
            }

            # detectar uploads
            if ($match.Line -match "upload|multer") {

    		Write-Host "⚠ Upload endpoint:"
    		Write-Host "$method $path"
	    }

            # detectar endpoints public seller
            if ($path -match "seller|vendedor") {

                Write-Host "⚠ Possible public seller endpoint:"
                Write-Host "$method $path"
                Write-Host ""
            }

        }
    }

    Write-Host "Security scan complete"
    Write-Host ""
}

function Generate-Docs {

    Write-Host ""
    Write-Host "Generating API documentation..."
    Write-Host ""

    $output = @()
    $output += "# FLOWJUYU API REFERENCE"
    $output += ""

    $routes = Get-ChildItem src/routes -Filter *.ts

    foreach ($route in $routes) {

        $output += "## $($route.Name)"
        $output += ""

        $content = Get-Content $route.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            'router\.(get|post|put|patch|delete)\s*\(\s*["'']([^"'']+)["'']'
        )

        foreach ($match in $matches) {

            $method = $match.Groups[1].Value.ToUpper()
            $path = $match.Groups[2].Value

            $output += "- **$method** $path"
        }

        $output += ""
    }

    $output | Set-Content "API_REFERENCE.md"

    Write-Host "API_REFERENCE.md generated"
    Write-Host ""
}

function Find-Unused {

    Write-Host ""
    Write-Host "FLOWJUYU UNUSED CODE REPORT"
    Write-Host "==========================="
    Write-Host ""

    $controllers = Get-ChildItem src/controllers -Filter *.controller.ts

    foreach ($controller in $controllers) {

        $name = $controller.BaseName.Replace(".controller","")

        $used = Select-String -Path src/routes/*.ts -Pattern $name -Quiet

        if (-not $used) {

            Write-Host "Unused controller:"
            Write-Host $controller.Name
            Write-Host ""
        }
    }

    $services = Get-ChildItem src/services -Filter *.service.ts

    foreach ($service in $services) {

        $name = $service.BaseName.Replace(".service","")

        $used = Select-String -Path src/**/*.ts -Pattern $name -Quiet

        if (-not $used) {

            Write-Host "Unused service:"
            Write-Host $service.Name
            Write-Host ""
        }
    }

    Write-Host "Scan complete"
}

function Detect-RouteConflicts {

    Write-Host ""
    Write-Host "FLOWJUYU ROUTE CONFLICT REPORT"
    Write-Host "=============================="
    Write-Host ""

    $allRoutes = @()

    $routes = Get-ChildItem src/routes -Filter *.ts

    foreach ($route in $routes) {

        $content = Get-Content $route.FullName -Raw

        $matches = [regex]::Matches(
            $content,
            'router\.(get|post|put|patch|delete)\s*\(\s*["'']([^"'']+)["'']'
        )

        foreach ($match in $matches) {

            $method = $match.Groups[1].Value.ToUpper()
            $path = $match.Groups[2].Value

            $allRoutes += "$method $path"
        }
    }

    $duplicates = $allRoutes | Group-Object | Where-Object { $_.Count -gt 1 }

    if ($duplicates) {

        Write-Host "Duplicate routes detected:"
        Write-Host ""

        foreach ($dup in $duplicates) {

            Write-Host $dup.Name
        }

    } else {

        Write-Host "No route conflicts detected"
    }

    Write-Host ""
}

function Show-Domains {

    Write-Host ""
    Write-Host "FLOWJUYU DOMAINS"
    Write-Host "================"
    Write-Host ""

    $routes = Get-ChildItem src/routes -Filter *.ts

    $domains = @{
        "Auth" = @()
        "Catalog" = @()
        "Buyer" = @()
        "Seller" = @()
        "Admin" = @()
        "Analytics" = @()
        "Other" = @()
    }

    foreach ($route in $routes) {

        $name = $route.Name.ToLower()

        if ($name -match "auth") {
            $domains["Auth"] += $route.Name
        }
        elseif ($name -match "product|public|categor") {
            $domains["Catalog"] += $route.Name
        }
        elseif ($name -match "buyer") {
            $domains["Buyer"] += $route.Name
        }
        elseif ($name -match "seller") {
            $domains["Seller"] += $route.Name
        }
        elseif ($name -match "admin") {
            $domains["Admin"] += $route.Name
        }
        elseif ($name -match "analytics") {
            $domains["Analytics"] += $route.Name
        }
        else {
            $domains["Other"] += $route.Name
        }
    }

    foreach ($domain in $domains.Keys) {

        if ($domains[$domain].Count -gt 0) {

            Write-Host $domain
            foreach ($file in $domains[$domain]) {
                Write-Host "  $file"
            }
            Write-Host ""
        }
    }
}

function System-Health {

    Write-Host ""
    Write-Host "FLOWJUYU HEALTH REPORT"
    Write-Host "======================"
    Write-Host ""

    $routes = (Get-ChildItem src/routes -Filter *.ts).Count
    $controllers = (Get-ChildItem src/controllers -Filter *.ts).Count
    $services = (Get-ChildItem src/services -Filter *.ts).Count
    $models = (Get-ChildItem src/models -Filter *.ts).Count

    Write-Host ("Routes:       {0}" -f $routes)
    Write-Host ("Controllers:  {0}" -f $controllers)
    Write-Host ("Services:     {0}" -f $services)
    Write-Host ("Models:       {0}" -f $models)
    Write-Host ""

    $unusedControllers = 0

    $controllersList = Get-ChildItem src/controllers -Filter *.controller.ts

    foreach ($controller in $controllersList) {

        $name = $controller.BaseName.Replace(".controller","")

        $used = Select-String -Path src/routes/*.ts -Pattern $name -Quiet

        if (-not $used) {
            $unusedControllers++
        }
    }

    Write-Host ("Unused controllers: {0}" -f $unusedControllers)

    if ($unusedControllers -eq 0) {
        Write-Host "System health: GOOD"
    }
    else {
        Write-Host "System health: REVIEW NEEDED"
    }

    Write-Host ""
}

function Make-Module {

    param($module)

    if (-not $module) {
        Write-Host "Usage: flow make <module-name>"
        return
    }

    $controller = "src/controllers/$module.controller.ts"
    $service = "src/services/$module.service.ts"
    $route = "src/routes/$module.routes.ts"
    $model = "src/models/$module.model.ts"

    New-Item $controller -ItemType File -Force
    New-Item $service -ItemType File -Force
    New-Item $route -ItemType File -Force
    New-Item $model -ItemType File -Force

    Write-Host ""
    Write-Host "Module created:"
    Write-Host $controller
    Write-Host $service
    Write-Host $route
    Write-Host $model
    Write-Host ""
}

# =====================================================
# FLOWJUYU MARKETPLACE INSIGHTS
# =====================================================

function Flow-Insights {

    Write-Host ""
    Write-Host "FLOWJUYU MARKETPLACE INSIGHTS"
    Write-Host "============================="
    Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function run(){

const queries = [

{ name: "Products total", sql: "SELECT COUNT(*) FROM productos" },

{ name: "Products without images", sql: "SELECT COUNT(*) FROM productos WHERE imagen_url IS NULL" },

{ name: "Products without views", sql: "SELECT COUNT(*) FROM productos p LEFT JOIN product_views v ON p.id = v.product_id WHERE v.product_id IS NULL" },

{ name: "Total sellers", sql: "SELECT COUNT(*) FROM vendedor_perfil" },

{ name: "Inactive sellers", sql: "SELECT COUNT(*) FROM vendedor_perfil WHERE estado_admin != 'activo'" },

{ name: "Sellers without products", sql: "SELECT COUNT(*) FROM vendedor_perfil vp WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.vendedor_id = vp.id)" },

{ name: "Product views", sql: "SELECT COUNT(*) FROM product_views" },

{ name: "Purchase intentions", sql: "SELECT COUNT(*) FROM purchase_intentions" },

{ name: "Reviews", sql: "SELECT COUNT(*) FROM reviews" }

]

for(const q of queries){
try{
const r = await pool.query(q.sql)
console.log(q.name.padEnd(30), r.rows[0].count)
}catch(e){
console.log(q.name.padEnd(30), "error")
}
}

process.exit()

}

run()
"@

$tmp = "scripts/tmp-flow-insights.js"
$script | Set-Content $tmp
node $tmp
Remove-Item $tmp

}

# =====================================================
# FLOWJUYU CATALOG HEALTH
# =====================================================

function Flow-Catalog {

Write-Host ""
Write-Host "FLOWJUYU CATALOG HEALTH"
Write-Host "======================="
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const totalProducts = await pool.query("SELECT COUNT(*) FROM productos")
const withImages = await pool.query("SELECT COUNT(*) FROM productos WHERE imagen_url IS NOT NULL")
const withRatings = await pool.query("SELECT COUNT(*) FROM productos WHERE rating_count > 0")
const withViews = await pool.query("SELECT COUNT(DISTINCT product_id) FROM product_views")

console.log("Products total".padEnd(30), totalProducts.rows[0].count)
console.log("Products with images".padEnd(30), withImages.rows[0].count)
console.log("Products with ratings".padEnd(30), withRatings.rows[0].count)
console.log("Products with views".padEnd(30), withViews.rows[0].count)

process.exit()

}

run()
"@

$tmp = "scripts/tmp-flow-catalog.js"
$script | Set-Content $tmp
node $tmp
Remove-Item $tmp

}

# =====================================================
# FLOWJUYU FOUNDER DASHBOARD
# =====================================================

function Flow-Founders {

Write-Host ""
Write-Host "FLOWJUYU FOUNDER DASHBOARD"
Write-Host "=========================="
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const sellers = await pool.query("SELECT COUNT(*) FROM vendedor_perfil")
const products = await pool.query("SELECT COUNT(*) FROM productos")

const sellersWithProducts = await pool.query(
"SELECT COUNT(DISTINCT vendedor_id) FROM productos"
)

const views = await pool.query("SELECT COUNT(*) FROM product_views")
const intentions = await pool.query("SELECT COUNT(*) FROM purchase_intentions")
const reviews = await pool.query("SELECT COUNT(*) FROM reviews")

const totalSellers = parseInt(sellers.rows[0].count)
const activeSellers = parseInt(sellersWithProducts.rows[0].count)

const activationRate = totalSellers === 0 ? 0 :
Math.round((activeSellers / totalSellers) * 100)

console.log("Sellers".padEnd(30), totalSellers)
console.log("Products".padEnd(30), products.rows[0].count)
console.log("Active sellers".padEnd(30), activeSellers)
console.log("Seller activation rate".padEnd(30), activationRate + "%")

console.log("")
console.log("Product views".padEnd(30), views.rows[0].count)
console.log("Purchase intentions".padEnd(30), intentions.rows[0].count)
console.log("Reviews".padEnd(30), reviews.rows[0].count)

process.exit()

}

run()
"@

$tmp = "scripts/tmp-flow-founders.js"
$script | Set-Content $tmp
node $tmp
Remove-Item $tmp

}

function Flow-Deps {

    Write-Host ""
    Write-Host "FLOWJUYU DEPENDENCIES"
    Write-Host "====================="
    Write-Host ""

    $package = Get-Content package.json | ConvertFrom-Json

    Write-Host "Dependencies"
    Write-Host "------------"

    foreach ($dep in $package.dependencies.PSObject.Properties) {

        Write-Host ("{0,-30} {1}" -f $dep.Name, $dep.Value)

    }

    Write-Host ""

    Write-Host "Dev Dependencies"
    Write-Host "----------------"

    foreach ($dep in $package.devDependencies.PSObject.Properties) {

        Write-Host ("{0,-30} {1}" -f $dep.Name, $dep.Value)

    }

    Write-Host ""
}

function Flow-Metrics {

    Write-Host ""
    Write-Host "FLOWJUYU CODE METRICS"
    Write-Host "====================="
    Write-Host ""

    $files = Get-ChildItem src -Include *.ts -Recurse

    $totalLines = 0

    foreach ($file in $files) {

        $lines = (Get-Content $file.FullName).Count
        $totalLines += $lines
    }

    Write-Host ("Total files: {0}" -f $files.Count)
    Write-Host ("Total lines: {0}" -f $totalLines)
    Write-Host ""

    $largest = $files |
        Sort-Object { (Get-Content $_.FullName).Count } -Descending |
        Select-Object -First 5

    Write-Host "Largest files"
    Write-Host "-------------"

    foreach ($f in $largest) {

        $lines = (Get-Content $f.FullName).Count

        Write-Host ("{0,-35} {1}" -f $f.Name, $lines)

    }

    Write-Host ""
}

# =====================================================
# FLOWJUYU MARKETPLACE HEALTH
# =====================================================

function Flow-Health {

Write-Host ""
Write-Host "FLOWJUYU MARKETPLACE HEALTH"
Write-Host "==========================="
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const sellers = await pool.query("SELECT COUNT(*) FROM vendedor_perfil")
const products = await pool.query("SELECT COUNT(*) FROM productos")

const activeSellers = await pool.query(
"SELECT COUNT(DISTINCT vendedor_id) FROM productos"
)

const productsWithImages = await pool.query(
"SELECT COUNT(*) FROM productos WHERE imagen_url IS NOT NULL"
)

const productsWithViews = await pool.query(
"SELECT COUNT(DISTINCT product_id) FROM product_views"
)

const views = await pool.query(
"SELECT COUNT(*) FROM product_views"
)

const intentions = await pool.query(
"SELECT COUNT(*) FROM purchase_intentions"
)

const totalSellers = parseInt(sellers.rows[0].count)
const totalProducts = parseInt(products.rows[0].count)
const sellersActive = parseInt(activeSellers.rows[0].count)
const images = parseInt(productsWithImages.rows[0].count)
const viewedProducts = parseInt(productsWithViews.rows[0].count)
const totalViews = parseInt(views.rows[0].count)
const totalIntentions = parseInt(intentions.rows[0].count)

const activationRate = totalSellers === 0 ? 0 :
Math.round((sellersActive / totalSellers) * 100)

const catalogDensity = totalSellers === 0 ? 0 :
(totalProducts / totalSellers).toFixed(2)

const liquidity = totalProducts === 0 ? 0 :
Math.round((viewedProducts / totalProducts) * 100)

const engagement = totalViews === 0 ? 0 :
((totalIntentions / totalViews) * 100).toFixed(2)

console.log("Seller activation".padEnd(30), activationRate + "%")
console.log("Catalog density".padEnd(30), catalogDensity)
console.log("Marketplace liquidity".padEnd(30), liquidity + "%")
console.log("Engagement rate".padEnd(30), engagement + "%")

let score = Math.round(
(activationRate * 0.35) +
(liquidity * 0.25) +
(Math.min(catalogDensity * 10,100) * 0.20) +
(Math.min(engagement * 20,100) * 0.20)
)

console.log("")
console.log("Marketplace health score".padEnd(30), score + "%")

if(score < 30) console.log("Stage".padEnd(30), "Pre-market")
else if(score < 50) console.log("Stage".padEnd(30), "Bootstrap")
else if(score < 70) console.log("Stage".padEnd(30), "Early Growth")
else if(score < 90) console.log("Stage".padEnd(30), "Scaling")
else console.log("Stage".padEnd(30), "Mature")

process.exit()

}

run()
"@

$tmp = "scripts/tmp-flow-health.js"
$script | Set-Content $tmp
node $tmp
Remove-Item $tmp

}

function Flow-Trending {

Write-Host ""
Write-Host "FLOWJUYU TRENDING PRODUCTS"
Write-Host "=========================="
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const q = await pool.query(
'SELECT p.nombre, COUNT(v.id) as views \
FROM product_views v \
JOIN productos p ON p.id = v.product_id \
WHERE v.created_at > NOW() - interval \'7 days\' \
GROUP BY p.nombre \
ORDER BY views DESC \
LIMIT 10'
)

console.log("")
console.log("Trending products")
console.log("-----------------")

q.rows.forEach(p=>{
console.log(p.nombre.padEnd(40),p.views)
})

process.exit()

}

run()
"@

$tmp = "scripts/tmp-trending.js"
$script | Set-Content $tmp

node $tmp

Remove-Item $tmp

}

function Flow-Sellers {

Write-Host ""
Write-Host "FLOWJUYU SELLER PRODUCTIVITY"
Write-Host "============================"
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const q = await pool.query(
'SELECT v.nombre_comercio, COUNT(p.id) as products \
FROM vendedor_perfil v \
LEFT JOIN productos p ON v.user_id = p.vendedor_id \
GROUP BY v.nombre_comercio \
ORDER BY products DESC'
)

console.log("Seller productivity")
console.log("-------------------")

q.rows.forEach(s=>{
console.log(s.nombre_comercio.padEnd(35),s.products)
})

process.exit()

}

run()
"@

$tmp = "scripts/tmp-sellers.js"

$script | Set-Content $tmp

node $tmp

Remove-Item $tmp

}

function Flow-DeadProducts {

Write-Host ""
Write-Host "FLOWJUYU DEAD PRODUCTS"
Write-Host "======================"
Write-Host ""

$script = @"
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl:{ rejectUnauthorized:false }
})

async function run(){

const q = await pool.query(
'SELECT p.nombre \
FROM productos p \
LEFT JOIN product_views v ON p.id = v.product_id \
WHERE v.id IS NULL'
)

console.log("Products with zero views")
console.log("------------------------")

q.rows.forEach(p=>{
console.log(p.nombre)
})

console.log("")
console.log("Total:", q.rows.length)

process.exit()

}

run()
"@

$tmp = "scripts/tmp-dead-products.js"

$script | Set-Content $tmp

node $tmp

Remove-Item $tmp

}

# --------------------------------------------------
# CLI SWITCH
# --------------------------------------------------

switch ($Command) {

    "context" {
        .\scripts\context-pack.ps1
    }

    "analyze" {
        Analyze-Backend
    }

    "doctor" {
        Flow-Doctor
    }

    "map" {
        Map-System
    }

    "endpoints" {
        List-Endpoints
    }

    "graph" {
        Generate-Graph
    }

    "stats" {
    	System-Stats
    }

    "security" {
    	Security-Audit
    }

    "docs" {
    	Generate-Docs
    }

    "unused" {
    	Find-Unused
    }

    "routes-conflicts" {
    	Detect-RouteConflicts
    }

    "domains" {
   	 Show-Domains
    }

    "health" {
    	System-Health
    }

    "make" {
   	 Make-Module $Name
    }

    "insights" {
    	Flow-Insights
    }

    "deps" {
    	Flow-Deps
    }

    "metrics" {
    	Flow-Metrics
    }

    "catalog" {
   	 Flow-Catalog
    }

    "founders" {
    	Flow-Founders
    }

    "health" { 
	Flow-Health 
    }

    "trending" { 
	Flow-Trending 
    }

    "sellers" { 
	Flow-Sellers 
    }

    "dead-products" { 
	Flow-DeadProducts 
    }

    default {

        Write-Host ""
        Write-Host "Flowjuyu CLI"
        Write-Host "------------"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host ""
        Write-Host "flow analyze    -> analyze backend structure"
        Write-Host "flow doctor     -> backend health report"
        Write-Host "flow map        -> show architecture map"
        Write-Host "flow endpoints  -> list all API endpoints"
        Write-Host "flow graph      -> generate architecture diagram"
        Write-Host "flow context    -> generate CONTEXT_PACK.md"
        Write-Host ""
	Write-Host "flow stats      -> backend system report"
	Write-Host "flow security   -> security audit"
	Write-Host "flow docs            -> generate API documentation"
	Write-Host "flow unused          -> detect unused code"
	Write-Host "flow routes-conflicts-> detect duplicate routes"
	Write-Host "domains          -> show backend domains"
	Write-Host "health           -> system health report"
	Write-Host "make <name>      -> create module"
	Write-Host "insights         -> marketplace insights"
	Write-Host "deps             -> project dependencies"
	Write-Host "metrics          -> code metrics"
	Write-Host "flow catalog       -> catalog health"
	Write-Host "flow founders      -> founder dashboard metrics"
	Write-Host " health"
	Write-Host "Available commands:"
    }
}