'use strict';
const test = require('node:test');
const assert = require('node:assert');

const { indexCache } = require('../src/engine/ddragon');

// indexCache does no network I/O -- it just wraps an already-fetched payload,
// so it's safe to test directly without mocking fetch.
const store = indexCache({
  version: '26.13.1',
  champions: {
    86: { id: 'Garen', key: '86', name: 'Garen', tags: ['Fighter', 'Tank'], info: {} },
    145: { id: 'Kaisa', key: '145', name: "Kai'Sa", tags: ['Marksman'], info: {} },
  },
});

test('splashUrl uses the unversioned Data Dragon splash endpoint (always current)', () => {
  assert.strictEqual(
    store.splashUrl('Garen'),
    'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Garen_0.jpg'
  );
});

test('splashUrl resolves champions with non-alphanumeric display names via ddragon id', () => {
  assert.strictEqual(
    store.splashUrl("Kai'Sa"),
    'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kaisa_0.jpg'
  );
});

test('splashUrl supports alternate skins and is unaffected by the cached patch version', () => {
  assert.strictEqual(
    store.splashUrl('Garen', 5),
    'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Garen_5.jpg'
  );
});

test('splashUrl returns null for unknown champions', () => {
  assert.strictEqual(store.splashUrl('NotAChampion'), null);
});

test('iconUrl stays version-pinned (unlike splashUrl)', () => {
  assert.strictEqual(
    store.iconUrl('Garen'),
    'https://ddragon.leagueoflegends.com/cdn/26.13.1/img/champion/Garen.png'
  );
});
