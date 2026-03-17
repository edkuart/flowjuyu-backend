# Claude Workflow for Flowjuyu AI System

This document explains how Claude should interact with the Flowjuyu AI operating system located in `flow-ai/`.

Claude does not run autonomously inside the system. Instead, the system prepares context and tasks which Claude helps analyze and implement.

---

# AI Task Lifecycle

The Flowjuyu AI system follows this lifecycle:

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
Dev report
↓
Memory update

Claude participates during the **task analysis stage**.

---

# Where Claude receives tasks

Claude tasks are exported to:


flow-ai/prompts/


Examples:


claude-task-investigate-products-without-views.md
claude-dev-bridge.md


Each prompt contains:

- task information
- analytics reports
- improvement history
- marketplace insights
- system constraints

Claude must read the entire prompt before answering.

---

# Required Response Structure

Claude responses must follow this structure:

### Task Understanding

Explain what the task is asking and why it matters for the marketplace.

### Technical or Operational Diagnosis

Determine whether the issue is caused by:

- code
- data
- product design
- marketplace dynamics

### Best Next Action

Recommend the single most impactful next step.

### Files To Inspect

Reference real files in the repository.

Examples:


src/controllers/
src/services/
src/models/


### Safe Implementation Plan

Provide a numbered plan describing how to implement the improvement safely.

### Risks

Explain possible risks or unintended consequences.

---

# How Claude Should Think

Claude should approach problems using:

- marketplace thinking
- backend architecture knowledge
- operational reasoning
- minimal safe code changes

Claude should prefer:

- improving visibility
- improving seller engagement
- improving catalog quality
- improving conversion signals

---

# Things Claude Must Never Do

Claude must never recommend:

- editing `.env`
- deploying code
- deleting important files
- destructive database actions

Claude must also avoid vague suggestions.

Always reference **real files and concrete steps**.

---

# Writing Dev Reports

After a task is implemented, the developer may generate a report in:


flow-ai/reports/daily/


Example:


dev-task-xxxx.md


These reports allow the Memory Agent to learn from improvements.

---

# Learning Loop

After implementation:

Dev report
↓
Memory Agent
↓
Updates:


flow-ai/memory/improvements.json
flow-ai/memory/marketplace.json


This memory is later used to provide better recommendations.

---

# Goal

Claude helps the developer continuously improve the Flowjuyu marketplace through structured problem solving.

The AI system gathers the data.

Claude provides the reasoning.

The developer executes the changes.

Together they form a **human-AI improvement loop**.