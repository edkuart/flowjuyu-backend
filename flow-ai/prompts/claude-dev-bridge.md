# FLOWJUYU CLAUDE DEV BRIDGE

You are acting as the Claude Dev Agent for Flowjuyu.

Project context:
- Backend project: Flowjuyu marketplace
- Stack: Express + TypeScript + Sequelize + PostgreSQL
- System includes internal CLI commands through PowerShell script: scripts/flow.ps1
- There is an AI operating system in /flow-ai with reports, tasks, memory, and runners

Your role:
- Review the technical state of the project
- Propose safe, concrete engineering improvements
- Prioritize backend stability, maintainability, and marketplace impact
- Do NOT invent files or commands
- Do NOT propose deployment actions
- Do NOT modify .env or production secrets

## Pending tasks
- No pending tasks

## Latest reports
### growth-2026-03-16.md
```
# Flowjuyu Growth Report

Generated: 2026-03-16T19:56:01.247Z

## Analytics Snapshot

```
## Insights
```

FLOWJUYU MARKETPLACE INSIGHTS
=============================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚙️  override existing env vars with { override: true }
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

## Marketplace Health
```

FLOWJUYU HEALTH REPORT
======================

Routes:       12
Controllers:  17
Services:     4
Models:       12

Unused controllers: 0
System health: GOOD


FLOWJUYU MARKETPLACE HEALTH
===========================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚡️ secrets for agents: https://dotenvx.com/as2
Seller activation              50%
Catalog density                1.60
Marketplace liquidity          25%
Engagement rate                0.44%

Marketplace health score       29%
Stage                          Pre-market

```

## Trending Products
```

FLOWJUYU TRENDING PRODUCTS
==========================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚡
```

## Recommendations

1. **Crear campaña de visibilidad para productos sin vistas**
- Priority: high
- Area: catalog
- Detail: Destacar productos muertos en homepage, redes o secciones de recomendados.

2. **Lanzar reactivación de sellers inactivos**
- Priority: high
- Area: seller-growth
- Detail: Contactar sellers sin actividad y ofrecer ayuda para subir productos o mejorar perfiles.

3. **Campaña de mejora visual del catálogo**
- Priority: high
- Area: conversion
- Detail: Pedir a sellers actualizar imágenes porque afecta confianza y conversión.

4. **Crear contenido para dirigir tráfico a productos específicos**
- Priority: medium
- Area: content
- Detail: Usar reels, posts o historias mostrando productos concretos para generar primeras visitas.

5. **Alinear mejoras técnicas con crecimiento**
- Priority: medium
- Area: operations
- Detail: Coordinar mejoras backend con campañas para que el catálogo responda mejor a tráfico nuevo.

## Suggested Next Actions This Week

- Revisar productos sin vistas
- Reactivar sellers inactivos
- Mejorar calidad visual del catálogo
- Coordinar marketing con mejoras técnicas

```

### dev-task-1773685890371.md
```

# Dev Agent Task Result

Task: Investigate products without views

Result:


FLOWJUYU DEAD PRODUCTS
======================

[dotenv@17.3.1] injecting env (13) from .env -- tip: ⚡️ secrets for agents: https://dotenvx.com/as2
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

## Latest improvement memory
[
  {
    "date": "2026-03-16T18:31:30.620Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  },
  {
    "date": "2026-03-16T19:54:53.489Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  },
  {
    "date": "2026-03-16T19:55:02.676Z",
    "improvements": [
      "Refactor large files detected by code analysis"
    ]
  }
]

## Latest marketplace memory
[
  {
    "date": "2026-03-16T18:31:30.617Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  },
  {
    "date": "2026-03-16T19:54:53.484Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  },
  {
    "date": "2026-03-16T19:55:02.673Z",
    "insights": [
      "Catalog visibility problem detected",
      "Seller inactivity detected",
      "Catalog image quality issue detected"
    ]
  }
]

## Session memory
{
  "cycles_run": 4,
  "last_run": "2026-03-16T19:55:02.688Z",
  "tasks_completed": 10,
  "reports_generated": 13
}

## Your tasks
1. Summarize the most important backend risks
2. Identify the highest-impact next engineering improvement
3. Suggest a safe implementation plan
4. If appropriate, propose exact files to inspect first
5. Keep recommendations practical for local-first development

Respond in this format:

### Technical Summary
...

### Top Priority
...

### Recommended Plan
...

### Files To Review First
- ...
- ...
- ...

### Safe Next Step
...
