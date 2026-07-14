'use strict';
// Canonical draft-state shape. Both the LCU parser (live mode) and the CLI (manual mode)
// produce this exact object, so the engine is source-agnostic.

function createDraftState() {
  return {
    phase: 'idle',              // idle | banning | picking | finalizing
    me: { cellId: null, role: null, lockedChampion: null, hoverChampion: null },
    myTeam: [],                 // [{ champion, role, cellId, locked }]
    enemyTeam: [],              // [{ champion, role|null, cellId, locked }]
    bans: { ally: [], enemy: [] },
  };
}

function unavailableChampions(state) {
  const set = new Set();
  for (const n of state.bans.ally) set.add(n);
  for (const n of state.bans.enemy) set.add(n);
  for (const p of state.myTeam) if (p.champion) set.add(p.champion);
  for (const p of state.enemyTeam) if (p.champion) set.add(p.champion);
  return set;
}

module.exports = { createDraftState, unavailableChampions };
