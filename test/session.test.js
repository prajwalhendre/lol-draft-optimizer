'use strict';
const test = require('node:test');
const assert = require('node:assert');

const { parseChampSelect } = require('../src/lcu/session');

// Minimal fake Data Dragon id map
const ddragon = {
  nameForId: (id) => ({ 86: 'Garen', 157: 'Yasuo', 222: 'Jinx', 412: 'Thresh', 17: 'Teemo', 122: 'Darius' }[id] || null),
};

const fixture = {
  localPlayerCellId: 2,
  timer: { phase: 'BAN_PICK' },
  myTeam: [
    { cellId: 0, championId: 86, championPickIntent: 0, assignedPosition: 'top' },
    { cellId: 2, championId: 0, championPickIntent: 157, assignedPosition: 'middle' },
  ],
  theirTeam: [
    { cellId: 5, championId: 122, championPickIntent: 0, assignedPosition: '' },
  ],
  actions: [
    [
      { id: 1, actorCellId: 0, championId: 17, type: 'ban', completed: true, isAllyAction: true },
      { id: 2, actorCellId: 5, championId: 412, type: 'ban', completed: true, isAllyAction: false },
    ],
    [
      { id: 3, actorCellId: 0, championId: 86, type: 'pick', completed: true, isAllyAction: true },
      { id: 4, actorCellId: 2, championId: 0, type: 'pick', completed: false, isInProgress: true, isAllyAction: true },
    ],
  ],
};

test('parses LCU champ-select session into canonical draft state', () => {
  const s = parseChampSelect(fixture, ddragon);

  assert.deepStrictEqual(s.bans.ally, ['Teemo']);
  assert.deepStrictEqual(s.bans.enemy, ['Thresh']);

  assert.strictEqual(s.me.cellId, 2);
  assert.strictEqual(s.me.role, 'mid'); // 'middle' -> 'mid'
  assert.strictEqual(s.me.lockedChampion, null); // pick in progress, not locked
  assert.strictEqual(s.me.hoverChampion, 'Yasuo'); // championPickIntent

  const ally0 = s.myTeam.find((p) => p.cellId === 0);
  assert.strictEqual(ally0.champion, 'Garen');
  assert.strictEqual(ally0.locked, true);

  assert.strictEqual(s.enemyTeam[0].champion, 'Darius');
  assert.strictEqual(s.enemyTeam[0].role, null); // enemies rarely expose positions

  assert.strictEqual(s.phase, 'picking');
});

test('handles empty/missing session gracefully', () => {
  const s = parseChampSelect(null, ddragon);
  assert.strictEqual(s.phase, 'idle');
  assert.deepStrictEqual(s.myTeam, []);
});
