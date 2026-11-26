import {CinematicImpactBlast,TRANSPORT_IMPACT_SCALE} from './cinematic-impact';

export const M19_TIMEOUT = Object.freeze({ shootAt: .35, releaseAt: 1.65, impactAt: 3.65, durationMs: 9500 });

/** M1 keeps the same ending length while allowing the full bombardment and aftermath to read. */
export const M1_TIMEOUT=Object.freeze({...M19_TIMEOUT,impactSpacing:.12,fadeAt:8,blackAt:9.2});

export const M19_CITY_BLAST_SCALE=TRANSPORT_IMPACT_SCALE*8;

/** M13's exact impact renderer, enlarged eightfold for the downtown strike. */
export class MonsterCityBlast extends CinematicImpactBlast {
  constructor(){super(M19_CITY_BLAST_SCALE,undefined,false);this.root.name='m19-downtown-timeout-blast';}
}
