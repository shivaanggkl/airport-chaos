export declare const TUTORIAL_VERSION:'tutorial_v1';
export declare const tutorialSteps:readonly string[];
export type TutorialStatus='new'|'started'|'completed'|'skipped';
export declare function normalizeTutorialState(value:unknown):{version:'tutorial_v1';status:TutorialStatus;completedAt?:number};
export declare function nextTutorialStep(step:string,signal:string):string;
export declare function tutorialObjective(step:string,inputMode?:'keyboard'|'touch'):string;
export declare function shouldOfferTutorial(status?:string, establishedProfile?:boolean, localStatus?:string|null):boolean;
