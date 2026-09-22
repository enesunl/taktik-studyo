import {event,match} from './matches-fixture.mjs';
import {normalizeDetail} from '../../supabase/functions/matches/detail.js';

// Sanitized representative shapes for 215997; never imported by production.
const squad = (teamId,base,formation) => ({team_id:teamId,formation,
  players:Array.from({length:11},(_,i) => ({id:base+i,name:'Oyuncu '+(i+1),jersey_number:i+1,position:i===0?'G':i<=4?'D':i<=9?'M':'F',photo:'https://media.invalid/player.png'})),
  substitutes:Array.from({length:10},(_,i) => ({id:base+11+i,name:'Yedek '+(i+1),jersey_number:i+12,position:'M'}))});
export function resources() {
  return {
    lineups:{value:{event_id:215997,lineup_status:'confirmed',lineups:{home:squad(3380,100,'4-2-3-1'),away:squad(196,200,'4-1-4-1')}}},
    stats:{value:{event_id:215997,stats:{home:{ball_possession:31,total_shots:10,shots_on_target:8,corner_kicks:1,fouls:25,offsides:0,yellow_cards:9,red_cards:1,expected_goals:1.47,xg:{actual:1.47,estimated:false}},away:{ball_possession:69,total_shots:21,shots_on_target:8,corner_kicks:10,fouls:7,offsides:2,yellow_cards:5,red_cards:0,expected_goals:2.13,xg:{actual:2.15,estimated:false}}}}},
    incidents:{value:{event_id:215997,incidents:[
      {type:'card',card_type:'yellowRed',minute:90,added_time:3,is_home:true,player_id:100,player:'Oyuncu 1'},
      {type:'substitution',minute:63,is_home:false,player_in_id:211,player_in:'Yedek 1',player_out_id:201,player_out:'Oyuncu 2'},
      {type:'card',card_type:'red',minute:45,added_time:2,is_home:false,player_id:201,player:'Oyuncu 2'},
      {type:'card',card_type:'yellow',minute:45,added_time:2,is_home:true,player_id:101,player:'Oyuncu 2'},
      {type:'goal',minute:13,is_home:true,player_id:105,player:'Oyuncu 6',video:'https://media.invalid/goal.mp4'},
      {type:'newUnknown',minute:14,text:'<script>unsafe</script>'},
    ]}},
  };
}
export const detail = (overrides={}) => normalizeDetail(match(overrides),event(overrides),resources());
