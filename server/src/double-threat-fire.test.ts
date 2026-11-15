import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { enemyAiLevels } from '../../shared/enemy-ai.mjs';
import { fireIntervalMs } from '../../shared/protocol.mjs';
import { journeyDallas16, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallasTwinHunters01 } from '../../shared/journey-mission.mjs';
import { doubleThreatFireProfile } from './journey-crossfire.js';
import { opponentAim } from './opponent.js';

test('M17 fires four times as often with one quarter angular error', () => {
  assert.equal(doubleThreatFireProfile.shotIntervalMs, enemyAiLevels.HARD.shotIntervalMs / 4);
  for (const axis of ['x', 'y'] as const) {
    const aim = opponentAim(doubleThreatFireProfile, 0, 0, () => 1);
    assert.ok(Math.abs(Math.atan(aim[axis]) - enemyAiLevels.HARD.aimError / 4) < 1e-12);
  }
  assert.equal(doubleThreatFireProfile.tactics, enemyAiLevels.HARD.tactics);
  assert.equal(enemyAiLevels.HARD.shotIntervalMs, 400);
});

test('projectile cooldown permits M17 rate for both enemies without changing M15 or ordinary aircraft', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'fireBlockReason')!;
  const code = ts.transpileModule(fn.getText(ast), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const ctx = vm.createContext({doubleThreatFireProfile, journeyDallas16, journeyDallas08, journeyDallas09, journeyDallas10, fireIntervalMs, runwayCombatProtected: () => false});
  vm.runInContext(code, ctx);
  for (const enemy of journeyDallas16.enemies) {
    const player = {entityType: 'player', lifeState: 'alive', lastFireAt: 1000, aircraftType: enemy.aircraft, bot: {journeyCrossfireMissionId: journeyDallas16.id}};
    assert.equal(ctx.fireBlockReason(player, 1099), 'cooldown');
    assert.equal(ctx.fireBlockReason(player, 1100), undefined);
    player.bot.journeyCrossfireMissionId = journeyDallasTwinHunters01.id;
    assert.equal(ctx.fireBlockReason(player, 1100), 'cooldown');
    assert.equal(ctx.fireBlockReason({...player, bot: undefined}, 1100), 'cooldown');
  }
  assert.ok(source.includes('opponentAim(firingProfile,solution.aimX,solution.aimY)'));
  assert.ok(source.includes('player.lastFireAt + firingProfile.shotIntervalMs'));
  assert.ok(source.includes('canShoot ? firingProfile.shotIntervalMs : 200'));
});
