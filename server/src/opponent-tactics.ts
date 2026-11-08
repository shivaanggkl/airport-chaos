import { hunterBallisticSolution } from './hunter-flight.js';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { COMBAT_RANGE, BASE_PROJECTILE_SPEED } from '../../shared/protocol.mjs';
import { chooseOpponentEvasion, opponentDodge, type OpponentRuntime, type OpponentAircraft, type OpponentBullet } from './opponent.js';

type V = { x:number; y:number; z:number };
export const combatTactics = ['directIntercept','rearIntercept','leadPursuit','lagPursuit','highAttack','lowAttack','attackPass','extendAway','wideReposition','defensiveBreak','energyRecovery','counterattack','disengage'] as const;
export type CombatTactic = typeof combatTactics[number];
export type TacticalPlan = { tactic:CombatTactic; waypoint:V; cruise:number; turnSign:number; until:number };
export type TacticalMemory = {
  passPhase?: 'extend' | 'reposition';
  travelGoal?:V; travelUntil?:number; travelRange?:number; nextExcursionAt?:number;
  targetSampleAt?:number; targetId:string; nextDecision:number; observedAt:number; heading:number; altitude:number;
  targetTurnRate:number; turnBias:number; turning:number; climbing:number; straight:number; threatSince?:number;
  shots:number; hits:number; passShots:number; passHits:number; failures:number; threatDamage:number;
  plan:TacticalPlan; selectedAt:number; range:number; progressAt:number;
  // Bounded encounter-only feedback, exponentially decayed at each observation.
  usefulness:number[]; transitions:{at:number;tactic:CombatTactic}[];
};
export type TacticalAircraft = { lastStateAt?:number; position:V; rotation:V; velocity:V; aircraftType:OpponentAircraft };
export type TacticalInput = {
  targetId:string; target:TacticalAircraft; enemy:TacticalAircraft; speed:number; now:number;
  firingSolution:boolean; lockedByTarget?:boolean; bullets?:readonly OpponentBullet[];
  supportSide?:-1|1; objective?:V; roaming?:boolean; committedPasses?:boolean; cruise:number; floorAt:(x:number,z:number)=>number;
  safeWaypoint?:(from:V,to:V)=>V; inside?:(p:V)=>boolean;
};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const wrap=(x:number)=>Math.atan2(Math.sin(x),Math.cos(x));
const horizontal=(v:V)=>Math.hypot(v.x,v.z);
const dot=(a:V,b:V)=>a.x*b.x+a.z*b.z;
const basicTactics=new Set<CombatTactic>(['directIntercept','attackPass','extendAway','energyRecovery','defensiveBreak']);
const flightBearing=(p:TacticalAircraft)=>horizontal(p.velocity)>aircraftFlightEnvelope[p.aircraftType].stallSpeed?Math.atan2(-p.velocity.x,-p.velocity.z):p.rotation.y;
const forward=(yaw:number):V=>({x:-Math.sin(yaw),y:0,z:-Math.cos(yaw)});

