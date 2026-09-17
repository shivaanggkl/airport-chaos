const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export const seasonCatalog = [{
  seasonId: 'season_001_launch', name: 'Launch Season', theme: 'First Flights', cityId: 'dallas', enabled: true,
  startsAt: Date.UTC(2026, 8, 1), endsAt: Date.UTC(2026, 8, 29), rewardTrackId: 'launch_free',
  premiumTrack: { enabled: false, rewards: [] }, featuredCosmeticId: 'bluejay-launch', sponsorSlotId: undefined,
  rewards: [
    { id: 'launch-100', points: 100, type: 'credits', amount: 500, label: '500 Credits' },
    { id: 'launch-250', points: 250, type: 'cosmetic', value: 'title-launch-pilot', label: 'Launch Pilot title' },
    { id: 'launch-500', points: 500, type: 'cosmetic', value: 'decal-first-flight', label: 'First Flight decal' },
    { id: 'launch-900', points: 900, type: 'credits', amount: 1500, label: '1,500 Credits' },
    { id: 'launch-1300', points: 1300, type: 'cosmetic', value: 'frame-launch-season', label: 'Launch photo frame' },
    { id: 'launch-1800', points: 1800, type: 'cosmetic', value: 'badge-first-flights-ace', label: 'First Flights Ace badge' },
    { id: 'launch-2500', points: 2500, type: 'cosmetic', value: 'bluejay-launch', label: 'Launch Bluejay skin' },
  ],
  missions: [
    { id: 'launch-landings', label: 'Complete 10 landings', activity: 'landing', target: 10, points: 150 },
    { id: 'launch-events', label: 'Complete 5 Chaos Events', activity: 'event', target: 5, points: 200 },
    { id: 'launch-discoveries', label: 'Find 3 discoveries', activity: 'discovery', target: 3, points: 150 },
  ],
}];

export const weeklyEventCatalog = [
  { id: 'smooth-landing', title: 'Smooth Landing Week', description: 'Complete 3 smooth landings.', activity: 'landing', target: 3, points: 100, credits: 300, leaderboardCategory: 'precisionLanding' },
  { id: 'storm-chaser', title: 'Storm Chaser Week', description: 'Complete 2 weather events.', activity: 'event', target: 2, points: 100, credits: 350, leaderboardCategory: 'events' },
  { id: 'cargo-rush', title: 'Cargo Rush Week', description: 'Complete 3 Chaos Events.', activity: 'event', target: 3, points: 100, credits: 350, leaderboardCategory: 'events' },
  { id: 'airspace-control', title: 'Airspace Control Week', description: 'Capture 3 territories.', activity: 'territoryCapture', target: 3, points: 100, credits: 350, leaderboardCategory: 'territories' },
  { id: 'discovery-week', title: 'Discovery Week', description: 'Find 2 discoveries.', activity: 'discovery', target: 2, points: 100, credits: 300, leaderboardCategory: 'mastery' },
];

export function activeSeasonAt(now = Date.now(), cityId) {
  return seasonCatalog.find(season => season.enabled && now >= season.startsAt && now < season.endsAt && (!season.cityId || season.cityId === cityId));
}

export function utcWeekId(now = Date.now()) {
  const date = new Date(now); const day = date.getUTCDay() || 7;
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1);
  return new Date(monday).toISOString().slice(0, 10);
}

export function activeWeeklyEventAt(season, now = Date.now()) {
  if (!season || now < season.startsAt || now >= season.endsAt) return undefined;
  const week = Math.floor((now - season.startsAt) / WEEK_MS);
  const definition = weeklyEventCatalog[week % weeklyEventCatalog.length];
  const weekStart = season.startsAt + week * WEEK_MS;
  return { ...definition, weeklyEventId: `${season.seasonId}:${definition.id}:${utcWeekId(weekStart)}`, seasonId: season.seasonId,
    weekStart, weekEnd: Math.min(season.endsAt, weekStart + WEEK_MS), cityId: season.cityId };
}

export function seasonRewardStates(season, points, claimedIds = []) {
  const claimed = new Set(claimedIds);
  return (season?.rewards ?? []).map(reward => ({ ...reward, state: claimed.has(reward.id) ? 'claimed' : points >= reward.points ? 'claimable' : 'locked' }));
}

export const seasonPointsByActivity = Object.freeze({ landing: 20, event: 35, discovery: 25, challenge: 30, kill: 25, territoryCapture: 25, mission: 50, record: 20, dailyComplete: 75 });
