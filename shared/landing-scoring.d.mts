export type LandingGrade = 'ROUGH'|'SAFE'|'SMOOTH'|'PERFECT'|'LEGENDARY';
export declare const landingGradeForScore:(score:number)=>LandingGrade;
export declare function landingPrecisionScore(telemetry:{speed:number;descentRate:number;bankAngle:number;pitch:number;headingError:number},envelope:{speed:number;descent:number;tilt:number}):number;
