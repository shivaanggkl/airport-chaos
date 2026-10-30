import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const menu = read('client/src/pilot-menu.ts');
const notice = read('client/public/osm-data-license.txt');
const preprocess = read('scripts/preprocess-osm.mjs');
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
  const directory = mkdtempSync(join(tmpdir(), 'osm-provenance-'));
  try {
    const provenance = { provider: 'fixture', sourceUrl: 'https://www.openstreetmap.org', pipelineVersion: 'fixture-v3' };
    const chunks = ['near', 'mid', 'far'].map(lod => ({ id: 'cell', lod, filename: `${lod}.json`, bytes: 0 }));
    const manifest = { v: 3, chunks, provenance, attribution: '© OpenStreetMap contributors', license: 'ODbL' };
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
    for (const chunk of chunks) writeFileSync(join(directory, chunk.filename), JSON.stringify({ b: [], provenance }));
    const near = readFileSync(join(directory, 'near.json'), 'utf8');
    execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/chunk-dallas-data.mjs', import.meta.url)), directory]);
    const updated = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    assert.deepEqual(updated.provenance, provenance);
    assert.equal(updated.attribution, manifest.attribution);
    assert.equal(updated.license, manifest.license);
    assert.equal(readFileSync(join(directory, 'near.json'), 'utf8'), near);
    for (const lod of ['mid', 'far']) assert.deepEqual(JSON.parse(readFileSync(join(directory, `${lod}.json`), 'utf8')).provenance, provenance);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
