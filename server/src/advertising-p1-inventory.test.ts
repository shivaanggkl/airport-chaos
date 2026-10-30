import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const inventory = JSON.parse(readFileSync(new URL('../../docs/advertising-p0-inventory.json', import.meta.url), 'utf8'));
const qualification = JSON.parse(readFileSync(new URL('../../docs/advertising-p1-qualification.json', import.meta.url), 'utf8'));
type Placement = {
  id: string; cityId: string; type: string; campaignId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
};

test('P1 qualification covers each real Dallas placement once without changing geometry or commercial state', async () => {
  const sourceModule = new URL('../../client/src/dallas-world.ts', import.meta.url).href;
  const { adPlacements } = await import(sourceModule) as { adPlacements: Placement[] };
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(qualification.schemaVersion, 1);
  assert.equal(qualification.commercialActivation, 'DISABLED');
  assert.equal(adPlacements.length, 150);
  assert.deepEqual(inventory.counts, { authored: 102, generated: 48, total: 150 });
  const sourceIds = adPlacements.map(placement => placement.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  assert.deepEqual(new Set(inventory.placements.map((placement: { id: string }) => placement.id)), new Set(sourceIds));
  assert.deepEqual(new Set(qualification.placements.map((placement: { id: string }) => placement.id)), new Set(sourceIds));
  assert.equal(qualification.placements.length, sourceIds.length);

  const authored = inventory.placements.filter((placement: { origin: string }) => placement.origin === 'authored');
  const generated = inventory.placements.filter((placement: { origin: string }) => placement.origin === 'generated');
  assert.equal(authored.length, 102);
  assert.equal(generated.length, 48);
  const expectedGenerated = Array.from({ length: 3 * 4 * 4 }, (_, index) =>
    `dallas-skyboard-upper-${Math.floor(index / 16)}-${Math.floor((index % 16) / 4)}-${index % 4}`);
  assert.deepEqual(new Set(generated.map((placement: { id: string }) => placement.id)), new Set(expectedGenerated));

  for (const placement of adPlacements) {
    const recorded = inventory.placements.find((item: { id: string }) => item.id === placement.id);
    const qualified = qualification.placements.find((item: { id: string }) => item.id === placement.id);
    assert.ok(recorded && qualified, placement.id);
    assert.equal(recorded.city, placement.cityId);
    assert.equal(recorded.category, placement.type);
    assert.equal(recorded.campaignId, placement.campaignId);
    assert.equal(recorded.commercialStatus, 'NOT_APPROVED');
    assert.deepEqual(recorded.renderedPosition, placement.position);
    assert.deepEqual(recorded.renderedSize, placement.size);
    assert.deepEqual(recorded.rotation, placement.rotation);
    assert.ok(['HOUSE_ONLY', 'CANDIDATE', 'QA_APPROVED', 'BLOCKED'].includes(qualified.status));
    assert.ok(typeof qualified.reasonCode === 'string' && qualified.reasonCode.length > 0);
    assert.ok(Array.isArray(qualified.evidence));
    if (qualified.status === 'QA_APPROVED') assert.ok(qualified.evidence.length > 0);
    for (const relativePath of qualified.evidence) {
      assert.match(relativePath, /^advertising-p1-evidence\/[a-z0-9-]+\.png$/);
      assert.ok(existsSync(new URL(`../../docs/${relativePath}`, import.meta.url)), relativePath);
    }
    for (const vector of [placement.position, placement.rotation, placement.size]) {
      assert.ok(Object.values(vector).every(value => Number.isFinite(value)));
    }
    assert.ok(placement.size.x > 0 && placement.size.y > 0 && placement.size.z >= 0, placement.id);
    if (placement.size.z === 0) assert.ok(['AIRPORT_GROUND_SPONSOR', 'GROUND_SPONSOR'].includes(placement.type));
  }
});
