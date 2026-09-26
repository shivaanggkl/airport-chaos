import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const menu = read('client/src/pilot-menu.ts');
const notice = read('client/public/osm-data-license.txt');
const preprocess = read('scripts/preprocess-osm.mjs');
const chunker = read('scripts/chunk-dallas-data.mjs');
const dallas = JSON.parse(read('client/public/data/dallas/manifest.json'));
const milwaukeeSource = JSON.parse(read('client/src/data/city1-osm.json'));
const milwaukeePublic = JSON.parse(read('client/public/data/milwaukee/city-osm.json'));

test('Pilot Menu exposes the two required licenses and the data notice', () => {
  assert.match(menu, /'DATA LICENSES'/);
  assert.match(menu, /OpenStreetMap-derived geographic data for Dallas and Milwaukee/);
  assert.match(menu, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.match(menu, /https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\//);
  assert.match(menu, /\/osm-data-license\.txt/);
});

test('published notice covers both cities, ODbL, provenance gaps, and data availability', () => {
  for (const text of ['Dallas-Fort Worth', 'Milwaukee', '© OpenStreetMap contributors', 'Open Database License (ODbL) 1.0', '/data/dallas/manifest.json', '/data/milwaukee/city-osm.json']) {
    assert.match(notice, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(notice, /not record/i);
});

test('checked-in Dallas and Milwaukee datasets contain factual provenance', () => {
  for (const dataset of [dallas, milwaukeeSource, milwaukeePublic]) {
    assert.equal(dataset.attribution, '© OpenStreetMap contributors');
    assert.equal(dataset.license, 'https://opendatacommons.org/licenses/odbl/1-0/');
    assert.equal(dataset.copyright, 'https://www.openstreetmap.org/copyright');
    for (const field of ['derivedFrom', 'provider', 'sourceUrl', 'downloadedAt', 'osmSnapshotAt', 'extractedAt', 'geographicBounds', 'importer', 'pipeline', 'pipelineVersion', 'generatedAt', 'datasetVersion']) {
      assert.ok(dataset.provenance[field] !== undefined, `${dataset.source} missing ${field}`);
    }
  }
  assert.deepEqual(dallas.provenance.geographicBounds, { south: 32.5506, west: -97.064, north: 33.0028, east: -96.53 });
  assert.equal(dallas.provenance.provider, 'not recorded');
  assert.equal(milwaukeeSource.provenance.provider, 'not recorded');
  assert.deepEqual(milwaukeePublic, milwaukeeSource);
});

test('generation pipeline propagates provenance into future manifests', () => {
  for (const field of ['provider', 'sourceUrl', 'downloadedAt', 'osmSnapshotAt', 'extractedAt', 'geographicBounds', 'importer', 'pipelineVersion', 'generatedAt']) {
    assert.match(preprocess, new RegExp(`\\b${field}\\b`));
  }
  assert.match(chunker, /provenance: city\.provenance/);
});
