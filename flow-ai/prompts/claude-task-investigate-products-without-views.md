# FLOWJUYU CLAUDE TASK EXPORT

You are acting as the Claude Dev Agent for Flowjuyu.

## Project Context
- Project: Flowjuyu backend
- Stack: Express + TypeScript + Sequelize + PostgreSQL
- Local-first development
- Internal AI OS exists in /flow-ai
- Internal diagnostic tools are executed through PowerShell script: scripts/flow.ps1

## Task To Work On
Task ID: task-manual-001
Title: Investigate products without views
Priority: high
Status: pending
Description: Analyze why many products have no views and propose safe backend or catalog visibility improvements.

## Recent Reports
### dev-task-1773678428150.md
```

# Dev Agent Task Result

Task: Products missing images

Result:


FLOWJUYU MARKETPLACE INSIGHTS
=============================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚡️ secrets for agents: https://dotenvx.com/as2
Products total                 16
Products without images        2
Products without views         12
Total sellers                  10
Inactive sellers               7
Sellers without products       10
Product views                  451
Purchase intentions            2
Reviews                        2


```

### dev-task-1773678425999.md
```

# Dev Agent Task Result

Task: Review inactive sellers

Result:


FLOWJUYU SELLER PRODUCTIVITY
============================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }
Seller productivity
-------------------
Artesanias Test                     2
Tienda Prueba 123                   2
Edwart's Market 01                  0
Tienda Demo                         0
Comercio Demo KYC 2                 0
Tienda Test                         0
DPI prueba                          0
Tienda PowerShell                   0
Edwart's Market 02                  0
Comercio Demo KYC                   0


```

### dev-task-1773678424741.md
```

# Dev Agent Task Result

Task: Investigate products without views

Result:


FLOWJUYU DEAD PRODUCTS
======================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚙️  enable debug logging with { debug: true }
Products with zero views
------------------------
PruebaK
que hueva 
huipil rosa
collar ceremonial
admin21
prueba
anillo
zapato
anillo
asdas
anillo rojo
Cinta maya

Total: 12


```

## Recent Improvement Memory
[
  {
    "date": "2026-03-16T16:39:34.035Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  },
  {
    "date": "2026-03-16T16:44:03.759Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  },
  {
    "date": "2026-03-16T16:44:14.089Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  }
]

## Recent Marketplace Memory
[
  {
    "date": "2026-03-16T16:39:34.032Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  },
  {
    "date": "2026-03-16T16:44:03.756Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  },
  {
    "date": "2026-03-16T16:44:14.086Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  }
]

## Session Memory
{
  "cycles_run": 1,
  "last_run": "2026-03-16T16:44:14.100Z",
  "tasks_completed": 9,
  "reports_generated": 11
}

## Instructions
1. Focus only on this task
2. Do not propose deployment actions
3. Do not modify secrets or .env files
4. Prefer safe local-first improvements
5. Be concrete and practical
6. If code changes are needed, identify the most likely files to inspect first
7. If the task is more product/business than code, explain the best operational next step

## Response Format
### Task Understanding
...

### Technical or Operational Diagnosis
...

### Best Next Action
...

### Files To Inspect First
- ...
- ...
- ...

### Safe Implementation Plan
1. ...
2. ...
3. ...

### Risks
- ...