/** Derived from the same bank/yaw equations as advanceHunterFlight; never buffs an airframe. */
export function tacticalFlightSpace(aircraft:OpponentAircraft,speed:number,closing=0, turnAngle=1) {
  const e=aircraftFlightEnvelope[aircraft], ratio=clamp(speed/e.maxSpeed,0,1);
  const turnRate=Math.min(.85*turnAngle, (.42+ratio*.5)*e.yawRate/e.inertia+Math.sin(.65)*ratio*e.bankTurn);
  const radius=Math.max(speed, e.takeoffSpeed)/Math.max(.05,turnRate);
  const rollSeconds=.65/e.rollRate+1/e.rollInputResponse;
  return { radius, rollSeconds, separation:Math.max(radius*2.2+speed*rollSeconds,Math.max(0,closing)*1.4,COMBAT_RANGE*.22),
    climb:Math.sin(e.maxClimbPitch)*speed, minSpeed:e.stallSpeed*1.2, maxSpeed:e.maxSpeed };
}
export function recordOpponentShot(runtime:OpponentRuntime|undefined) { const m=runtime?.tactics;if(m){m.shots++;m.passShots++;} }
export function recordOpponentHit(runtime:OpponentRuntime|undefined) { const m=runtime?.tactics;if(m){m.hits++;m.passHits++;} }
/** Called only after authoritative collision/damage validation. */
export function recordOpponentDamage(runtime:OpponentRuntime|undefined) {
  const m=runtime?.tactics;if(!m)return;
  m.threatDamage=Math.min(4,m.threatDamage+1);
  if(m.plan.tactic==='defensiveBreak')m.usefulness[9]=Math.max(-1,m.usefulness[9]!-.2);
}
export function shiftOpponentTactics(runtime:OpponentRuntime|undefined,delta:number) {
  const m=runtime?.tactics;if(!m)return;
  if(m.travelUntil!==undefined)m.travelUntil+=delta;
  if(m.nextExcursionAt!==undefined)m.nextExcursionAt+=delta;
  if(m.targetSampleAt!==undefined)m.targetSampleAt+=delta;
  m.nextDecision+=delta;m.observedAt+=delta;m.selectedAt+=delta;m.progressAt+=delta;m.plan.until+=delta;
  if(m.threatSince!==undefined)m.threatSince+=delta;
  for(const transition of m.transitions)transition.at+=delta;
}

