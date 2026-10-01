/**
 * agentData.unit.test.js — Tasks 10.6 & 12.7
 * Unit tests for:
 *   • backend/agent/turnContext.js   (Task 10.6 — frozen roots bundle)
 *   • backend/agent/pageContext.js   (Task 12.7 — get_page_context tool)
 *
 * No live DB required — supabase is stubbed via require cache injection.
 * Run from the backend/ folder:
 *   node tests/agentData.unit.test.js
 *
 * Author: Mushtaq Ahmed (Data, migration and persistence)
 */

'use strict'

// ─── Tiny test harness (matches repo convention) ──────────────────────────────

let passed = 0
let failed  = 0

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓', name) }
  else       { failed++; console.error('  ✗', name) }
}

// ─── Supabase stub ────────────────────────────────────────────────────────────

const supabasePath = require.resolve('../supabase')
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: { from: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }
}

// ─── domainCompute stub (T10.2 interface) ─────────────────────────────────────
//
// turnContext.js tries to require('../agent/providers/domainCompute').
// We inject a stub that returns predictable data.

const domainComputePath = require.resolve('../agent/providers/domainCompute')

const FAKE_ROOTS = {
  people:               [{ name: 'Alice', risk_score: 92 }, { name: 'Bob', risk_score: 55 }],
  agents:               [{ name: 'Agent-X', owned_count: 12 }, { name: 'Agent-Y', owned_count: 4 }],
  workflows:            [{ id: 'wf-1', criticality: 'HIGH', documented: false }, { id: 'wf-2', criticality: 'LOW', documented: true }],
  criticalAgents:       [{ name: 'Agent-X' }],
  agentsWithNoBackup:   3,
  singleOwnerWorkflows: 1,
}

const FAKE_INTELLIGENCE = {
  orchestrator:      { score: 74, rating: 'MODERATELY INTELLIGENT', trustScore: 68, recommendations: ['Reduce key-person risk'] },
  brainCore:         { brainIndex: 70, posture: 'STRAINED' },
  governance:        { score: 61, violations: 2 },
  continuity:        { score: 55 },
  orgHealth:         { score: 63 },
  predictiveRisk:    { score: 48 },
  memory:            { score: 72 },
  collaboration:     { score: 58 },
  accountability:    { score: 66 },
  domainInt:         { score: 70 },
  decisionQuality:   { score: 77 },
  aiAdoption:        { score: 50 },
  executiveBriefing: { score: 60 },
  healthTrend:       { score: 65 },
}

require.cache[domainComputePath] = {
  id: domainComputePath, filename: domainComputePath, loaded: true,
  exports: {
    loadRoots:           async () => JSON.parse(JSON.stringify(FAKE_ROOTS)),
    computeAllFromRoots: ()     => JSON.parse(JSON.stringify(FAKE_INTELLIGENCE)),
  }
}

// ─── Load modules under test ──────────────────────────────────────────────────

const turnContext = require('../agent/turnContext')
const pageContext = require('../agent/pageContext')

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n=== OBA Core — agentData unit tests (T10.6 + T12.7) ===\n')

