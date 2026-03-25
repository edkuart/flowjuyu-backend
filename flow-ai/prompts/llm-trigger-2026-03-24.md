# FLOWJUYU LLM TRIGGER ANALYSIS
Generated: 2026-03-24T19:46:39.091Z
Date: 2026-03-24
Trigger: ACTIVATED — 3 issue(s) exceed trigger threshold (score >= 90 or severity = "high").

---

## WHY THIS PROMPT WAS GENERATED

The priority generator detected 3 high-priority issue(s) requiring analysis:
- 3 HIGH severity
- Top priority score: 100/100

Sources:
- Priority artifact:  priority-2026-03-24.json
- Telemetry artifact: telemetry-2026-03-24.json

---

## INSTRUCTIONS

You are the Flowjuyu AI Analyst.

3 issue(s) exceeded the trigger threshold (score ≥ 90 or severity = HIGH).
These issues are **not hypothetical** — they are derived deterministically from telemetry data.

For each issue below:
1. Confirm whether the issue is real or a false positive based on the telemetry context.
2. Identify the most likely root cause.
3. Propose one concrete, minimal action the development team can take within 24 hours.
4. Flag any dependency or blocker that would prevent the action.

---

## MARKETPLACE CONTEXT

**Current State** (snapshot: 2026-03-24T00:16:36.489Z)
  Products total:          16
  Products without views:  14
  Products missing images: 2
  Inactive sellers:        13
  Trending products:       none

**7-Day Trends** (4 distinct days, 2026-03-17 → 2026-03-24)
  Products total: 16 → 16 (+0) → [2026-03-17 → 2026-03-24]
  Products without views: 14 → 14 (+0) → [2026-03-17 → 2026-03-24]
  Products missing images: 2 → 2 (+0) → [2026-03-17 → 2026-03-24]
  Inactive sellers: 7 → 13 (+6) ↑ [2026-03-17 → 2026-03-24]

**Filtered Metrics** (real vs test)
  Real sellers:            6
  Test accounts:           9
  Real sellers w/ products:0
  Real dead products:      8

**Metric Conflicts:** products_without_views (analytics=12 vs db=14, Δ2)

---

## HIGH-PRIORITY ISSUES

### Issue 1: Zero real sellers have active products

| Field          | Value |
|---|---|
| ID             | `seller_activation_zero` |
| Severity       | **HIGH** |
| Priority Score | 100 / 100 |
| Impact Area    | seller |
| Trend          | → stable |
| Confidence     | 100% |

**Reasoning:**
filtered_metrics shows 6 real sellers and real_sellers_with_products = 0. None of the production sellers have listed any products, making the catalog functionally empty for real buyers.

**Recommended Action:**
Review the 6 real sellers (Edwart's Market 02, Edwart's Market 01, Daniel tienda…) and determine whether their products are in draft, deactivated, or never created. Implement a seller onboarding re-engagement flow.

**Signal Data:**
```json
{
  "real_seller_count": 6,
  "real_sellers_with_products": 0,
  "real_seller_names": [
    "Edwart's Market 02",
    "Edwart's Market 01",
    "Daniel tienda",
    "Edwart's Market 07",
    "Textiles Banekxel",
    "…+1 more"
  ]
}
```

---

### Issue 2: Inactive sellers increasing — +6 in 4 days (+86%)

| Field          | Value |
|---|---|
| ID             | `inactive_sellers_worsening` |
| Severity       | **HIGH** |
| Priority Score | 100 / 100 |
| Impact Area    | seller |
| Trend          | ↑ worsening |
| Confidence     | 95% |

**Reasoning:**
trends.inactive_sellers: 7 → 13 (delta +6, +86%) across 4 distinct days (2026-03-17 → 2026-03-24). This is the only worsening metric in the current telemetry window. An 87% increase in one week suggests a systemic retention problem.

**Recommended Action:**
Cross-reference the 13 inactive sellers against the real seller list. Determine whether real sellers are driving this count or test accounts are inflating it. If real sellers dominate, initiate a direct re-engagement campaign.

**Signal Data:**
```json
{
  "first_value": 7,
  "last_value": 13,
  "delta": 6,
  "first_date": "2026-03-17",
  "last_date": "2026-03-24",
  "distinct_days": 4,
  "pct_increase": 86
}
```

---

### Issue 3: 88% of products have zero views (14 of 16)

| Field          | Value |
|---|---|
| ID             | `dead_catalog` |
| Severity       | **HIGH** |
| Priority Score | 95 / 100 |
| Impact Area    | product |
| Trend          | → stable |
| Confidence     | 90% |

**Reasoning:**
current_state.products_without_views = 14 out of 16 total products (88%). Trend is stable over 4 days. 8 are confirmed real (non-test) products. Empty trending_products and trending_categories arrays are a direct downstream consequence — no engagement data exists for the recommendation engine.

**Recommended Action:**
Verify that products are reachable from the buyer-facing frontend. Check if listings are published vs. draft/inactive. Confirmed real dead products include: que hueva, huipil rosa, collar ceremonial, anillo…. Investigate product discovery path (search indexing, category browsing, direct URLs).

**Signal Data:**
```json
{
  "products_without_views": 14,
  "products_total": 16,
  "pct_without_views": 88,
  "trend_direction": "stable",
  "real_dead_products_count": 8,
  "real_dead_product_names": [
    "que hueva",
    "huipil rosa",
    "collar ceremonial",
    "anillo",
    "zapato",
    "…+3 more"
  ]
}
```

---

## YOUR RESPONSE FORMAT

For each issue, respond in this exact structure:

**ISSUE: [issue_id]**
- Confirmed: yes / no / uncertain
- Root cause: [1 sentence]
- 24h action: [specific, concrete step]
- Blocker: [if any, otherwise "none"]
- Confidence in diagnosis: high / medium / low

---

## CONSTRAINTS

- Do not propose deployment actions, .env changes, or destructive operations
- Do not invent files — qualify uncertainty when referencing code
- Stay grounded in the telemetry numbers shown above
- Prefer minimal, reversible actions

---
