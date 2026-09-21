const test = require('node:test');
const assert = require('node:assert/strict');
const { computeReplaceability } = require('../tools/replaceability');
const { evaluateEntityReplaceability } = require('../routes/intelligence/replaceability');

// ── AI-3 Tool Tests (Bisma/Jawad) ──
test('AI-3: High rating when all 3 factors are present', () => {
  const entity = { id: 'sys-1', backupExists: true, alternativeExists: true, isDocumented: true };
  const result = computeReplaceability(entity);
  
  assert.equal(result.rating, 'High');
  assert.equal(result.factors.backupExists, true);
  assert.equal(result.factors.alternativeExists, true);
  assert.equal(result.factors.isDocumented, true);
});

test('AI-3: Medium rating when exactly 1 factor is missing', () => {
  const entity = { id: 'agent-1', backupExists: true, alternativeExists: false, isDocumented: true };
  const result = computeReplaceability(entity);
  
  assert.equal(result.rating, 'Medium');
});

test('AI-3: Low rating when 2 or 3 factors are missing', () => {
  // 2 missing
  const entity2Missing = { id: 'vendor-1', backupExists: false, alternativeExists: false, isDocumented: true };
  const result2 = computeReplaceability(entity2Missing);
  assert.equal(result2.rating, 'Low');

  // 3 missing
  const entity3Missing = { id: 'person-1', backupExists: false, alternativeExists: false, isDocumented: false };
  const result3 = computeReplaceability(entity3Missing);
  assert.equal(result3.rating, 'Low');
});

// ── FE-5 Intelligence Route Tests (Abdullah) ──
function makeMockGraph({ backupOwner = null, backupTool = null, documented = null, type = 'ai_agent' } = {}) {
  const entity = {
    id: 'ent_test_1',
    name: 'Test Entity',
    type,
    metadata: {
      backup_owner: backupOwner,
      backupTool,
      documented,
    },
  };

  const g = {
    entities: {
      get: (id) => (id === entity.id ? entity : null),
      list: () => [entity],
    },
    relationships: {
      to: () => [],
      from: () => [],
    },
  };

  return { entity, g };
}

test('FE-5: High rating when all 3 conditions are met', () => {
  const { entity, g } = makeMockGraph({
    backupOwner: 'Jane Doe',
    backupTool: 'Fallback Model',
    documented: true,
  });

  const res = evaluateEntityReplaceability(entity, g);
  assert.equal(res.rating, 'High');
  assert.equal(res.hasBackupOwner, true);
  assert.equal(res.hasAltVendor, true);
  assert.equal(res.isDocumented, true);
  assert.ok(res.explanation.includes('High replaceability'));
});

test('FE-5: Medium rating when exactly 1 condition is missing', () => {
  const m1 = makeMockGraph({ backupOwner: null, backupTool: 'Fallback Model', documented: true });
  const res1 = evaluateEntityReplaceability(m1.entity, m1.g);
  assert.equal(res1.rating, 'Medium');
  assert.equal(res1.hasBackupOwner, false);

  const m2 = makeMockGraph({ backupOwner: 'Jane Doe', backupTool: null, documented: true });
  const res2 = evaluateEntityReplaceability(m2.entity, m2.g);
  assert.equal(res2.rating, 'Medium');
  assert.equal(res2.hasAltVendor, false);

  const m3 = makeMockGraph({ backupOwner: 'Jane Doe', backupTool: 'Fallback Model', documented: false });
  const res3 = evaluateEntityReplaceability(m3.entity, m3.g);
  assert.equal(res3.rating, 'Medium');
  assert.equal(res3.isDocumented, false);
});

test('FE-5: Low rating when 2 or 3 conditions are missing', () => {
  const l1 = makeMockGraph({ backupOwner: null, backupTool: null, documented: true });
  const res1 = evaluateEntityReplaceability(l1.entity, l1.g);
  assert.equal(res1.rating, 'Low');

  const l2 = makeMockGraph({ backupOwner: 'Jane Doe', backupTool: null, documented: false });
  const res2 = evaluateEntityReplaceability(l2.entity, l2.g);
  assert.equal(res2.rating, 'Low');

  const l3 = makeMockGraph({ backupOwner: null, backupTool: null, documented: false });
  const res3 = evaluateEntityReplaceability(l3.entity, l3.g);
  assert.equal(res3.rating, 'Low');
  assert.equal(res3.hasBackupOwner, false);
  assert.equal(res3.hasAltVendor, false);
  assert.equal(res3.isDocumented, false);
});

test('FE-5: Required JSON keys are present', () => {
  const { entity, g } = makeMockGraph({
    backupOwner: 'Jane Doe',
    backupTool: 'Fallback Model',
    documented: true,
  });
  const res = evaluateEntityReplaceability(entity, g);
  for (const key of ['rating', 'explanation', 'hasBackupOwner', 'hasAltVendor', 'isDocumented']) {
    assert.ok(Object.prototype.hasOwnProperty.call(res, key), `missing key: ${key}`);
  }
});