/** Low-frequency utility planning. The integrator alone owns pose, bank, velocity and terrain avoidance. */
export function planOpponentTactics(runtime:OpponentRuntime,input:TacticalInput):TacticalPlan {
  const {enemy,target,now}=input, profile=runtime.profile, intelligence=profile.tactics, expert=intelligence.expert;
  let m=runtime.tactics;
  if(m?.targetId!==input.targetId) {
    const f=forward(enemy.rotation.y);
    m=runtime.tactics={targetSampleAt:target.lastStateAt,targetId:input.targetId,nextDecision:0,observedAt:now-profile.trackingMs,heading:expert?flightBearing(target):target.rotation.y,altitude:target.position.y,
      targetTurnRate:0,turnBias:0,turning:0,climbing:0,straight:1,shots:0,hits:0,passShots:0,passHits:0,failures:0,threatDamage:0,
      selectedAt:now,range:Infinity,progressAt:now,usefulness:combatTactics.map(()=>0),transitions:[],
      plan:{tactic:'directIntercept',waypoint:{x:enemy.position.x+f.x*input.speed*3,y:enemy.position.y,z:enemy.position.z+f.z*input.speed*3},cruise:input.cruise,turnSign:1,until:Math.max(now,runtime.detectedAt+profile.reactionMs)}};
    chooseOpponentEvasion(runtime,enemy,input.speed,input.bullets??[],now,input.floorAt,input.inside,expert?target:undefined);
    return m.plan;
  }
  if(now<m.nextDecision || now<runtime.detectedAt+profile.reactionMs)return m.plan;
  // Projectile inspection is capped to the existing tracking cadence, not the flight tick.
  m.nextDecision=now+Math.min(250,profile.trackingMs);
  const dodge=chooseOpponentEvasion(runtime,enemy,input.speed,input.bullets??[],now,input.floorAt,input.inside,expert?target:undefined);
  const f=forward(enemy.rotation.y), tf=forward(target.rotation.y);
  const delta={x:target.position.x-enemy.position.x,y:target.position.y-enemy.position.y,z:target.position.z-enemy.position.z};
  const range=Math.max(1,horizontal(delta)), direction={x:delta.x/range,y:0,z:delta.z/range};
  const nose=dot(f,direction), targetNose=-dot(tf,direction);
  const closing=dot({x:enemy.velocity.x-target.velocity.x,y:0,z:enemy.velocity.z-target.velocity.z},direction);
  const space=tacticalFlightSpace(enemy.aircraftType,input.speed,closing,expert?1.5:1), targetSpeed=horizontal(target.velocity);
  const targetSpace=tacticalFlightSpace(target.aircraftType,targetSpeed);
  const fastPass=expert&&(input.committedPasses===true || input.roaming===true&&input.cruise>targetSpeed*1.15);
  const targetGunAlignment=(targetNose*Math.cos(target.rotation.x)*range-Math.sin(target.rotation.x)*delta.y)/Math.hypot(range,delta.y);
  const threatGeometry=Math.hypot(range,delta.y)<COMBAT_RANGE*1.2 && targetGunAlignment>Math.cos(.22+.14*intelligence.awareness);
  if(threatGeometry||input.lockedByTarget) m.threatSince??=now; else m.threatSince=undefined;
  const danger=m.threatSince!==undefined && now-m.threatSince>=profile.reactionMs;
  if(m.travelGoal&&!input.roaming){m.travelGoal=undefined;m.plan.until=now;}
  if(m.travelGoal) {
    const separation=horizontal({x:target.position.x-enemy.position.x,y:0,z:target.position.z-enemy.position.z});
    if(now>=(m.travelUntil??0)||separation>=(m.travelRange??0)) {
      m.travelGoal=undefined;m.nextExcursionAt=now+8000;m.plan.until=now;
    } else if(dodge) {
      return m.plan={tactic:'defensiveBreak',waypoint:input.safeWaypoint?.(enemy.position,dodge)??dodge,cruise:input.cruise,turnSign:m.plan.turnSign,until:runtime.dodgeUntil};
    } else if(now<runtime.dodgeUntil) return m.plan;
    else if(expert && danger && now-runtime.dodgeAt>=profile.dodgeCooldownMs) {
      // A departure commits to distance, not a straight line through a firing cone.
      // Keep its original goal/deadline while flying a real, envelope-limited break.
      const breakPoint=opponentDodge(enemy.aircraftType,enemy,input.speed,[],input.floorAt,input.inside,target);
      if(breakPoint) {
        runtime.dodgeAt=now;runtime.dodgeUntil=now+1200;
        return m.plan={tactic:'defensiveBreak',waypoint:input.safeWaypoint?.(enemy.position,breakPoint)??breakPoint,cruise:input.cruise,turnSign:m.plan.turnSign,until:runtime.dodgeUntil};
      }
      return m.plan={tactic:'disengage',waypoint:m.travelGoal,cruise:input.cruise,turnSign:m.plan.turnSign,until:m.travelUntil!};
    }
    else return m.plan={tactic:'disengage',waypoint:m.travelGoal,cruise:input.cruise,turnSign:m.plan.turnSign,until:m.travelUntil!};
  }
  // A committed escape persists until useful separation exists, including against a circling target.
  const closeRange=expert?Math.max(space.radius*.65,input.speed*space.rollSeconds*.65):space.separation;
  const close=range<closeRange, passed=nose<-.2 && range<closeRange;
  const separating=['extendAway','disengage','defensiveBreak','energyRecovery'].includes(m.plan.tactic);
  const committedCounter=expert&&m.plan.tactic==='counterattack'&&now<m.plan.until&&m.threatDamage<1;
  const emergency=dodge!==undefined || !committedCounter&&danger && intelligence.awareness>=.5 && m.plan.tactic!=='defensiveBreak' && now-runtime.dodgeAt>=profile.dodgeCooldownMs;
  const separationComplete=['extendAway','disengage'].includes(m.plan.tactic) && range>=space.separation;
  const committed=now<m.plan.until && !separationComplete && (!input.objective || ['disengage','defensiveBreak','energyRecovery'].includes(m.plan.tactic));
  if(!emergency && committed && ['extendAway','disengage','defensiveBreak','energyRecovery',...(!expert?['attackPass']:[])].includes(m.plan.tactic))return m.plan;
  if(!emergency && now<m.observedAt+profile.trackingMs)return m.plan;
  const seconds=Math.max(.05,(now-m.observedAt)/1000), weight=1-Math.exp(-seconds/5), decay=Math.exp(-seconds/18);
  const observedHeading=expert?flightBearing(target):target.rotation.y;
  const sampleAt=target.lastStateAt??now;
  const freshSample=!expert||m.targetSampleAt===undefined||sampleAt>m.targetSampleAt;
  const sampleSeconds=expert?Math.max(.05,(sampleAt-(m.targetSampleAt??m.observedAt))/1000):seconds;
  const turn=freshSample?wrap(observedHeading-m.heading)/sampleSeconds:m.targetTurnRate;
  const targetEnvelope=aircraftFlightEnvelope[target.aircraftType],targetRatio=clamp(targetSpeed/targetEnvelope.maxSpeed,0,1);
  const observedTurnLimit=expert?(.42+targetRatio*.5)*targetEnvelope.yawRate/targetEnvelope.inertia+targetRatio*targetEnvelope.bankTurn:targetEnvelope.yawRate;
  m.targetTurnRate=clamp(turn,-observedTurnLimit,observedTurnLimit);
  m.turnBias=m.turnBias*decay+clamp(turn,-1,1)*(1-decay);
  m.turning+=(Math.abs(turn)-m.turning)*weight;
  m.climbing+=(Math.abs(target.position.y-m.altitude)/seconds-m.climbing)*weight;
  m.straight+=(Math.abs(turn)<.035?1-m.straight:-m.straight)*weight;
  if(freshSample){m.heading=observedHeading;m.targetSampleAt=sampleAt;}
  m.altitude=target.position.y;m.observedAt=now;
  m.threatDamage*=decay;
  for(let i=0;i<m.usefulness.length;i++)m.usefulness[i]!*=decay;
  if(range<m.range-space.radius*.15){m.range=range;m.progressAt=now;}
  const stalled=now-m.progressAt>Math.max(12000,space.separation/Math.max(1,input.speed)*3000);
  const recentMisses=m.passShots>=3&&m.passHits===0;
  const repeatedCircle=m.turning>.06 && intelligence.memory*m.turning>.02;
  const lowEnergy=range<COMBAT_RANGE*1.5 && input.speed<Math.min(input.cruise*.65,space.maxSpeed*.5);
  const above=(enemy.position.y-target.position.y)/Math.max(100,space.climb*3);
  const behindTarget=targetNose<-.3;
  const crossing=Math.abs(dot(f,tf))<.6;
  const canExcursion=expert&&input.roaming&&now>=(m.nextExcursionAt??runtime.detectedAt+4000)&&range<COMBAT_RANGE;
  const resetNeeded=Boolean(canExcursion&&(recentMisses||repeatedCircle||stalled||m.threatDamage>0));
  const scores:Record<CombatTactic,number>={
    directIntercept:.6+clamp(range/COMBAT_RANGE,0,2)*.25+(stalled?.35:0),
    rearIntercept:(expert?.5:.35)+intelligence.awareness*.25+(behindTarget?.4:0)-(close?.8:0),
    leadPursuit:.5+m.straight*.35+Math.max(0,closing)/Math.max(1,input.speed)*.15,
    lagPursuit:.3+(repeatedCircle?.65:0)+(close&&!input.firingSolution?.35:0),
    highAttack:.2+intelligence.awareness*.4+clamp(above,0,1)*.35+(repeatedCircle?.2:0),
    lowAttack:.15+intelligence.awareness*.3+clamp(-above,0,1)*.4,
    attackPass:input.firingSolution?1.7+intelligence.awareness*.3:-1,
    extendAway:close&&!input.firingSolution||passed?1.9:separating&&range<space.separation?1.6:-.5,
    wideReposition:.25+m.failures*intelligence.memory*.08+(recentMisses?.8:0)+(stalled?1:0)+(repeatedCircle?.4:0),
    defensiveBreak:emergency?2.8:danger?intelligence.awareness*1.3:-1,
    energyRecovery:lowEnergy?1.5:-.8,
    counterattack:expert&&now-runtime.dodgeAt<5000&&range<COMBAT_RANGE&&targetGunAlignment<.94?1.5:crossing&&targetNose<.1&&nose>.2?.5+intelligence.awareness*.65:-.5,
    disengage:resetNeeded?(dodge?2.2:3):danger&&nose<0?1.1+intelligence.awareness*.5+m.threatDamage*.15:-.5,
  };
  if(input.supportSide){scores.lagPursuit+=.5;scores.wideReposition+=.5;}
  if(input.objective){scores.disengage=1;scores.defensiveBreak=dodge?3:danger?2:-1;}
  const personality=runtime.definition.personality ?? (runtime.definition.behavior==='ambush'?'patient':runtime.definition.behavior==='defend'?'defensive':'balanced');
  if(personality==='aggressive'){scores.attackPass+=.12;scores.counterattack+=.15;}
  if(personality==='patient'){scores.rearIntercept+=.18;scores.highAttack+=.12;}
  if(personality==='defensive'){scores.lagPursuit+=.15;scores.disengage+=.15;}
  if(personality==='energy'){scores.highAttack+=.18;scores.energyRecovery+=.2;}
  // Basic pilots evaluate fewer alternatives; smarter pilots use observed, decaying pass feedback.
  let choice:CombatTactic=m.plan.tactic, best=-Infinity;
  for(let i=0;i<combatTactics.length;i++) {
    const tactic=combatTactics[i]!;
    if(input.objective&&!['disengage','defensiveBreak','energyRecovery'].includes(tactic))continue;
    if(intelligence.awareness<.4&&!basicTactics.has(tactic))continue;
    let score=scores[tactic]+m.usefulness[i]!*intelligence.memory*.3;
    if(tactic===m.plan.tactic)score+=intelligence.hysteresis-(recentMisses?intelligence.memory*.6:0);
    if((!committed||emergency)&&score>best){best=score;choice=tactic;}
  }
  // M12 uses the existing maneuvers as committed passes, rather than repeatedly
  // correcting toward a nearby intercept. Legendary threat reactions may still
  // interrupt any leg, and separation resumes after the defensive break.
  if (input.committedPasses && expert && !emergency) {
    if (m.passPhase === 'extend') choice = range < space.separation ? 'extendAway' : 'wideReposition';
    else if (m.passPhase === 'reposition') {
      if (m.plan.tactic === 'wideReposition' && now < m.plan.until) choice = 'wideReposition';
      else { m.passPhase = undefined; choice = input.firingSolution ? 'attackPass' : 'directIntercept'; }
    } else if (m.plan.tactic === 'attackPass') {
      choice = nose < 0 || now >= m.plan.until ? 'extendAway' : 'attackPass';
    }
  }
  if (input.committedPasses && expert) {
    if (choice === 'extendAway') m.passPhase = 'extend';
    else if (choice === 'wideReposition' && m.passPhase === 'extend') m.passPhase = 'reposition';
  }
  let side=(expert?Math.sign(wrap(Math.atan2(-delta.x,-delta.z)-enemy.rotation.y)):Math.sign(f.x*direction.z-f.z*direction.x))||m.plan.turnSign;
  if(repeatedCircle&&['lagPursuit','wideReposition'].includes(choice))side=-Math.sign(m.turnBias)||side;
  const predict=clamp(range/Math.max(input.speed,1),.5,intelligence.prediction);
  // Predict turn continuation only from measured history; never from future input.
  const angle=clamp(m.turnBias*predict*intelligence.memory,-.8,.8);
  const vx=target.velocity.x*Math.cos(angle)-target.velocity.z*Math.sin(angle), vz=target.velocity.x*Math.sin(angle)+target.velocity.z*Math.cos(angle);
  let waypoint={x:target.position.x+vx*predict,y:target.position.y+clamp(target.velocity.y*predict,-space.climb*3,space.climb*3),z:target.position.z+vz*predict};
  // In weapon range, maneuver toward the actual launch-time ballistic solution.
  // Flight-time prediction alone can keep a crossing opponent permanently outside the gun cone.
  const ballistic=hunterBallisticSolution(enemy.position,enemy.velocity,target.position,target.velocity,expert?m.targetTurnRate:0);
  if(ballistic && ['directIntercept','leadPursuit','counterattack',...(expert?['rearIntercept','attackPass']:[])].includes(choice))waypoint=ballistic.point;
  let cruise=input.cruise;
  const separation=space.separation;
  const lateral={x:f.z*side,y:0,z:-f.x*side};
  if(choice==='rearIntercept' && !(expert&&ballistic)) {waypoint.x-=tf.x*targetSpace.radius;waypoint.z-=tf.z*targetSpace.radius;}
  if(choice==='lagPursuit'||choice==='wideReposition') {
    waypoint.x+=lateral.x*separation;waypoint.z+=lateral.z*separation;
    cruise=Math.min(cruise,Math.max(space.minSpeed*2,targetSpeed*.95));
  }
  if(choice==='highAttack')waypoint.y+=Math.min(space.climb*3,separation*.25);
  if(choice==='lowAttack')waypoint.y-=Math.min(space.climb*2,separation*.2);
  if(choice==='attackPass') {
    // Fly through the solution rather than turn around a point directly over the target.
    waypoint=fastPass&&committed&&(!input.committedPasses||m.plan.tactic==='attackPass')?m.plan.waypoint:expert&&ballistic&&!fastPass?ballistic.point:{x:target.position.x+f.x*separation,y:target.position.y,z:target.position.z+f.z*separation};
    cruise=fastPass?input.cruise:Math.min(cruise,Math.max(space.minSpeed*2,targetSpeed+Math.max(60,closing*.25)));
  }
  if(['extendAway','disengage','energyRecovery','defensiveBreak'].includes(choice)) {
    waypoint={x:enemy.position.x+f.x*separation+lateral.x*separation*(choice==='defensiveBreak'?.8:.15),
      y:enemy.position.y+(choice==='defensiveBreak'?space.climb*1.5:choice==='energyRecovery'?-space.climb:0),
      z:enemy.position.z+f.z*separation+lateral.z*separation*(choice==='defensiveBreak'?.8:.15)};
    if(choice==='defensiveBreak')waypoint=dodge??(expert&&danger?opponentDodge(enemy.aircraftType,enemy,input.speed,[],input.floorAt,input.inside,target):undefined)??waypoint;
    cruise=choice==='energyRecovery'?input.cruise:Math.min(input.cruise,Math.max(space.minSpeed*2,targetSpeed+80));
  }
  if(expert && !(fastPass&&choice==='attackPass') && !['extendAway','disengage','defensiveBreak','energyRecovery'].includes(choice) && nose>0) {
    const e=aircraftFlightEnvelope[enemy.aircraftType];
    const ideal=COMBAT_RANGE*BASE_PROJECTILE_SPEED/(BASE_PROJECTILE_SPEED+targetSpeed)*.30;
    const brake=Math.max(e.drag*(input.speed/e.maxSpeed)**2/e.inertia,e.airbrakeDrag/e.inertia*.35);
    const matching=Math.max(space.minSpeed*2,targetSpeed+(range-ideal)*.12-Math.max(0,closing)*.2);
    const brakingCap=Math.sqrt(Math.max(space.minSpeed**2,targetSpeed**2+2*brake*Math.max(0,range-ideal)));
    cruise=Math.min(input.cruise,matching,brakingCap);
  }
  if(choice==='disengage'&&canExcursion) {
    const desiredRange=clamp(space.separation*2.2+input.speed*space.rollSeconds,COMBAT_RANGE*1.1,COMBAT_RANGE*1.6);
    const travelMs=clamp(desiredRange/Math.max(200,input.cruise-targetSpeed)*1000,4000,12000);
    const reach=input.cruise*travelMs/1000+space.radius*2;
    let best=-Infinity,goal:V|undefined;
    for(const angle of [0,Math.PI/3,-Math.PI/3,Math.PI]) {
      const yaw=enemy.rotation.y+angle;
      let candidate={x:enemy.position.x-Math.sin(yaw)*reach,y:enemy.position.y+Math.min(300,space.climb*2),z:enemy.position.z-Math.cos(yaw)*reach};
      candidate.y=Math.max(candidate.y,input.floorAt(candidate.x,candidate.z)+35);
      candidate=input.safeWaypoint?.(enemy.position,candidate)??candidate;
      if(input.inside&&!input.inside(candidate))continue;
      const distance=horizontal({x:candidate.x-enemy.position.x,y:0,z:candidate.z-enemy.position.z});
      if(distance<desiredRange)continue;
      const score=distance+.4*Math.hypot(candidate.x-target.position.x,candidate.z-target.position.z)-space.radius*Math.abs(angle);
      if(score>best){best=score;goal=candidate;}
    }
    if(goal){
      m.travelGoal=goal;m.travelRange=desiredRange;m.travelUntil=now+travelMs;waypoint=goal;cruise=input.cruise;
      if(danger&&now-runtime.dodgeAt>=profile.dodgeCooldownMs) {
        const breakPoint=opponentDodge(enemy.aircraftType,enemy,input.speed,[],input.floorAt,input.inside,target);
        if(breakPoint){waypoint=input.safeWaypoint?.(enemy.position,breakPoint)??breakPoint;runtime.dodgeAt=now;runtime.dodgeUntil=now+1200;}
      }
    }
  }
  if(input.supportSide&&!danger&&['directIntercept','rearIntercept','leadPursuit','highAttack','lowAttack','attackPass'].includes(choice)){
    const spacing=Math.min(1800,space.separation*.65)*input.supportSide;
    waypoint.x+=tf.z*spacing;waypoint.z-=tf.x*spacing;
    waypoint.y+=Math.min(180,space.climb*1.5);
  }
  if(input.objective&&choice!=='defensiveBreak'){waypoint=input.objective;cruise=input.cruise;}
  waypoint.y=Math.max(waypoint.y,input.floorAt(waypoint.x,waypoint.z)+35);
  waypoint=input.safeWaypoint?.(enemy.position,waypoint)??waypoint;
  // A bounded arena may reject an outbound route; steer inward using the same integrator.
  if(input.inside&&!input.inside(waypoint))waypoint={...target.position,y:Math.max(target.position.y,input.floorAt(target.position.x,target.position.z)+35)};
  if(choice!==m.plan.tactic) {
    const previous=combatTactics.indexOf(m.plan.tactic);
    m.usefulness[previous]=clamp(m.usefulness[previous]!+(m.passHits>0?.5:recentMisses?-.35:stalled?-.25:0),-1,1);
    m.failures=recentMisses?Math.min(8,m.failures+1):Math.max(0,m.failures-1);
    m.passShots=0;m.passHits=0;m.selectedAt=now;m.range=range;m.progressAt=now;
    m.transitions.push({at:now,tactic:choice});if(m.transitions.length>12)m.transitions.shift();
  }
  if(choice==='defensiveBreak'&&emergency){runtime.dodgeAt=now;runtime.dodgeUntil=now+1200;}
  // Duration follows roll-in and needed travel space; no fixed flight distance or attack rotation.
  const commitment=input.committedPasses&&choice==='wideReposition'
    ? Math.max(intelligence.commitment,Math.PI*space.radius/Math.max(1,input.speed)*1000)
    : fastPass&&choice==='attackPass'?Math.max(intelligence.commitment,Math.min(4500,(range+space.radius*1.5)/Math.max(1,input.cruise)*1000)):Math.max(intelligence.commitment,(separating||choice==='extendAway'?separation/Math.max(1,input.speed)*.65:space.rollSeconds)*1000);
  m.plan={tactic:choice,waypoint,cruise:clamp(cruise,space.minSpeed,space.maxSpeed),turnSign:side,until:m.travelGoal?m.travelUntil!:committed&&!emergency&&(!input.committedPasses||choice===m.plan.tactic)?m.plan.until:now+Math.min(7000,commitment)};
  return m.plan;
}
