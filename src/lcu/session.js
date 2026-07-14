'use strict';
// Parses an LCU champ-select session payload into the canonical draft-state shape.
// NOTE (proposal §8): exact payload fields drift between client versions — this parser
// is defensive about missing fields and should be sanity-checked against the live
// client if something looks off (log raw sessions with LOL_DEBUG=1).

const { createDraftState } = require('../engine/draft');
const { normalizeRole } = require('../engine/store');

function parseChampSelect(session, ddragon) {
  const state = createDraftState();
  if (!session) return state;

  const nameOf = (id) => (id && ddragon ? ddragon.nameForId(id) : null);
  const localCell = session.localPlayerCellId;
  state.me.cellId = typeof localCell === 'number' ? localCell : null;

  const myCells = new Set((session.myTeam || []).map((p) => p.cellId));

  // Locked picks from completed pick actions (championId on team arrays includes hovers
  // in some client versions, so completed actions are the reliable "locked" signal).
  const lockedByCell = new Map();
  const bansAlly = [];
  const bansEnemy = [];
  let anyBanning = false, anyPicking = false;

  for (const group of session.actions || []) {
    for (const action of group || []) {
      if (action.type === 'ban') {
        if (!action.completed) { anyBanning = anyBanning || action.isInProgress; continue; }
        const n = nameOf(action.championId);
        if (!n) continue;
        const isAlly = typeof action.isAllyAction === 'boolean'
          ? action.isAllyAction
          : myCells.has(action.actorCellId);
        (isAlly ? bansAlly : bansEnemy).push(n);
      } else if (action.type === 'pick') {
        if (action.completed && action.championId) lockedByCell.set(action.actorCellId, action.championId);
        else if (action.isInProgress) anyPicking = true;
      }
    }
  }
  state.bans.ally = bansAlly;
  state.bans.enemy = bansEnemy;

  for (const p of session.myTeam || []) {
    const lockedId = lockedByCell.get(p.cellId) || (p.championId || null);
    const hoverId = p.championPickIntent || null;
    const champ = nameOf(lockedId) || nameOf(hoverId);
    const role = normalizeRole(p.assignedPosition);
    state.myTeam.push({ champion: champ, role, cellId: p.cellId, locked: Boolean(lockedByCell.get(p.cellId) || p.championId) });
    if (p.cellId === localCell) {
      state.me.role = role;
      state.me.lockedChampion = lockedByCell.get(p.cellId) || p.championId ? nameOf(lockedByCell.get(p.cellId) || p.championId) : null;
      state.me.hoverChampion = nameOf(hoverId);
    }
  }

  for (const p of session.theirTeam || []) {
    const champ = nameOf(p.championId) || nameOf(p.championPickIntent);
    state.enemyTeam.push({
      champion: champ,
      role: normalizeRole(p.assignedPosition), // usually null for enemies — engine handles that
      cellId: p.cellId,
      locked: Boolean(p.championId),
    });
  }

  const timerPhase = session.timer && session.timer.phase;
  state.phase = timerPhase === 'BAN_PICK'
    ? (anyBanning && !anyPicking ? 'banning' : 'picking')
    : timerPhase === 'FINALIZATION' ? 'finalizing'
    : anyBanning ? 'banning' : 'picking';

  return state;
}

module.exports = { parseChampSelect };
