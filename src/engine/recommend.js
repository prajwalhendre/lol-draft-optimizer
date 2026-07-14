'use strict';
// Pick recommendation scoring.
//
// Counter-direction rules (proposal §4.2 — the documented bug source, handled explicitly):
//   entry X's `countered_by` lists champions X STRUGGLES AGAINST.
//   For a candidate C vs enemy E:
//     - C is GOOD into E   when C appears in E.countered_by   (E struggles against C)
//     - C is BAD  into E   when E appears in C.countered_by   (C struggles against E)
//   Both directions are applied. Never read X's list as "picks that beat X's opponents".
//
// Meta strength uses `score` (composite 30-67). `win_rate` is display-only.
// Champions found only in tier_only_champions get NO counter factor (neutral, not negative).

const { unavailableChampions } = require('./draft');

const W = {
  comfortPerWeight: 1.2,   // pool weight 1-5
  meta: 4.0,               // scaled by normalized composite score
  counterLane: 2.5,        // direct lane opponent counter relationship
  counterOther: 1.2,       // any other enemy
  duo: 1.0,                // observed synergy pair
  compGap: 1.0,            // fills missing frontline / damage type
  engageGap: 0.8,
  threatAnswer: 0.7,
};

const SCORE_MIN = 30, SCORE_MAX = 67; // observed composite score range in the snapshot

function metaNorm(score) {
  if (typeof score !== 'number') return 0;
  return Math.max(0, Math.min(1, (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
}

function teamProfile(names, store) {
  const p = { count: 0, ad: 0, ap: 0, frontline: 0, engage: 0, dive: 0, poke: 0, cc: 0, sustain: 0 };
  for (const n of names) {
    if (!n) continue;
    const a = store.attrs(n);
    p.count++;
    if (a.damage === 'AD') p.ad++;
    else if (a.damage === 'AP') p.ap++;
    else { p.ad += 0.5; p.ap += 0.5; }
    if (a.frontline) p.frontline++;
    if (a.engage) p.engage++;
    if (a.diver) p.dive++;
    if (a.poke) p.poke++;
    if (a.ccHeavy) p.cc++;
    if (a.sustain) p.sustain++;
  }
  return p;
}

function recommendPicks(store, profile, state) {
  const role = state.me.role;
  const pool = (profile.pools && profile.pools[role]) || [];
  const taken = unavailableChampions(state);

  const allyNames = state.myTeam.map((p) => p.champion).filter(Boolean);
  const enemyNames = state.enemyTeam.map((p) => p.champion).filter(Boolean);
  const laneOpp = state.enemyTeam.find((p) => p.champion && p.role === role);
  const laneOppName = laneOpp ? laneOpp.champion : null;

  const allies = teamProfile(allyNames, store);
  const enemies = teamProfile(enemyNames, store);

  const out = [];
  for (const { champion: raw, weight = 3 } of pool) {
    const c = store.canonicalName(raw) || raw;
    if (taken.has(c)) continue;

    const reasons = [];
    let score = weight * W.comfortPerWeight;

    const e = store.entry(c, role);
    if (e) {
      score += metaNorm(e.score) * W.meta;
      reasons.push(`${e.tier} tier ${role} this patch`);
    }
    const cDetail = e && e.detailed ? e : store.detailed(c, role);

    // --- Counter factor (skipped entirely for champions without counter data) ---
    for (const enemy of enemyNames) {
      const isLane = enemy === laneOppName;
      const w = isLane ? W.counterLane : W.counterOther;
      const eDetail = store.detailed(enemy);
      if (eDetail && Array.isArray(eDetail.countered_by) && eDetail.countered_by.includes(c)) {
        score += w;
        reasons.push(`Counters ${enemy}${isLane ? ' (your lane)' : ''}`);
      }
      if (cDetail && Array.isArray(cDetail.countered_by) && cDetail.countered_by.includes(enemy)) {
        score -= w;
        reasons.push(`Struggles vs ${enemy}${isLane ? ' (your lane)' : ''}`);
      }
    }
    if (!cDetail && enemyNames.length) {
      reasons.push('No matchup data this patch — scored on tier + comfort');
    }

    // --- Synergy (observed duos) ---
    for (const ally of allyNames) {
      const aDetail = store.detailed(ally);
      const dueTo = (cDetail && Array.isArray(cDetail.duos) && cDetail.duos.includes(ally)) ||
                    (aDetail && Array.isArray(aDetail.duos) && aDetail.duos.includes(c));
      if (dueTo) { score += W.duo; reasons.push(`Strong duo with ${ally}`); }
    }

    // --- Team composition needs ---
    const a = store.attrs(c);
    if (allies.count >= 2) {
      if (allies.frontline === 0 && a.frontline) { score += W.compGap; reasons.push('Adds missing frontline'); }
      if (allies.engage === 0 && a.engage) { score += W.engageGap; reasons.push('Adds missing engage'); }
      if (allies.ap === 0 && a.damage === 'AP') { score += W.compGap; reasons.push('Balances damage (team is all AD)'); }
      if (allies.ad === 0 && a.damage === 'AD') { score += W.compGap; reasons.push('Balances damage (team is all AP)'); }
    }

    // --- Enemy threat answers ---
    if (enemies.count >= 2) {
      if (enemies.dive >= 2 && a.peel) { score += W.threatAnswer; reasons.push('Peel vs their dive threats'); }
      if (enemies.poke >= 2 && (a.engage || a.sustain)) { score += W.threatAnswer; reasons.push('Answer to their poke comp'); }
    }

    out.push({
      champion: c,
      score: Math.round(score * 100) / 100,
      tier: e ? e.tier : null,
      winRate: cDetail && typeof cDetail.win_rate === 'number' ? cDetail.win_rate : null, // display only
      hasCounterData: Boolean(cDetail),
      reasons,
    });
  }

  out.sort((x, y) => y.score - x.score);
  return out;
}

module.exports = { recommendPicks, metaNorm, teamProfile, W };
