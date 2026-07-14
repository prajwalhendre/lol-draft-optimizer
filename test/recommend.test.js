'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { createStore } = require('../src/engine/store');
const { createDraftState } = require('../src/engine/draft');
const { recommendPicks } = require('../src/engine/recommend');
const { recommendRunes } = require('../src/engine/runes');
const { recommendItems } = require('../src/engine/items');

const ROOT = path.join(__dirname, '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/meta_tier_snapshot.json'), 'utf8'));
const knowledge = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/champion_knowledge.json'), 'utf8'));
const store = createStore({ snapshot, knowledge });

function stateWithRole(role) {
  const s = createDraftState();
  s.me.role = role;
  return s;
}

test('counter direction: picks INTO enemy X come from X.countered_by, not the reverse', () => {
  // Garen (top) countered_by: [Tryndamere, Teemo, Sett]  -> Trynd is GOOD into Garen.
  // Yone  (top) countered_by includes Garen              -> Yone is BAD into Garen.
  const profile = { pools: { top: [{ champion: 'Tryndamere', weight: 3 }, { champion: 'Yone', weight: 3 }] } };
  const s = stateWithRole('top');
  s.enemyTeam.push({ champion: 'Garen', role: 'top', cellId: 9, locked: true });

  const picks = recommendPicks(store, profile, s);
  const trynd = picks.find((p) => p.champion === 'Tryndamere');
  const yone = picks.find((p) => p.champion === 'Yone');

  assert.ok(trynd.reasons.some((r) => r.startsWith('Counters Garen')), 'Tryndamere should counter Garen');
  assert.ok(yone.reasons.some((r) => r.startsWith('Struggles vs Garen')), 'Yone should struggle vs Garen');
  // Despite Yone's higher composite score (64.07 vs 59.40), the lane counter must dominate.
  assert.ok(trynd.score > yone.score, 'counter relationship should outweigh the meta-score gap');
});

test('meta weighting uses composite score, win_rate is display-only', () => {
  const syntheticSnapshot = {
    _meta: { patch: 'test' },
    detailed_champions: [
      { champion: 'HighScoreLowWR', role: 'mid', tier: 'S', score: 65, win_rate: 45.0, countered_by: [], duos: [] },
      { champion: 'LowScoreHighWR', role: 'mid', tier: 'B', score: 40, win_rate: 53.0, countered_by: [], duos: [] },
    ],
    tier_only_champions: [],
  };
  const st = createStore({ snapshot: syntheticSnapshot, knowledge });
  const profile = { pools: { mid: [{ champion: 'HighScoreLowWR', weight: 3 }, { champion: 'LowScoreHighWR', weight: 3 }] } };
  const picks = recommendPicks(st, profile, stateWithRole('mid'));
  assert.strictEqual(picks[0].champion, 'HighScoreLowWR', 'ranking must follow score, not win_rate');
  assert.strictEqual(picks[0].winRate, 45.0, 'win_rate surfaces only as display data');
});

test('tier_only champions: counter factor omitted, never penalized for missing data', () => {
  // Kled is tier_only (top, B, 41.82) — no countered_by data.
  const profile = { pools: { top: [{ champion: 'Kled', weight: 3 }] } };
  const s = stateWithRole('top');
  s.enemyTeam.push({ champion: 'Garen', role: 'top', cellId: 9, locked: true });

  const [kled] = recommendPicks(store, profile, s);
  assert.strictEqual(kled.hasCounterData, false);
  assert.ok(!kled.reasons.some((r) => r.startsWith('Struggles') || r.startsWith('Counters')), 'no counter reasons for tier_only champs');
  assert.ok(kled.reasons.some((r) => r.includes('No matchup data')), 'transparent about missing data');

  // Score must equal comfort + meta exactly (no hidden counter penalty).
  const noEnemies = recommendPicks(store, profile, stateWithRole('top'));
  assert.strictEqual(kled.score, noEnemies[0].score, 'enemy picks must not change a tier_only champ score');
});

test('banned and already-picked champions are excluded', () => {
  const profile = { pools: { top: [{ champion: 'Garen', weight: 5 }, { champion: 'Darius', weight: 1 }] } };
  const s = stateWithRole('top');
  s.bans.enemy.push('Garen');
  let picks = recommendPicks(store, profile, s);
  assert.ok(!picks.some((p) => p.champion === 'Garen'), 'banned champ excluded');

  const s2 = stateWithRole('top');
  s2.enemyTeam.push({ champion: 'Garen', role: 'top', cellId: 9, locked: true });
  s2.myTeam.push({ champion: 'Darius', role: null, cellId: 1, locked: true });
  picks = recommendPicks(store, profile, s2);
  assert.strictEqual(picks.length, 0, 'picked champs (either team) excluded');
});

test('duo synergy from either side of the pair', () => {
  // Garen top with ally Seraphine: Garen.duos includes Seraphine.
  const profile = { pools: { top: [{ champion: 'Garen', weight: 3 }] } };
  const s = stateWithRole('top');
  s.myTeam.push({ champion: 'Seraphine', role: 'support', cellId: 4, locked: true });
  const [garen] = recommendPicks(store, profile, s);
  assert.ok(garen.reasons.some((r) => r.includes('duo with Seraphine')));
});

test('runes: knowledge-base page + contextual notes vs tough lane', () => {
  const profile = { pools: {}, preferences: { runes: {}, builds: {} } };
  const s = stateWithRole('top');
  // Garen countered_by includes Teemo -> tough lane note expected when we play Garen into Teemo.
  s.enemyTeam.push({ champion: 'Teemo', role: 'top', cellId: 9, locked: true });
  const r = recommendRunes(store, profile, s, 'Garen');
  assert.strictEqual(r.page.keystone, 'Conqueror');
  assert.ok(r.notes.some((n) => n.includes('Tough lane vs Teemo')));
});

test('items: anti-heal and armor triggers from enemy comp', () => {
  const profile = { pools: {}, preferences: { runes: {}, builds: {} } };
  const s = stateWithRole('mid');
  // Sustain-heavy + AD-heavy enemy comp
  for (const [champ, role] of [['Dr. Mundo', 'top'], ['Warwick', 'jungle'], ['Yasuo', 'mid'], ['Samira', 'adc']]) {
    s.enemyTeam.push({ champion: champ, role, cellId: 0, locked: true });
  }
  const items = recommendItems(store, profile, s, 'Ahri');
  assert.ok(items.situational.some((x) => x.why.toLowerCase().includes('anti-heal')), 'anti-heal suggested');
  assert.ok(items.situational.some((x) => x.why.includes('AD threats')), 'armor suggested vs AD-heavy comp');
});

test('user preference overrides beat the knowledge base', () => {
  const profile = { pools: {}, preferences: { runes: { Garen: { primaryTree: 'Resolve', keystone: 'Grasp of the Undying', primary: [], secondaryTree: 'Precision', secondary: [], shards: [] } }, builds: {} } };
  const r = recommendRunes(store, profile, stateWithRole('top'), 'Garen');
  assert.strictEqual(r.page.keystone, 'Grasp of the Undying');
  assert.strictEqual(r.source, 'your override');
});

test('fuzzy champion name resolution', () => {
  assert.strictEqual(store.canonicalName('miss fort'), 'Miss Fortune');
  assert.strictEqual(store.canonicalName('DR. MUNDO'), 'Dr. Mundo');
  assert.strictEqual(store.canonicalName('kaisa'), "Kai'Sa");
});
