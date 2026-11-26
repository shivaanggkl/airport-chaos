import {journeyCompetitiveCaptureMission,journeyDallasCapture01,journeyDallasTerritoryDefense01} from '../../shared/journey-mission.mjs';
import {journeyCategorySlot} from '../../shared/journey-categories.mjs';

type MapAttempt = {
  missionId:string;status:string;finalPhase?:string|null;targetId?:string|null;secondaryTargetId?:string|null;
  rearGuardThirdId?:string|null;rearGuardFourthId?:string|null;captureOpponentIds?:readonly string[];
};

/** Keep the map on its Journey context even while results are displayed. */
export function worldMapMissionContext(attempt:MapAttempt|null,journey:boolean) {
  const active=journey&&Boolean(attempt&&['APPROACH','RACING'].includes(attempt.status));
  const capture=journeyCompetitiveCaptureMission(attempt?.missionId);
  const territoryIds:readonly string[]|undefined=!journey?undefined:capture?.territoryIds??
    (attempt?.missionId===journeyDallasCapture01.id?[journeyDallasCapture01.territoryId]:
      attempt?.missionId===journeyDallasTerritoryDefense01.id?[journeyDallasTerritoryDefense01.territoryId]:[]);
  const opponentIds=active&&attempt?[...(attempt.captureOpponentIds??[]),attempt.targetId,attempt.secondaryTargetId,attempt.rearGuardThirdId,attempt.rearGuardFourthId]
    .filter((id):id is string=>typeof id==='string'&&id.length>0):[];
  return {active,territoryIds,opponentIds,escorts:active&&journeyCategorySlot(attempt!.missionId)?.categoryId==='giant-battles'&&(!attempt!.finalPhase||attempt!.finalPhase==='ESCORTS')};
}
