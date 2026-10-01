/**
 * pageContext.js — Task 12.7
 * get_page_context tool: given a dashboard page slug, return the relevant
 * metrics from the agent's frozen intelligence bundle for that page.
 *
 * This lets the agent answer "dashboard-aware" questions like:
 *   "What does the Continuity page tell me about Alice?"
 *   "Show me the governance numbers on the Risks page."
 *
 * Design rules:
 *   • Read-only — no writes, no DB calls.
 *   • All data comes from the frozen TurnContext (roots + intelligence).
 *   • Returns a structured { slug, title, metrics[], summary } object.
 *   • Unknown slugs return a clear error rather than silent null.
 *
 * Depends on:
 *   • T10.6 — TurnContext (frozen roots + intelligence bundle)
 *   • T12.2 — Navigation catalog (Saad provides the slug → route mapping;
 *              we import it at runtime so we can work before it is merged)
 *
 * Author: Mushtaq Ahmed (Data, migration and persistence — Task 12.7)
 */

'use strict'

// ─── Page catalog ─────────────────────────────────────────────────────────────
//
// Maps every dashboard page slug to:
//   title    — human-readable page name (shown in the agent's answer)
//   extract  — function(intelligence, roots) → { [metricKey]: value, ... }
//
// When T12.2 (Saad) ships its navigation catalog, import that and merge/
// override — but this local catalog keeps T12.7 independently runnable.

const PAGE_CATALOG = {

  // ── Overview / dashboard home ────────────────────────────────────────────
  'dashboard': {
    title: 'Dashboard Overview',
    extract(intel) {
      return {
        organizationalIntelligenceScore: intel?.orchestrator?.score               ?? null,
        rating:                          intel?.orchestrator?.rating              ?? null,
        brainIndex:                      intel?.brainCore?.brainIndex             ?? null,
        brainPosture:                    intel?.brainCore?.posture                ?? null,
        trustScore:                      intel?.orchestrator?.trustScore          ?? null,
      }
    },
  },

  // ── Key-person / ownership risk ──────────────────────────────────────────
  'risks': {
    title: 'Risk Dashboard',
    extract(intel, roots) {
      const people = roots?.people ?? []
      const topRisk = [...people]
        .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        .slice(0, 5)
        .map(p => ({ name: p.name, riskScore: p.risk_score ?? 0 }))

      return {
        predictiveRiskScore:  intel?.predictiveRisk?.score   ?? null,
        criticalAgentsCount:  roots?.criticalAgents?.length  ?? null,
        topKeyPersonRisk:     topRisk,
      }
    },
  },

  // ── Continuity / succession ──────────────────────────────────────────────
  'continuity': {
    title: 'Continuity & Succession',
    extract(intel, roots) {
      return {
        continuityScore:      intel?.continuity?.score       ?? null,
        agentsWithNoBackup:   roots?.agentsWithNoBackup      ?? null,
        singleOwnerWorkflows: roots?.singleOwnerWorkflows    ?? null,
        orgHealthIndex:       intel?.orgHealth?.score        ?? null,
      }
    },
  },

  // ── Governance ───────────────────────────────────────────────────────────
  'governance': {
    title: 'Governance Intelligence',
    extract(intel) {
      return {
        governanceScore:           intel?.governance?.score          ?? null,
        accountabilityScore:       intel?.accountability?.score      ?? null,
        decisionQualityScore:      intel?.decisionQuality?.score     ?? null,
        separationOfDutyViolations: intel?.governance?.violations    ?? null,
      }
    },
  },

  // ── Dependencies / ownership ─────────────────────────────────────────────
  'dependencies': {
    title: 'Dependencies & Ownership',
    extract(intel, roots) {
      const agents = roots?.agents ?? []
      const topOwned = [...agents]
        .sort((a, b) => (b.owned_count ?? 0) - (a.owned_count ?? 0))
        .slice(0, 5)
        .map(a => ({ name: a.name, ownedCount: a.owned_count ?? 0 }))

      return {
        collaborationScore:    intel?.collaboration?.score    ?? null,
        aiAdoptionScore:       intel?.aiAdoption?.score       ?? null,
        topOwners:             topOwned,
        totalAgents:           agents.length                  ?? null,
      }
    },
  },

  // ── Workflows ────────────────────────────────────────────────────────────
  'workflows': {
    title: 'Workflows',
    extract(intel, roots) {
      const wf = roots?.workflows ?? []
      return {
        totalWorkflows:     wf.length,
        criticalWorkflows:  wf.filter(w => w.criticality === 'HIGH').length,
        undocumented:       wf.filter(w => !w.documented).length,
        memoryScore:        intel?.memory?.score              ?? null,
      }
    },
  },

  // ── Org health ───────────────────────────────────────────────────────────
  'health': {
    title: 'Organizational Health',
    extract(intel) {
      return {
        healthIndex:          intel?.orgHealth?.score         ?? null,
        continuityScore:      intel?.continuity?.score        ?? null,
        healthTrendScore:     intel?.healthTrend?.score       ?? null,
        domainIntelligence:   intel?.domainInt?.score         ?? null,
      }
    },
  },

  // ── Executive briefing ───────────────────────────────────────────────────
  'briefing': {
    title: 'Executive Briefing',
    extract(intel) {
      return {
        brainIndex:              intel?.brainCore?.brainIndex          ?? null,
        organizationalScore:     intel?.orchestrator?.score            ?? null,
        executiveBriefingScore:  intel?.executiveBriefing?.score       ?? null,
        topRecommendations:      intel?.orchestrator?.recommendations  ?? [],
      }
    },
  },

  // ── Predictive / forecast ────────────────────────────────────────────────
  'predictive': {
    title: 'Predictive Risk',
    extract(intel, roots) {
      return {
        predictiveRiskScore: intel?.predictiveRisk?.score             ?? null,
        criticalCount:       roots?.criticalAgents?.length            ?? null,
        forecastScore:       intel?.forecast?.score                   ?? null,
      }
    },
  },

  // ── Collaboration / human-agent map ─────────────────────────────────────
  'collaboration': {
    title: 'Human-Agent Collaboration',
    extract(intel) {
      return {
        collaborationScore: intel?.collaboration?.score               ?? null,
        aiAdoptionScore:    intel?.aiAdoption?.score                  ?? null,
        accountabilityScore: intel?.accountability?.score             ?? null,
      }
    },
  },
}

