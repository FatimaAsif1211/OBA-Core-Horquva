/**
 * turnContext.js — Task 10.6
 * Turn context: one frozen roots bundle per agent conversation turn.
 *
 * Invariant (from T10.2 handoff):
 *   A turn loads ONE root bundle, computes intelligence from that bundle,
 *   and all downstream tools use the SAME bundle.  This prevents inconsistent
 *   results caused by multiple reads observing different database states.
 *
 * Depends on:
 *   • T10.1 — backend/agent/config.js  (AGENT_ENABLED guard)
 *   • T10.2 — domain.intelligence.compute.loadRoots / allFromRoots
 *             (Janita's branch feat/backend-10-1-10-2 must be merged first)
 *
 * Author: Mushtaq Ahmed (Data, migration and persistence — Task 10.6)
 */

'use strict'

// ─── Dependency shim ──────────────────────────────────────────────────────────
// T10.2 (Janita) introduces loadRoots / computeAllFromRoots.
// We resolve them at runtime so this file can be imported before that branch
// is merged; the guard below will surface a clear error rather than a silent
// crash.

function resolveDomainCompute() {
  try {
    // Expected path once T10.2 is merged
    const compute = require('../agent/providers/domainCompute')
    return compute
  } catch (_) {
    try {
      // Fallback: T10.2 may export through a different path
      const domain = require('../routes/intelligence/orchestrator')
      if (domain.loadRoots && domain.computeAllFromRoots) return domain
    } catch (_2) { /* ignore */ }

    // Return a stub that throws a clear message so downstream code fails fast
    return {
      loadRoots: async () => {
        throw new Error(
          '[T10.6] loadRoots is not available. ' +
          'Ensure T10.2 (feat/backend-10-1-10-2) is merged and ' +
          'domain.intelligence.compute.loadRoots is exported correctly.'
        )
      },
      computeAllFromRoots: () => {
        throw new Error('[T10.6] computeAllFromRoots is not available.')
      },
    }
  }
}

// ─── Supabase (for direct reads when T10.2 path is unavailable) ───────────────
const supabase = require('../supabase')

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * How old (in seconds) a roots bundle can be before we consider the graph
 * "stale" and flag it in the context object.  Surfaced by T13.3.
 */
const STALENESS_THRESHOLD_SECONDS = 300   // 5 minutes

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TurnContext
 * @property {string}  turnId           — unique id for this turn (for tracing)
 * @property {string}  userId           — caller's user id
 * @property {string}  conversationId   — the conversation this turn belongs to
 * @property {number}  turn             — 1-based turn number
 * @property {object}  roots            — frozen raw roots bundle (from loadRoots)
 * @property {object}  intelligence     — frozen derived intelligence (from computeAllFromRoots)
 * @property {string}  snapshotAt       — ISO timestamp when roots were loaded
 * @property {string}  graphLoadedAt    — ISO timestamp when computation finished
 * @property {boolean} isStale          — true if the bundle is older than STALENESS_THRESHOLD_SECONDS
 * @property {number}  staleSecs        — seconds since roots were loaded (for T13.3)
 */

// ─── Core: build the frozen turn context ─────────────────────────────────────

/**
 * Build a frozen TurnContext for one agent conversation turn.
 *
 * Call this ONCE at the start of each turn.  Pass the returned object into
 * every tool — do not let individual tools call loadRoots on their own.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conversationId
 * @param {number} params.turn            — 1-based turn number
 * @returns {Promise<TurnContext>}
 */
async function buildTurnContext({ userId, conversationId, turn }) {
  const compute = resolveDomainCompute()

  const snapshotAt = new Date().toISOString()

  // ── ONE read — the T10.2 invariant ──────────────────────────────────────
  const roots = await compute.loadRoots(supabase)
  const graphLoadedAt = new Date().toISOString()

  // ── Derive all intelligence from the same bundle — no second read ────────
  const intelligence = compute.computeAllFromRoots(roots)

  // ── Freeze both objects so tools cannot mutate shared state ─────────────
  const frozenRoots        = deepFreeze(roots)
  const frozenIntelligence = deepFreeze(intelligence)

  // ── Staleness check (for T13.3 — graph staleness surfacing) ─────────────
  const loadedMs   = new Date(graphLoadedAt).getTime()
  const nowMs      = Date.now()
  const staleSecs  = Math.round((nowMs - loadedMs) / 1000)
  const isStale    = staleSecs > STALENESS_THRESHOLD_SECONDS

  const ctx = {
    turnId:         `${conversationId}:${turn}:${Date.now()}`,
    userId,
    conversationId,
    turn,
    roots:          frozenRoots,
    intelligence:   frozenIntelligence,
    snapshotAt,
    graphLoadedAt,
    isStale,
    staleSecs,
  }

  // Freeze the context itself — callers get a read-only view
  return Object.freeze(ctx)
}

// ─── Staleness check ─────────────────────────────────────────────────────────

/**
 * Re-evaluate staleness of an existing TurnContext at the moment of call.
 * Useful when a long-running tool wants to warn that data may have drifted.
 *
 * @param {TurnContext} ctx
 * @returns {{ isStale: boolean, staleSecs: number }}
 */
function checkStaleness(ctx) {
  const loadedMs  = new Date(ctx.graphLoadedAt).getTime()
  const staleSecs = Math.round((Date.now() - loadedMs) / 1000)
  return {
    isStale:  staleSecs > STALENESS_THRESHOLD_SECONDS,
    staleSecs,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively freeze a plain object / array so tools cannot accidentally
 * mutate the shared roots bundle.
 *
 * @param {*} obj
 * @returns {*} the same value, frozen
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  Object.keys(obj).forEach(k => deepFreeze(obj[k]))
  return Object.freeze(obj)
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  buildTurnContext,
  checkStaleness,
  STALENESS_THRESHOLD_SECONDS,
  // Export deepFreeze so tests can verify freezing behaviour
  _deepFreeze: deepFreeze,
}
