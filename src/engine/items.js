'use strict';
// Item/build recommendation: default path per champion (prefs > knowledge > archetype),
// plus situational counter-items re-evaluated as the enemy comp fills in.

const { teamProfile } = require('./recommend');

function recommendItems(store, profile, state, championName) {
  const c = store.canonicalName(championName) || championName;
  const prefs = (profile.preferences && profile.preferences.builds) || {};
  const a = store.attrs(c);

  let build, source;
  if (prefs[c]) { build = prefs[c]; source = 'your override'; }
  else if (store.buildOverride(c)) { build = store.buildOverride(c); source = 'champion default'; }
  else {
    build = (store.knowledge.archetype_builds || {})[a.archetype] ||
            (store.knowledge.archetype_builds || {}).generic;
    source = `archetype default (${a.archetype})`;
  }

  const enemyNames = state.enemyTeam.map((p) => p.champion).filter(Boolean);
  const enemies = teamProfile(enemyNames, store);
  const situational = [];

  if (enemies.sustain >= 2 || (enemies.count && enemies.sustain / Math.max(enemies.count, 1) >= 0.4)) {
    situational.push({
      item: a.damage === 'AP' ? 'Oblivion Orb → Morellonomicon' : a.frontline ? 'Bramble Vest → Thornmail' : "Executioner's Calling → Chempunk Chainsword",
      why: `Anti-heal: ${enemies.sustain} enemy champions with strong sustain/healing`,
    });
  }
  if (enemies.ad >= 3) {
    situational.push({
      item: a.frontline ? "Thornmail / Randuin's Omen" : a.damage === 'AP' ? "Zhonya's Hourglass (rush earlier)" : 'Plated Steelcaps + Death\'s Dance / GA',
      why: `${Math.round(enemies.ad)} AD threats on the enemy team`,
    });
  }
  if (enemies.ap >= 3) {
    situational.push({
      item: a.frontline ? "Force of Nature / Spirit Visage" : a.damage === 'AP' ? "Banshee's Veil" : 'Maw of Malmortius / Wit\'s End',
      why: `${Math.round(enemies.ap)} AP threats on the enemy team`,
    });
  }
  if (enemies.cc >= 3) {
    situational.push({ item: "Mercury's Treads", why: 'CC-heavy enemy comp (tenacity)' });
  }
  if (enemies.dive >= 2 && !a.frontline) {
    situational.push({
      item: a.damage === 'AP' ? "Zhonya's Hourglass" : a.archetype === 'marksman' ? "Guardian Angel / Shieldbow" : "Sterak's Gage",
      why: '2+ dive/assassin threats targeting you',
    });
  }

  return { champion: c, source, build, situational };
}

module.exports = { recommendItems };
