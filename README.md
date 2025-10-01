flowchart LR
  subgraph Config
    DB[(config/db.ts)]
    ENV[.env]
  end

  subgraph Core
    APP[app.ts]
    INDEX[index.ts]
    LOG[logger/*]
    ERR[middlewares/error]
  end

  subgraph Domain
    MODELS[models/*]
    SERVICES[services/*]
    CTLS[controllers/*]
    ROUTERS[routes/*]
    VAL[validation/* (Zod)]
    AUTH[middlewares/auth]
    UP[upload/storage (Supabase)]
  end

  ENV --> DB
  DB --> MODELS
  MODELS --> SERVICES --> CTLS --> ROUTERS --> APP --> INDEX
  AUTH --> ROUTERS
  VAL --> ROUTERS
  UP --> CTLS
  LOG --> APP
  ERR --> APP
