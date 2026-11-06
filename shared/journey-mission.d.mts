export type JourneyPoint = Readonly<{ x: number; y: number; z: number }>;
export const journeyPauseLimitMs: 120000;
export const journeyDallas01: Readonly<{
  id: 'journey-dallas-01'; cityId: 'dallas'; name: 'ROOKIE RUSH'; chapter: 'GOLDEN GATES';
  timeLimitMs: 150000; firstClearCredits: 250;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas02: Readonly<{
  id: 'journey-dallas-02'; cityId: 'dallas'; name: 'LAKE RACER'; chapter: 'GOLDEN GATES';
  firstClearCredits: 350; timeLimitMs: 150000;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas03: Readonly<{
  id: 'journey-dallas-03'; cityId: 'dallas'; name: 'GOLDEN ASCENT'; chapter: 'GOLDEN GATES';
  timeLimitMs: 160000; firstClearCredits: 450;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas04: Readonly<{
  id: 'journey-dallas-04'; cityId: 'dallas'; name: 'DOWNTOWN SLALOM'; chapter: 'GOLDEN GATES';
  firstClearCredits: 500; timeLimitMs: 160000;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas05: Readonly<{
  id: 'journey-dallas-05'; cityId: 'dallas'; name: 'NEEDLE RUSH'; chapter: 'GOLDEN GATES';
  timeLimitMs: 160000; firstClearCredits: 600;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas06: Readonly<{
  id: 'journey-dallas-06'; cityId: 'dallas'; name: 'GOLDEN CHAMPIONSHIP'; chapter: 'GOLDEN GATES';
  timeLimitMs: 160000; firstClearCredits: 750;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas07: Readonly<{
  id: 'journey-dallas-07'; cityId: 'dallas'; name: 'GIANT PLANE'; chapter: 'SKY SIEGE';
  timeLimitMs: number; firstClearCredits: 850; startAirportId: 'dfw'; bossHealth: 2000;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas08: Readonly<{
  id: 'journey-dallas-08'; cityId: 'dallas'; name: 'GIANT PLANE & TWO ESCORTS'; chapter: 'SKY ADVENTURES';
  firstClearCredits: 950; startAirportId: 'dfw'; timeLimitMs: 300000; bossHealth: 2000;
  escortHealth: 1000; escortCount: 2; escortScale: 16; escortFireDelayMs: 5000;
  escortAircraft: readonly ['trainer', 'trainer'];
  escortLiveries: readonly ['bluejay-skybolt', 'bluejay-aurora'];
  escortBurstIntervalMs: 6000; escortShotSpacingMs: 250; escortShotDamage: 10; followMs: 15000;
  minDistance: 80; maxDistance: 450; maxTailAngle: number;
  maxHeadingDifference: number; maxAltitudeDifference: 100;
  leaderCruiseFactor: 0.45;
  leaderRoute: readonly Readonly<{ x: number; z: number }>[];
}>;
export const journeyDallas09: Readonly<{
  id: 'journey-dallas-09'; cityId: 'dallas'; name: 'GIANT PLANE & THREE ESCORTS'; chapter: 'SKY ADVENTURES';
  firstClearCredits: 1050; startAirportId: 'dfw'; timeLimitMs: 330000; bossHealth: 2000;
  escortCount: 3; initialEscortCount: 3; escortScale: 16;
  escortHealth: readonly [75, 125, 175];
  escortAircraft: readonly ['trainer', 'cargo', 'privateJet'];
  escortLiveries: readonly ['bluejay-aurora', 'mammoth-sand', 'nightowl-forest'];
  reinforcementThreshold: 0.5; reinforcementWarningMs: 3000; reinforcementFireDelayMs: 3000;
  escortFireDelayMs: 5000; escortBurstIntervalMs: 4000; initialEscortBurstIntervalMs: 6000;
  escortShotSpacingMs: 250; escortShotDamage: 10;
}>;
export const journeyDallas10: Readonly<{
  id: 'journey-dallas-10'; cityId: 'dallas'; name: 'GIANT PLANE & FOUR ESCORTS'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 330000; firstClearCredits: 1150; startAirportId: 'dfw'; bossHealth: 2000;
  escortCount: 4; escortScale: 16; escortHealth: readonly [175, 225, 175, 225];
  escortAircraft: readonly ['privateJet', 'cargo', 'privateJet', 'cargo'];
  escortLiveries: readonly ['nightowl-forest', 'mammoth-sand', 'nightowl-royal-violet', 'mammoth-desert-sand'];
  escortFireDelayMs: 5000; escortBurstIntervalMs: 6000;
  escortShotSpacingMs: 250; escortShotDamage: 10;
  gunBurstIntervalMs: 3000; gunWarningMs: 1000;
  gunShotSpacingMs: 250; gunShotDamage: 10;
}>;
export const journeyDallas11: Readonly<{
  id: 'journey-dallas-11'; cityId: 'dallas'; name: 'ARMORED GIANT PLANE'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 330000; firstClearCredits: 1250; startAirportId: 'dfw';
  turretHealth: 250; coreHealth: 1500;
  hatch: Readonly<{ z: 22.05; bottom: -0.45; width: 3.85; height: 3.35 }>;
  coreLocal: Readonly<{ x: 0; y: 1.2; z: 21.2 }>; coreRadius: 0.9;
  gunBurstIntervalMs: 3000; gunWarningMs: 1000;
  gunShotSpacingMs: 250; gunShotDamage: 10;
}>;
export const journeyDallas12: Readonly<{
  id: 'journey-dallas-12'; cityId: 'dallas'; name: 'ARMORED GIANT PLANE & TWO ESCORTS'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 360000; firstClearCredits: 1500; startAirportId: 'dfw';
  turretHealth: 250; coreHealth: 1750;
  escortCount: 2; escortScale: number; escortHealth: readonly [175, 225];
  escortAircraft: readonly ['privateJet', 'fighter']; escortLiveries: readonly ['nightowl-forest', 'firehawk-inferno'];
  escortFireDelayMs: 5000; escortBurstIntervalMs: 6000; escortShotSpacingMs: 250; escortShotDamage: 10;
  gunBurstIntervalMs: 3000; gunWarningMs: 1000; gunShotSpacingMs: 250; gunShotDamage: 10;
}>;
export const journeyDallas13: Readonly<{
  id: 'journey-dallas-13'; cityId: 'dallas'; name: 'FIRST CONTACT'; chapter: 'SKY HUNTERS';
  timeLimitMs: 240000; firstClearCredits: 1650; startAirportId: 'dfw';
  enemyAircraft: 'privateJet'; enemyLivery: 'nightowl-sunset-red'; enemyHealth: 150;
  enemyAltitude: 800; aggressionDistance: 10000; patrolRadius: 1500; cruiseSpeed: 400;
  enemySpawn: Readonly<{ x: number; z: number }>;
}>;
export const journeyDallas14: Readonly<{
  id: 'journey-dallas-14'; cityId: 'dallas'; name: 'SURPRISE ATTACK'; chapter: 'SKY HUNTERS';
  timeLimitMs: 240000; firstClearCredits: 1800; startAirportId: 'love';
  enemyAircraft: 'trainer'; enemyLivery: 'bluejay-aurora'; enemyHealth: 150;
  enemyAltitude: 800; aggressionDistance: 10000; patrolRadius: 1500; cruiseSpeed: 460;
  warningMs: 3000; rearApproachMs: 18000; enemySpawn: Readonly<{ x: number; z: number }>;
}>;
export const journeyDallas15: Readonly<{
  id: 'journey-dallas-15'; cityId: 'dallas'; name: 'HOT PURSUIT'; chapter: 'SKY HUNTERS';
  firstClearCredits: 1950; startAirportId: 'addison'; bossName: 'ESCAPING MAMMOTH'; bossHealth: 200;
  timeLimitMs:300000; enemyAircraft:'cargo'; enemyLivery:'mammoth-sand'; enemyAltitude:800;
  enemySpawn:Readonly<{x:number;z:number}>; cruiseSpeed:420; threatDistance:10000; arrivalRadius:650;
  escapeRoute:readonly Readonly<{x:number;z:number}>[];
}>;
export const journeyDallas16: Readonly<{
  id:'journey-dallas-16';cityId:'dallas';name:'DOUBLE THREAT';chapter:'SKY HUNTERS';
  firstClearCredits:2100;startAirportId:'dfw';timeLimitMs:300000;enemyHealth:100;aggressionDistance:10000;
  enemies:readonly Readonly<{aircraft:'privateJet'|'trainer';livery:string;x:number;z:number;altitude:number}>[];
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas17:Readonly<{
  id:'journey-dallas-17';cityId:'dallas';name:'IRON HUNTER';chapter:'SKY HUNTERS';firstClearCredits:2250;
  startAirportId:'executive';timeLimitMs:360000;enemyAircraft:'cargo';enemyLivery:'mammoth-desert-sand';enemyHealth:250;
  enemyAltitude:800;aggressionDistance:10000;patrolRadius:2000;cruiseSpeed:400;enemySpawn:Readonly<{x:number;z:number}>;
}>;
export const journeyDallas18: Readonly<{
  id: 'journey-dallas-18'; cityId: 'dallas'; name: 'FINAL SHOWDOWN'; chapter: 'SKY HUNTERS'; firstClearCredits: 2400;
  startAirportId: 'dfw'; timeLimitMs: 420000; enemyAircraft: 'fighter'; enemyLivery: 'firehawk-inferno'; enemyHealth: 300;
  enemyAltitude: 900; aggressionDistance: 10000; patrolRadius: 2500; cruiseSpeed: 600;
  enemySpawn: Readonly<{x:number;z:number}>; enemyDamage: 20; shotIntervalMs: 750; burstShots: 2; burstPauseMs: 2000;
}>;
export const journeyDallas19: Readonly<{
  id: 'journey-dallas-19'; cityId: 'dallas'; name: 'MONSTER ARRIVAL'; chapter: 'CITY DEFENDERS';
  firstClearCredits: 2550; startAirportId:'dfw'; runwayStart:true; prepareMs: 0; timeLimitMs: 240000; bossHealth: 2500;
  monster: Readonly<{ x: number; z: number; height: number }>;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
}>;
export const journeyDallas20: Readonly<{
  id: 'journey-dallas-20'; cityId: 'dallas'; name: 'ARMORED APEX'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 2700; startAirportId: 'love'; timeLimitMs: 240000;prepareMs:0;bossHealth:3000;monster:typeof journeyDallas19.monster;airborneSpawn:typeof journeyDallas19.airborneSpawn;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export const journeyDallas21: Readonly<{
  id: 'journey-dallas-21'; cityId: 'dallas'; name: 'TWO FRONTS'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 2850; startAirportId: 'love'; alphaTerritoryId: 'addison';
  bravoTerritoryId: 'dallas-executive'; captureMs: 6000; transferMs: 120000;
}>;
export const journeyDallas22: Readonly<{
  id: 'journey-dallas-22'; cityId: 'dallas'; name: 'PERFECT APPROACH'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 3000; prepareMs: 3000; finishAirportId: 'dfw'; approachRestartZ: number;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export const journeyDallas23: Readonly<{
  id: 'journey-dallas-23'; cityId: 'dallas'; name: 'DOUBLE TROUBLE'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 3150; startAirportId: 'love'; hunterHealth: 200;
  heartId: 'mission-23-repair-heart'; heartRadius: 115; hunterTwoDelayMs: 2500;
}>;
export const journeyDallas24: Readonly<{
  id: 'journey-dallas-24'; cityId: 'dallas'; name: 'LEGENDARY CHAMPIONSHIP'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 4000; startAirportId: 'love'; finishAirportId: 'dfw'; bossHealth: 300;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export function journeyGatePlane(mission: Readonly<{ gates: readonly { x: number; z: number }[] }>, gateIndex: number):
  { normalX: number; normalZ: number } | null;
export function journeyGateCrossing(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number,
  mission?: typeof journeyDallas01 | typeof journeyDallas02 | typeof journeyDallas03 | typeof journeyDallas04 | typeof journeyDallas05 | typeof journeyDallas06 | typeof journeyDallas07 | typeof journeyDallas10 | typeof journeyDallas11 | typeof journeyDallas16 | typeof journeyDallas20 | typeof journeyDallas22 | typeof journeyDallas24): false | 'VALID' | 'TOO_HIGH';
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;

export declare const journeyMissionOrder: readonly string[];
export declare function journeyMissionSlot(missionId:string):number;
