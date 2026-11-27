type DuelParticipant = {pilotId:string;isBot?:boolean;skyDuelMode?:boolean};
/** Unique connected humans in a Sky Duel queue or an unsettled duel session. */
export function skyDuelOnlineCount(
  queue:Iterable<{playerId:string}>,
  sessions:Iterable<{playerA:string;playerB:string}>,
  players:ReadonlyMap<string,DuelParticipant>,
  connected:(playerId:string)=>boolean,
):number {
  const pilots=new Set<string>();
  const include=(id:string)=>{
    const player=players.get(id);
    if(player?.skyDuelMode&&!player.isBot&&connected(id))pilots.add(player.pilotId);
  };
  for(const entry of queue)include(entry.playerId);
  for(const session of sessions){include(session.playerA);include(session.playerB);}
  return pilots.size;
}
