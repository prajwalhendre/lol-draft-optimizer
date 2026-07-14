'use strict';
// Central data store: meta/tier snapshot, champion knowledge base, optional Data Dragon cache.
// The meta_tier_snapshot.json file is the source-of-truth patch snapshot (swapped wholesale per patch).
// IMPORTANT semantics (see proposal §4.2):
//  - `score` is METAsrc composite (30-67 range), used for meta-strength weighting. NOT a win rate.
//  - `win_rate` is the actual win % (detailed entries only), used for display only.
//  - `countered_by` on champion X = champions X STRUGGLES AGAINST (they counter X).

const fs = require('fs');
const path = require('path');

const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];

// LCU assignedPosition -> our role names
const LCU_ROLE_MAP = {
  top: 'top', jungle: 'jungle', middle: 'mid', mid: 'mid',
  bottom: 'adc', adc: 'adc', utility: 'support', support: 'support',
};

function normalizeRole(r) {
  if (!r) return null;
  return LCU_ROLE_MAP[String(r).toLowerCase()] || null;
}

function createStore({ snapshot, knowledge, ddragon = null }) {
  // Index snapshot
  const byChampRole = new Map(); // "name|role" -> entry (detailed entries carry countered_by/duos)
  const detailedByChamp = new Map(); // name -> [detailed entries]
  const allNames = new Set();

  for (const e of snapshot.detailed_champions || []) {
    byChampRole.set(`${e.champion}|${e.role}`, { ...e, detailed: true });
    if (!detailedByChamp.has(e.champion)) detailedByChamp.set(e.champion, []);
    detailedByChamp.get(e.champion).push(e);
    allNames.add(e.champion);
  }
  for (const e of snapshot.tier_only_champions || []) {
    const k = `${e.champion}|${e.role}`;
    if (!byChampRole.has(k)) byChampRole.set(k, { ...e, detailed: false });
    allNames.add(e.champion);
  }
  if (ddragon && ddragon.byName) for (const n of Object.keys(ddragon.byName)) allNames.add(n);

  const lowerIndex = new Map();
  for (const n of allNames) lowerIndex.set(n.toLowerCase(), n);

  function canonicalName(input) {
    if (!input) return null;
    const q = String(input).trim().toLowerCase();
    if (lowerIndex.has(q)) return lowerIndex.get(q);
    // prefix / substring fuzzy match
    let hit = null;
    for (const [low, orig] of lowerIndex) {
      if (low.startsWith(q)) { if (hit) return null; hit = orig; }
    }
    if (hit) return hit;
    for (const [low, orig] of lowerIndex) {
      if (low.replace(/[^a-z]/g, '').includes(q.replace(/[^a-z]/g, ''))) { if (hit) return null; hit = orig; }
    }
    return hit;
  }

  function entry(name, role) { return byChampRole.get(`${name}|${role}`) || null; }

  // Detailed entry for a champion in any role (prefer given role).
  function detailed(name, role = null) {
    if (role) {
      const e = entry(name, role);
      if (e && e.detailed) return e;
    }
    const list = detailedByChamp.get(name);
    return list && list.length ? list[0] : null;
  }

  // Champion attributes for comp scoring: curated overrides win, Data Dragon tags fill gaps.
  const attrCache = new Map();
  function attrs(name) {
    if (attrCache.has(name)) return attrCache.get(name);
    const base = {
      damage: 'AD', archetype: 'generic', frontline: false, engage: false, poke: false,
      waveclear: false, peel: false, ccHeavy: false, diver: false, sustain: false, known: false,
    };
    const dd = ddragon && ddragon.byName ? ddragon.byName[name] : null;
    if (dd) {
      base.known = true;
      const tags = dd.tags || [];
      const info = dd.info || {};
      base.damage = (info.magic || 0) > (info.attack || 0) + 2 ? 'AP'
        : (info.attack || 0) > (info.magic || 0) + 2 ? 'AD' : 'mixed';
      if (tags.includes('Tank')) Object.assign(base, { frontline: true, engage: true, ccHeavy: true, archetype: 'engage_tank' });
      else if (tags.includes('Marksman')) base.archetype = 'marksman';
      else if (tags.includes('Assassin')) Object.assign(base, { diver: true, archetype: base.damage === 'AP' ? 'ap_assassin' : 'ad_assassin' });
      else if (tags.includes('Mage')) base.archetype = 'burst_mage';
      else if (tags.includes('Support')) Object.assign(base, { peel: true, archetype: 'enchanter' });
      else if (tags.includes('Fighter')) Object.assign(base, { frontline: (info.defense || 0) >= 5, archetype: 'juggernaut' });
    }
    const override = (knowledge.attributes || {})[name];
    if (override) { Object.assign(base, override); base.known = true; }
    attrCache.set(name, base);
    return base;
  }

  function runeOverride(name) { return (knowledge.runes || {})[name] || null; }
  function buildOverride(name) { return (knowledge.builds || {})[name] || null; }

  return {
    snapshot, knowledge, ddragon, ROLES,
    patch: (snapshot._meta && snapshot._meta.patch) || 'unknown',
    canonicalName, entry, detailed, attrs, runeOverride, buildOverride,
  };
}

function loadStore(rootDir, { ddragon = null, profilePath = null } = {}) {
  const dataDir = path.join(rootDir, 'data');
  const snapshot = JSON.parse(fs.readFileSync(path.join(dataDir, 'meta_tier_snapshot.json'), 'utf8'));
  const knowledge = JSON.parse(fs.readFileSync(path.join(dataDir, 'champion_knowledge.json'), 'utf8'));
  const store = createStore({ snapshot, knowledge, ddragon });
  const pPath = profilePath || path.join(dataDir, 'profile.json');
  const profile = JSON.parse(fs.readFileSync(pPath, 'utf8'));
  return { store, profile };
}

module.exports = { createStore, loadStore, normalizeRole, ROLES };
