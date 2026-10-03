const sentence = (value) => (value ?? '').split('\n')[0].trim().replace(/[.!?]+$/, '');
const count = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
const measurableTypes = new Set([
  'airborneHold', 'straightDistance', 'airportLandings', 'territoryHold',
  'territoryOwn', 'territorySequence', 'territoryUniqueKills', 'airportEmpire',
  'liveScoreRank', 'sequentialTour', 'precisionLanding',
]);

function compactFallback(description) {
  const objective = sentence(description);
  return objective.length <= 72 ? objective : `${objective.slice(0, 69).trimEnd()}…`;
}

function namedHoldObjective(definition) {
  const objective = sentence(definition.description).replace(/\s+(?:for|continuously for)\s+\d+\s+minutes?$/i, '');
  if (objective.length <= 72) return objective;
  const territoryCount = definition.requirements.requiredTerritoryIds?.length
    ?? definition.requirements.territoryIds?.length
    ?? 1;
  return `Own ${territoryCount} ${territoryCount === 1 ? 'territory' : 'territories'} and hold`;
}

export function missionHudObjective(definition) {
  const requirements = definition.requirements;
  switch (definition.type) {
    case 'airborneHold': return `Stay airborne for ${count(requirements.durationSeconds, 60)} seconds`;
    case 'destinationLanding': return sentence(definition.description).replace(/^Land safely at /i, 'Land at ');
    case 'straightDistance': return `Fly ${Math.round((requirements.meters ?? 0) / 1_000)} km without landing`;
    case 'airportLandings': return `Land at all ${requirements.airportIds?.length ?? 0} airports`;
    case 'assignedHunter': return 'Destroy the marked Hunter';
    case 'humanKill': return 'Destroy one real pilot';
    case 'territoryHold': return namedHoldObjective(definition);
    case 'territoryOwn': {
      if (requirements.allCityTerritories) return 'Control every city territory';
      const territories = requirements.territoryIds?.length ?? 0;
      return `Control ${territories} ${territories === 1 ? 'territory' : 'territories'} at once`;
    }
    case 'event':
      if (requirements.eventType === 'aceIntercept') return 'Destroy the marked Ace';
      if (requirements.eventType === 'vipEscort') return 'Escort the VIP through all checkpoints';
      if (requirements.eventType === 'goldenSkyRun') return 'Complete all gold gates before time expires';
      return compactFallback(definition.description);
    case 'wantedSurvival': return 'Reach Danger 5 and survive Most Wanted';
    case 'precisionLanding': {
      const airport = sentence(definition.description).match(/^Land at (.+?) with /i)?.[1] ?? 'the marked airport';
      return `Land at ${airport} with ${requirements.minimumScore ?? 0}+ quality`;
    }
    case 'territoryUniqueKills': {
      const territory = sentence(definition.description).match(/^Control (.+?) and destroy/i)?.[1] ?? 'the required territory';
      return `Hold ${territory} and destroy ${requirements.uniqueKills ?? 0} enemies`;
    }
    case 'airportEmpire': return `Control and land at all ${requirements.airportIds?.length ?? 0} airports`;
    case 'liveScoreRank': return `Hold #1 for ${Math.round((requirements.durationSeconds ?? 0) / 60)} minutes`;
    case 'sequentialTour': return `Complete all ${requirements.steps?.length ?? 0} tour steps`;
    default: return compactFallback(definition.description);
  }
}

function clock(seconds) {
  const total = count(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function missionHudProgress(definition, progress) {
  const target = Number.isFinite(progress.target) && progress.target > 0 ? progress.target : 1;
  const value = Math.min(target, Math.max(0, Number.isFinite(progress.value) ? progress.value : 0));
  const measurable = measurableTypes.has(definition.type)
    || (definition.type === 'event' && target > 1)
    || (definition.type === 'wantedSurvival' && target > 1);

  if (!measurable) return { text: 'IN PROGRESS', barValue: undefined, barMax: undefined };

  let text;
  if (definition.type === 'airborneHold') text = `${count(value)} / ${count(target)} sec`;
  else if (definition.type === 'territoryHold' || definition.type === 'liveScoreRank') text = `${clock(value)} / ${clock(target)}`;
  else if (definition.type === 'straightDistance') text = `${(value / 1_000).toFixed(1)} / ${(target / 1_000).toFixed(0)} km`;
  else if (definition.type === 'precisionLanding') text = `${count(value)} / ${count(target)} points`;
  else if (definition.type === 'wantedSurvival') text = `${count(value)} / ${count(target)} Danger`;
  else if (definition.type === 'event') text = `${count(value)} / ${count(target)} ${definition.requirements.eventType === 'goldenSkyRun' ? 'gates' : 'checkpoints'}`;
  else if (definition.type === 'airportLandings' || definition.type === 'airportEmpire') text = `${count(value)} / ${count(target)} landings`;
  else if (definition.type === 'territoryOwn' || definition.type === 'territorySequence') text = `${count(value)} / ${count(target)} territories`;
  else if (definition.type === 'territoryUniqueKills') text = `${count(value)} / ${count(target)} kills`;
  else if (definition.type === 'sequentialTour') text = `${count(value)} / ${count(target)} steps`;
  else text = `${count(value)} / ${count(target)}`;

  return { text, barValue: value, barMax: target };
}
