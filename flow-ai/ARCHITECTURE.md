# Flowjuyu AI Operating System

This folder contains the internal AI operating system used to analyze, monitor and improve the Flowjuyu marketplace.

The system is designed as a **human-in-the-loop AI architecture** where autonomous agents gather data, generate reports and tasks, and Claude assists the developer with decision making and improvements.

---

# Core Philosophy

The AI system does NOT autonomously modify the production codebase.

Instead it:

1. Collects data about the marketplace
2. Detects problems
3. Generates tasks
4. Prepares structured prompts
5. Claude assists the developer in solving them

This ensures safety, transparency and developer control.

---

# System Architecture


Scheduler
↓
Daily Cycle
↓
Analytics Agent
↓
Supervisor Agent
↓
Task Creation
↓
Claude Task Exporter
↓
Claude Code (Developer interaction)
↓
Implementation
↓
Dev Reports
↓
Memory Agent
↓
Growth Agent


---

# Folder Structure

## agents/

Contains utility modules used by runners.

Files:

- **claude-worker.js**
  - Scans `tasks/inbox/` for pending tasks
  - Exports minimal prompt files per task
  - Not called by the daily cycle — used as a standalone utility

- **growth-agent.js** *(deprecated)*
  - Legacy prototype using hardcoded simulated data
  - Replaced by `runners/run-growth-agent.js`
  - Scheduled for deletion

All active agent logic lives in `runners/`.

---

## runners/

Runners execute agents and orchestrate workflows.

Important runners:

- `run-daily-cycle.js`
  - Main orchestrator
  - Executes all agents sequentially

- `scheduler.js`
  - Runs daily cycles using node-cron
  - Default schedule:
    - 09:00
    - 15:00

- `run-analytics-agent.js`
- `run-supervisor.js`
- `run-dev-agent.js`
- `run-growth-agent.js`
- `run-memory-agent.js`

Each runner executes one specific agent.

---

## reports/

Stores generated reports.

Examples:


analytics-YYYY-MM-DD.md
growth-YYYY-MM-DD.md
code-analysis-YYYY-MM-DD.md
dev-task-XXXX.md


Reports are used as context for Claude and future analysis.

---

## memory/

Persistent system memory stored as JSON.

Files include:

- `marketplace.json`
  - Historical marketplace insights

- `improvements.json`
  - Backend improvement history

- `sessions.json`
  - Execution history of AI cycles

- `bugs.json`
  - Known issues

- `decisions.json`
  - Architectural decisions

The Memory Agent updates these files after each cycle.

---

## tasks/

Task pipeline for operational work.

Structure:


tasks/
inbox/
in-progress/
done/


Workflow:


Supervisor → inbox
Dev Agent → in-progress
Dev Agent → done


Each task is stored as JSON.

Example:


task-XXXXXXXX.json


---

## prompts/

Contains prompts generated for Claude.

Examples:


claude-task-investigate-products-without-views.md
claude-dev-bridge.md


These prompts include:

- Task description
- Reports
- Memory context
- Constraints
- Implementation guidance

Developers load these prompts into Claude Code.

---

# Claude Integration

Claude is not called automatically by the system.

Instead:


AI Agents → Generate prompts
Developer → Opens prompt in Claude Code
Claude → Suggests implementation
Developer → Implements solution


This design keeps:

- costs predictable
- actions auditable
- sensitive data protected

---

# Backend Integration

Admin endpoints expose the AI system state:


GET /admin/ai/status
GET /admin/ai/reports
GET /admin/ai/tasks


These allow the admin dashboard to monitor the AI system.

---

# Safety Constraints

The AI system must never:

- modify `.env`
- access secrets
- deploy code
- delete critical files

Allowed write locations:


flow-ai/reports
flow-ai/tasks
flow-ai/memory
flow-ai/prompts


---

# Developer Workflow

1. Scheduler runs AI cycle
2. Agents generate reports
3. Supervisor creates tasks
4. Claude prompts are generated
5. Developer opens prompts in Claude
6. Claude suggests solutions
7. Developer implements changes
8. Dev reports are generated
9. Memory agent stores insights

---

# Goal

The goal of this system is to gradually build a **self-improving marketplace intelligence layer** for Flowjuyu.

Over time the AI system will:

- detect marketplace problems
- recommend improvements
- guide development priorities
- help scale the platform intelligently