// src/types/ai.types.ts
//
// All TypeScript interfaces and constants for the Flowjuyu AI Control Center.
// This file is the single source of truth for AI-related types used across
// the service, controller, and route layers.

// ─────────────────────────────────────────────────────────
// Report types
// ─────────────────────────────────────────────────────────

export const VALID_REPORT_TYPES = ["analytics", "growth", "code-analysis", "dev-task"] as const;

export type AiReportType = typeof VALID_REPORT_TYPES[number] | "unknown";

export interface AiReportMeta {
  filename:  string;
  type:      AiReportType;
  date:      string | null;
  preview:   string;
}

export interface AiReportFull {
  filename: string;
  type:     AiReportType;
  content:  string;
}

// ─────────────────────────────────────────────────────────
// Task types
// ─────────────────────────────────────────────────────────

export type AiTaskStage    = "pending" | "in-progress" | "done";
export type AiTaskPriority = "low" | "medium" | "high";

export interface AiTask {
  id:          string;
  title:       string;
  description: string;
  priority:    AiTaskPriority;
  status:      AiTaskStage;
  source:      string;
  created_at:  string;
}

export interface AiTaskEntry {
  file:  string;
  stage: AiTaskStage;
  task:  AiTask | null;
}

export interface AiTaskQueue {
  inbox:       AiTaskEntry[];
  in_progress: AiTaskEntry[];
  done:        AiTaskEntry[];
}

// ─────────────────────────────────────────────────────────
// Memory types
// ─────────────────────────────────────────────────────────

export interface AiSession {
  cycles_run:        number;
  last_run:          string | null;
  tasks_completed:   number;
  reports_generated: number;
}

export interface MarketplaceMemoryEntry {
  date:     string;
  insights: string[];
}

export interface ImprovementsMemoryEntry {
  date:         string;
  improvements: string[];
}

export interface AiMemory {
  sessions:     AiSession;
  marketplace:  MarketplaceMemoryEntry[];
  improvements: ImprovementsMemoryEntry[];
  bugs:         unknown[];
  decisions:    unknown[];
}

// ─────────────────────────────────────────────────────────
// Status types
// ─────────────────────────────────────────────────────────

export interface AiQueueCounts {
  inbox:       number;
  in_progress: number;
  done:        number;
}

export interface AiAgentConfig {
  name:    string;
  enabled: boolean;
  role:    string;
}

export interface AiStatus {
  sessions:       AiSession;
  queue:          AiQueueCounts;
  agents:         AiAgentConfig[];
  latest_reports: AiReportMeta[];
}

// ─────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// Brain — Intelligence
// ─────────────────────────────────────────────────────────

export interface TrendingProduct {
  product_id:  string;
  nombre:      string;
  intention_count: number;
}

export interface TrendingCategory {
  categoria_id: number;
  nombre:       string;
  intention_count: number;
}

export interface MarketplaceIntelligence {
  products_total:             number;
  products_without_images:    number;
  products_without_views:     number;
  inactive_sellers:           number;
  trending_products:          TrendingProduct[];
  trending_categories:        TrendingCategory[];
  generated_at:               string;
}

// ─────────────────────────────────────────────────────────
// Brain — Scanner
// ─────────────────────────────────────────────────────────

export type IssueSeverity = "low" | "medium" | "high" | "critical";

export interface ProductIssue {
  type:        string;
  severity:    IssueSeverity;
  title:       string;
  count:       number;
  description: string;
  data?:       unknown;
}

export interface ScanResult {
  issues:      ProductIssue[];
  tasks_created: number;
  scanned_at:  string;
}

// ─────────────────────────────────────────────────────────
// Brain — Growth
// ─────────────────────────────────────────────────────────

export interface GrowthOpportunity {
  type:          string;
  category?:     string;
  seller?:       string;
  demand_score:  number;
  supply_score:  number;
  suggestion:    string;
}

export interface GrowthReport {
  opportunities:   GrowthOpportunity[];
  report_filename: string | null;
  generated_at:    string;
}

// ─────────────────────────────────────────────────────────
// Brain — Seller Intelligence
// ─────────────────────────────────────────────────────────

export interface SellerMetrics {
  id:              number;
  nombre_comercio: string;
  product_count:   number;
  intention_count: number;
  last_active?:    string | null;
}

export interface SellerIntelligence {
  top_sellers:      SellerMetrics[];
  risky_sellers:    SellerMetrics[];
  inactive_sellers: SellerMetrics[];
  generated_at:     string;
}

// ─────────────────────────────────────────────────────────
// Brain — Risk Detection
// ─────────────────────────────────────────────────────────

export interface MarketplaceRisk {
  type:        string;
  severity:    IssueSeverity;
  description: string;
  seller_id?:  number | null;
  product_id?: string | null;
  count?:      number;
}

export interface RiskReport {
  risks:         MarketplaceRisk[];
  tasks_created: number;
  evaluated_at:  string;
}

// ─────────────────────────────────────────────────────────
// Brain — AI Decision Memory
// ─────────────────────────────────────────────────────────

export interface AiDecision {
  date:          string;
  decision_type: string;
  explanation:   string;
  related_data?: unknown;
}

// ─────────────────────────────────────────────────────────
// Brain — Supervisor
// ─────────────────────────────────────────────────────────

export interface AgentStatus {
  name:               string;
  enabled:            boolean;
  role:               string;
  status:             "active" | "idle" | "disabled";
  tasks_completed:    number;
  reports_generated:  number;
  last_activity:      string | null;
}

export interface SupervisorReport {
  agents:        AgentStatus[];
  total_tasks:   number;
  total_reports: number;
  evaluated_at:  string;
}

// ─────────────────────────────────────────────────────────
// Brain — Cycle result
// ─────────────────────────────────────────────────────────

export interface BrainCycleResult {
  intelligence: MarketplaceIntelligence | null;
  scan:         ScanResult | null;
  growth:       GrowthReport | null;
  sellers:      SellerIntelligence | null;
  risks:        RiskReport | null;
  report_file:  string | null;
  duration_ms:  number;
  ran_at:       string;
}

// ─────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────

// AiServiceError carries an HTTP status code so that the
// controller can pass it straight to Express's next(err),
// where the existing errorHandler reads err.status ?? 500.

export class AiServiceError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name   = "AiServiceError";
    this.status = status;

    // Restore prototype chain for instanceof checks in catch blocks.
    Object.setPrototypeOf(this, AiServiceError.prototype);
  }
}
