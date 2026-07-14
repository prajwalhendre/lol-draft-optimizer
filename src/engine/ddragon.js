'use strict';
// Data Dragon: Riot's official, free, versioned static data.
// Fetched once per patch and cached locally; used for champion id->name mapping,
// tags/info (comp scoring fallback), and icon URLs for the overlay.

const fs = require('fs');
const path = require('path');

const DD_BASE = 'https://ddragon.leagueoflegends.com';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data Dragon HTTP ${res.status} for ${url}`);
  return res.json();
}

// Returns { version, byKey: {numericId -> champ}, byName: {displayName -> champ} }
// champ = { id, key, name, tags, info }
async function loadDataDragon(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'ddragon-cache.json');

  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* no cache yet */ }

  let latest = null;
  try {
    const versions = await fetchJson(`${DD_BASE}/api/versions.json`);
    latest = versions[0];
  } catch (err) {
    if (cached) return indexCache(cached); // offline: use whatever we have
    throw new Error(`No network and no Data Dragon cache: ${err.message}`);
  }

  if (cached && cached.version === latest) return indexCache(cached);

  const champData = await fetchJson(`${DD_BASE}/cdn/${latest}/data/en_US/champion.json`);
  const slim = {};
  for (const id of Object.keys(champData.data)) {
    const c = champData.data[id];
    slim[c.key] = { id: c.id, key: c.key, name: c.name, tags: c.tags, info: c.info };
  }
  const payload = { version: latest, champions: slim };
  fs.writeFileSync(cacheFile, JSON.stringify(payload));
  return indexCache(payload);
}

function indexCache(payload) {
  const byKey = payload.champions;
  const byName = {};
  for (const k of Object.keys(byKey)) byName[byKey[k].name] = byKey[k];
  return {
    version: payload.version,
    byKey,
    byName,
    nameForId(id) { const c = byKey[String(id)]; return c ? c.name : null; },
    iconUrl(name) {
      const c = byName[name];
      return c ? `${DD_BASE}/cdn/${payload.version}/img/champion/${c.id}.png` : null;
    },
    // Splash art is served at a fixed, unversioned URL that Riot updates in place
    // (visual reworks replace the same file) -- this is always the current splash,
    // no patch-version bookkeeping needed. skin 0 = default/base splash.
    splashUrl(name, skin = 0) {
      const c = byName[name];
      return c ? `${DD_BASE}/cdn/img/champion/splash/${c.id}_${skin}.jpg` : null;
    },
  };
}

module.exports = { loadDataDragon, indexCache };
