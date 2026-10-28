const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const moveToward=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
const interpolate=(from,to,amount)=>from+(to-from)*amount;

export const MOBILE_STICK_X_SMOOTH_SECONDS=.275;
export const MOBILE_STICK_Y_SMOOTH_SECONDS=.2;
export const COORDINATED_TURN_STRONG_INPUT=.9;
export const COORDINATED_BANK_STRONG_TARGET=48*Math.PI/180;
export const COORDINATED_BANK_CAP=70*Math.PI/180;
// Public mobile aliases preserve the approved touch contract while desktop
// and touch share one coordinated-bank implementation.
export const MOBILE_BANK_STRONG_TARGET=COORDINATED_BANK_STRONG_TARGET;
export const MOBILE_BANK_CAP=COORDINATED_BANK_CAP;

export function desktopTurnIntent(turnLeft,turnRight){
  return(Number(Boolean(turnLeft))-Number(Boolean(turnRight)))*COORDINATED_TURN_STRONG_INPUT;
}

export function normalizedPitchCommand(rawPitchCommand,inverted){
  return clamp(Number.isFinite(rawPitchCommand)?rawPitchCommand:0,-1,1)*(inverted?-1:1);
}

export function smoothMobileSteering(current,target,delta,responseSeconds={x:MOBILE_STICK_X_SMOOTH_SECONDS,y:MOBILE_STICK_Y_SMOOTH_SECONDS}){
  const response=typeof responseSeconds==='number'?{x:responseSeconds,y:responseSeconds}:responseSeconds;
  const elapsed=Math.max(0,delta);
  return{x:moveToward(current.x,target.x,elapsed/Math.max(.01,response.x)),y:moveToward(current.y,target.y,elapsed/Math.max(.01,response.y))};
}

export function coordinatedBankTarget(turnInput){
  const input=clamp(turnInput,-1,1);
  const magnitude=Math.abs(input);
  const bank=magnitude<=COORDINATED_TURN_STRONG_INPUT
    ? COORDINATED_BANK_STRONG_TARGET*(magnitude/COORDINATED_TURN_STRONG_INPUT)
    : interpolate(COORDINATED_BANK_STRONG_TARGET,COORDINATED_BANK_CAP,(magnitude-COORDINATED_TURN_STRONG_INPUT)/(1-COORDINATED_TURN_STRONG_INPUT));
  return Math.sign(input)*bank;
}

export function stepCoordinatedBank(currentBank,turnInput,delta,envelope){
  const input=clamp(turnInput,-1,1);
  const target=coordinatedBankTarget(input);
  const commanding=Math.abs(input)>.001;
  const responseScale=commanding?clamp(envelope.rollInputResponse/4.5,.5,1.35):1;
  const baseRate=commanding?envelope.rollRate:(envelope.rollLevelRate??envelope.rollRate*.75);
  const authority=commanding ? .55+.45*Math.abs(input) : .55+.45*Math.min(1,Math.abs(currentBank)/COORDINATED_BANK_CAP);
  return clamp(moveToward(clamp(currentBank,-COORDINATED_BANK_CAP,COORDINATED_BANK_CAP),target,Math.max(0,delta)*baseRate*responseScale*authority),-COORDINATED_BANK_CAP,COORDINATED_BANK_CAP);
}

export const mobileBankTarget=coordinatedBankTarget;
export const stepMobileBank=stepCoordinatedBank;

const throttleStops=[0,.2,.5,.8,1];

export function throttleSpeedTarget(throttle,envelope){
  const request=clamp(throttle,0,1);
  const speeds=[
    envelope.stallSpeed*.72,
    Math.max(envelope.stallSpeed*1.05,envelope.safeLandingSpeed*1.05),
    Math.max(envelope.safeLandingSpeed*1.45,envelope.maxSpeed*.45),
    Math.max(envelope.safeLandingSpeed*1.75,envelope.maxSpeed*.8),
    envelope.maxSpeed,
  ];
  for(let index=1;index<throttleStops.length;index+=1){
    if(request<=throttleStops[index]){
      const amount=(request-throttleStops[index-1])/(throttleStops[index]-throttleStops[index-1]);
      return interpolate(speeds[index-1],speeds[index],amount);
    }
  }
  return speeds[speeds.length-1];
}

export function throttleDecelerationResponse(throttle,envelope){
  const request=clamp(throttle,0,1);
  const brakeResponse=Math.sqrt(Math.max(.5,envelope.airbrakeResponse??4)/4);
  const massResponse=Math.sqrt(Math.max(.5,envelope.inertia));
  return(.08+(1-request)*.22)*brakeResponse/massResponse;
}

export function throttleTargetDeceleration(airspeed,throttle,envelope){
  const excess=Math.max(0,airspeed-throttleSpeedTarget(throttle,envelope));
  return excess*throttleDecelerationResponse(throttle,envelope);
}

export function airborneAirbrakeDeceleration(forwardSpeed,strength,envelope){
  // The throttle brake sheds travel speed; falling vertically is not forward
  // travel and must remain subject to gravity after a stall.
  const speed=Math.max(0,forwardSpeed);
  const baseDrag=envelope.drag*(speed/envelope.maxSpeed)**2;
  return Math.max(baseDrag*(envelope.airbrakeDrag??2),speed*envelope.inertia*.85)*Math.max(0,strength)/envelope.inertia;
}

export function airbornePitchTarget(pitchControl,forwardSpeed,throttle,envelope){
  const command=clamp(pitchControl,-1,1);
  const commandedPitch=command>=0
    ? envelope.maxClimbPitch*command
    : (envelope.maxDivePitch??envelope.maxClimbPitch)*command;
  // Low power and stall reduce an upward pitch command, but must not point
  // the nose down unless the pilot explicitly commands a dive.
  const powerOff=1-clamp(throttle/.2,0,1);
  const stall=clamp((envelope.stallSpeed-Math.max(0,forwardSpeed))/(envelope.stallSpeed*.52),0,1);
  const target=commandedPitch-.1*powerOff-.2*stall;
  return clamp(command>=0?Math.max(0,target):target,-.35,envelope.maxClimbPitch);
}

export function airborneLiftFactor(forwardSpeed,angleOfAttack,throttle,stallFactor,envelope){
  // A neutral stick is an untrimmed glide. The pilot must hold a little pitch
  // to maintain altitude, while airspeed and angle of attack still govern lift.
  const liftCoefficient=clamp(.64/envelope.lift+angleOfAttack*1.75,.34,1.28);
  // At idle, bleed the remaining lift so high airspeed cannot hold the plane
  // nearly level after the engine has been brought down to idle.
  // The normal slow/powered range (20% and above) keeps its existing lift.
  const idleLiftScale=.35+.65*clamp(throttle/.2,0,1);
  return liftCoefficient*Math.min(1.28,(forwardSpeed/envelope.takeoffSpeed)**2)*stallFactor*envelope.lift*(1+throttle*envelope.climbLiftBoost*.08)*idleLiftScale;
}

// Called only once the runway speed threshold is met, where stallFactor is 1.
// A brief nose-up input must not trigger liftoff before the wings can climb.
export function hasRunwayLiftoffLift(speed,pitch,throttle,envelope){
  return airborneLiftFactor(speed,pitch,throttle,1,envelope)*Math.cos(pitch)>=1;
}
