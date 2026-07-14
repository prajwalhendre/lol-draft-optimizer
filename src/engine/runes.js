'use strict';
// Rune recommendation: champion default page (user prefs > knowledge base > archetype default),
// then contextual adjustments from the actual enemy draft.

const { teamProfile } = require('./recommend');

function recommendRunes(store, profile, state, championName) {
  const c = store.canonicalName(championName) || championName;
  const prefs = (profile.preferences && profile.preferences.runes) || {};
  const a = store.attrs(c);

  let page, source;
  if (prefs[c]) { page = prefs[c]; source = 'your override'; }
  else if (store.runeOverride(c)) { page = store.runeOverride(c); source = 'champion default'; }
  else {
    page = (store.knowledge.archetype_runes || {})[a.archetype] ||
           (store.knowledge.archetype_runes || {}).generic;
    source = `archetype default (${a.archetype})`;
  }

  const notes = [];
  const enemyNames = state.enemyTeam.map((p) => p.champion).filter(Boolean);
  const enemies = teamProfile(enemyNames, store);
  const laneOpp = state.enemyTeam.find((p) => p.champion && p.role === state.me.role);

  if (laneOpp) {
    const oppDetail = store.detailed(laneOpp.champion);
    const myDetail = store.detailed(c, state.me.role);
    if (myDetail && Array.isArray(myDetail.countered_by) && myDetail.countered_by.includes(laneOpp.champion)) {
      notes.push(`Tough lane vs ${laneOpp.champion}: consider Second Wind + Doran's Shield to survive early.`);
    } else if (oppDetail && Array.isArray(oppDetail.countered_by) && oppDetail.countered_by.includes(c)) {
      notes.push(`Favorable lane vs ${laneOpp.champion}: your standard page is fine — play for early pressure.`);
    }
    const oppAttrs = store.attrs(laneOpp.champion);
    if (oppAttrs.sustain) notes.push(`${laneOpp.champion} has strong sustain: plan an early anti-heal purchase (see items).`);
    if (oppAttrs.poke) notes.push(`${laneOpp.champion} is poke-heavy: Second Wind / biscuits are worth the swap.`);
  }
  if (enemies.cc >= 3) notes.push('Enemy comp is CC-heavy: swap Legend rune to Legend: Tenacity (or take Unflinching) and consider Mercury\'s Treads.');
  if (enemies.dive >= 2 && !a.frontline) notes.push('2+ dive threats: consider a defensive secondary (Bone Plating / Guardian) over damage.');
  if (enemies.ap >= 3) notes.push('Heavy AP comp: magic-resist shard over armor in the third slot.');
  if (enemies.ad >= 3) notes.push('Heavy AD comp: armor shard in the third slot.');

  return { champion: c, source, page, notes };
}

module.exports = { recommendRunes };