async function runTests() {

  // ══ Suite 1: T10.6 — buildTurnContext ════════════════════════════════════
  console.log('Suite 1: T10.6 — buildTurnContext (frozen roots bundle)\n')
  {
    const ctx = await turnContext.buildTurnContext({
      userId:         'user-001',
      conversationId: 'conv-abc',
      turn:           1,
    })

    check('buildTurnContext returns an object',      typeof ctx === 'object' && ctx !== null)
    check('turnId is set',                           typeof ctx.turnId === 'string' && ctx.turnId.includes('conv-abc'))
    check('userId is preserved',                     ctx.userId === 'user-001')
    check('conversationId is preserved',             ctx.conversationId === 'conv-abc')
    check('turn is preserved',                       ctx.turn === 1)
    check('snapshotAt is an ISO string',             typeof ctx.snapshotAt === 'string' && ctx.snapshotAt.includes('T'))
    check('graphLoadedAt is an ISO string',          typeof ctx.graphLoadedAt === 'string')
    check('isStale is boolean',                      typeof ctx.isStale === 'boolean')
    check('staleSecs is a non-negative number',      typeof ctx.staleSecs === 'number' && ctx.staleSecs >= 0)

    // Fresh context should NOT be stale
    check('fresh context is not stale',              ctx.isStale === false)
    check('staleSecs is very small for fresh ctx',   ctx.staleSecs < 5)

    // Roots and intelligence should be present
    check('roots is present on context',             !!ctx.roots)
    check('intelligence is present on context',      !!ctx.intelligence)

    // The roots bundle must be frozen — tools must not mutate it
    check('roots object is frozen',                  Object.isFrozen(ctx.roots))
    check('intelligence object is frozen',           Object.isFrozen(ctx.intelligence))
    check('context itself is frozen',                Object.isFrozen(ctx))

    // Verify roots contain expected data from stub
    check('roots.people is populated',               Array.isArray(ctx.roots.people) && ctx.roots.people.length > 0)
    check('roots.people is frozen (deep freeze)',    Object.isFrozen(ctx.roots.people))
    check('intelligence.brainCore is present',       !!ctx.intelligence.brainCore)

    // Mutation must fail silently (frozen)
    let mutationBlocked = false
    try {
      ctx.roots.people[0].name = 'HACKED'
    } catch (_) {
      mutationBlocked = true
    }
    // Either throws (strict mode) or silently fails — either way the value must not change
    check('roots cannot be mutated by tools',
      mutationBlocked || ctx.roots.people[0].name === 'Alice'
    )
  }

  // ── checkStaleness ────────────────────────────────────────────────────────
  console.log('\n  — checkStaleness helper\n')
  {
    const ctx = await turnContext.buildTurnContext({
      userId: 'u', conversationId: 'c', turn: 1
    })
    const { isStale, staleSecs } = turnContext.checkStaleness(ctx)
    check('checkStaleness returns isStale boolean',   typeof isStale === 'boolean')
    check('checkStaleness returns staleSecs number',  typeof staleSecs === 'number')
    check('fresh context: checkStaleness not stale',  isStale === false)
  }

  // ══ Suite 2: T12.7 — getPageContext ═══════════════════════════════════════
  console.log('\nSuite 2: T12.7 — getPageContext (page metric wiring)\n')
  {
    // Build a mock TurnContext that getPageContext can consume
    const mockCtx = {
      roots:        FAKE_ROOTS,
      intelligence: FAKE_INTELLIGENCE,
      isStale:      false,
      staleSecs:    2,
      snapshotAt:   new Date().toISOString(),
    }

    // ── Known page ─────────────────────────────────────────────────────────
    const risksResult = pageContext.getPageContext('risks', mockCtx)

    check('risks slug returns a result',              !!risksResult)
    check('result has slug field',                    risksResult.slug === 'risks')
    check('result has title field',                   typeof risksResult.title === 'string' && risksResult.title.length > 0)
    check('result has metrics object',                typeof risksResult.metrics === 'object')
    check('result has summary string',                typeof risksResult.summary === 'string')
    check('predictiveRiskScore is present',           risksResult.metrics.predictiveRiskScore === 48)
    check('topKeyPersonRisk is an array',             Array.isArray(risksResult.metrics.topKeyPersonRisk))
    check('topKeyPersonRisk sorted highest first',
      risksResult.metrics.topKeyPersonRisk[0].name === 'Alice'
    )
    check('isStale propagated from context',          risksResult.isStale === false)
    check('staleSecs propagated from context',        risksResult.staleSecs === 2)

    // ── Continuity page ────────────────────────────────────────────────────
    const contResult = pageContext.getPageContext('continuity', mockCtx)
    check('continuity page works',                   contResult.slug === 'continuity')
    check('continuityScore is present',              contResult.metrics.continuityScore === 55)
    check('agentsWithNoBackup is present',           contResult.metrics.agentsWithNoBackup === 3)

    // ── Dashboard page ─────────────────────────────────────────────────────
    const dashResult = pageContext.getPageContext('dashboard', mockCtx)
    check('dashboard page works',                    dashResult.slug === 'dashboard')
    check('organizationalIntelligenceScore present', dashResult.metrics.organizationalIntelligenceScore === 74)
    check('brainPosture present',                    dashResult.metrics.brainPosture === 'STRAINED')

    // ── Workflows page ─────────────────────────────────────────────────────
    const wfResult = pageContext.getPageContext('workflows', mockCtx)
    check('workflows page works',                    wfResult.slug === 'workflows')
    check('totalWorkflows counted correctly',        wfResult.metrics.totalWorkflows === 2)
    check('criticalWorkflows counted correctly',     wfResult.metrics.criticalWorkflows === 1)
    check('undocumented counted correctly',          wfResult.metrics.undocumented === 1)

    // ── Case-insensitive slug matching ─────────────────────────────────────
    const upperResult = pageContext.getPageContext('RISKS', mockCtx)
    check('slug matching is case-insensitive',       upperResult.slug === 'risks')

    // ── Unknown slug returns error ─────────────────────────────────────────
    const unknownResult = pageContext.getPageContext('unknown-page', mockCtx)
    check('unknown slug returns error field',        !!unknownResult.error)
    check('unknown slug returns supportedSlugs',     Array.isArray(unknownResult.supportedSlugs))
    check('supportedSlugs includes "risks"',         unknownResult.supportedSlugs.includes('risks'))

    // ── Null/undefined slug returns error ─────────────────────────────────
    const nullResult = pageContext.getPageContext(null, mockCtx)
    check('null slug returns error field',           !!nullResult.error)

    // ── SUPPORTED_SLUGS export ─────────────────────────────────────────────
    check('SUPPORTED_SLUGS is exported as array',   Array.isArray(pageContext.SUPPORTED_SLUGS))
    check('SUPPORTED_SLUGS includes all pages',
      ['dashboard','risks','continuity','governance','dependencies',
       'workflows','health','briefing','predictive','collaboration']
      .every(s => pageContext.SUPPORTED_SLUGS.includes(s))
    )

    // ── PAGE_CATALOG is exported (for T12.2 extension) ────────────────────
    check('PAGE_CATALOG is exported for T12.2',     typeof pageContext.PAGE_CATALOG === 'object')
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`)
  process.exit(failed === 0 ? 0 : 1)
}

runTests().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