// ─── Supported slugs list (for validation / entity resolution) ───────────────
const SUPPORTED_SLUGS = Object.keys(PAGE_CATALOG)

// ─── Core tool function ───────────────────────────────────────────────────────

/**
 * get_page_context — the tool the agent calls.
 *
 * Given a page slug, extract the relevant metrics from the frozen
 * TurnContext and return a structured object the agent can cite.
 *
 * @param {string}      slug   — dashboard page slug (e.g. 'risks', 'continuity')
 * @param {TurnContext} ctx    — the frozen turn context from T10.6
 * @returns {{
 *   slug:     string,
 *   title:    string,
 *   metrics:  object,
 *   summary:  string,
 *   isStale:  boolean,
 *   staleSecs: number,
 * }}
 */
function getPageContext(slug, ctx) {
  // ── Validate slug ──────────────────────────────────────────────────────
  const normalised = (slug ?? '').toLowerCase().trim()

  if (!PAGE_CATALOG[normalised]) {
    return {
      error:          `Unknown page slug: "${slug}".`,
      supportedSlugs: SUPPORTED_SLUGS,
    }
  }

  const page = PAGE_CATALOG[normalised]

  // ── Extract metrics from the frozen bundle ─────────────────────────────
  // ctx.intelligence is the output of computeAllFromRoots
  // ctx.roots is the raw roots bundle
  const metrics = page.extract(ctx.intelligence ?? {}, ctx.roots ?? {})

  // ── Build a human-readable summary ─────────────────────────────────────
  const populated = Object.entries(metrics)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'number') return `${camelToLabel(k)}: ${v}`
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        return `${camelToLabel(k)}: ${v.map(item => JSON.stringify(item)).join(', ')}`
      }
      if (Array.isArray(v)) return `${camelToLabel(k)}: ${v.join(', ')}`
      return `${camelToLabel(k)}: ${v}`
    })

  const summary = populated.length > 0
    ? `${page.title} — ${populated.slice(0, 4).join('. ')}.`
    : `${page.title} — no data available in the current bundle.`

  return {
    slug:      normalised,
    title:     page.title,
    metrics,
    summary,
    isStale:   ctx.isStale   ?? false,
    staleSecs: ctx.staleSecs ?? 0,
    snapshotAt: ctx.snapshotAt ?? null,
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Convert camelCase to "Camel Case" label for the summary string. */
function camelToLabel(str) {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getPageContext,
  SUPPORTED_SLUGS,
  PAGE_CATALOG,       // exported so T12.2 (Saad) can extend it
  _camelToLabel: camelToLabel,  // exported for tests
}
