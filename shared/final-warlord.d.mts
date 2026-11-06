import {showdownWarlord} from './showdown-warlord.mjs';
export const finalWarlord: typeof showdownWarlord & Readonly<{runSeconds:number;runCooldown:number;runDistance:number;approachBeforeShot:true}>;
