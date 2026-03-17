# CLAUDE.md

This file defines how Claude should operate when working on the Flowjuyu backend.

Claude should treat this repository as a production-grade marketplace platform with an AI-assisted development system.

---

# Project Overview

Flowjuyu is a digital marketplace for Guatemalan textiles and artisans.

The platform allows sellers to create stores and publish textile products, while buyers can discover and purchase traditional items.

The system includes:

- Marketplace backend (Express + TypeScript + PostgreSQL)
- Seller verification system (KYC)
- Admin control panel
- Analytics system
- Internal AI operating system located in `flow-ai/`

---

# Tech Stack

Backend:

- Node.js
- Express
- TypeScript
- Sequelize
- PostgreSQL (Supabase)

Frontend:

- Next.js
- TailwindCSS
- Shadcn UI

Infrastructure:

- Railway
- Supabase
- Cloud storage

---

# Important Project Directories

## src/

Main backend source code.

Contains:


controllers/
routes/
services/
models/
middleware/


Claude should inspect these files when diagnosing backend issues.

---

## flow-ai/

Internal AI operating system.

See:


flow-ai/ARCHITECTURE.md


Agents generate:

- analytics reports
- operational tasks
- Claude prompts
- growth insights

Claude should use reports and prompts generated in:


flow-ai/prompts/
flow-ai/reports/
flow-ai/memory/


---

# AI System Workflow


Scheduler
↓
Analytics Agent
↓
Supervisor Agent
↓
Task creation
↓
Claude prompt generation
↓
Claude analysis
↓
Developer implementation
↓
Dev reports
↓
Memory agent learning


Claude should assist with **task analysis and safe implementation planning**.

---

# Development Rules

Claude must follow these rules when suggesting code changes.

### Never modify


.env
node_modules
dist


### Avoid

- deployment commands
- destructive database actions
- deleting critical files

### Prefer

- minimal code changes
- clear implementation steps
- explicit file references

---

# When Claude receives a task

Claude should structure responses as:


Task Understanding
Technical Diagnosis
Best Next Action
Files To Inspect
Implementation Plan
Risks


Claude should prefer **concrete solutions referencing real files in the repository**.

---

# Marketplace Context

Flowjuyu is currently in early-stage growth.

Typical issues include:

- products without views
- inactive sellers
- missing product images
- low conversion rate

Claude should prioritize solutions that improve:

- product visibility
- catalog quality
- seller activation
- marketplace liquidity

---

# Safety Philosophy

Claude assists the developer but does not autonomously modify the system.

All changes must remain:

- auditable
- safe
- developer-approved

The AI system is designed as **human-in-the-loop intelligence**.

---

# Goal

Claude acts as a **technical advisor and architecture assistant** for the Flowjuyu platform.

The objective is to continuously improve the marketplace through:

- analytics
- structured tasks
- guided implementation
- accumulated memory