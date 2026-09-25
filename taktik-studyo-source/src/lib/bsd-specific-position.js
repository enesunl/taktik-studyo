// Canonical provider facts and board-slot compatibility are separate concepts.
export const SPECIFIC_POSITIONS=Object.freeze(['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST','LM','RM','DEF','MID','FWD']);
const broad={G:['KL'],D:['STP','SLB','SĞB'],M:['ÖL','MO','OO'],F:['SLK','SĞK','SF']};
const direct={GK:'KL',CB:'STP',LB:'SLB',RB:'SĞB',DM:'ÖL',CM:'MO',AM:'OO',LW:'SLK',RW:'SĞK',ST:'SF'};
const expected={GK:['G'],CB:['D'],LB:['D'],RB:['D'],DM:['M'],CM:['M'],AM:['M'],LW:['M','F'],RW:['M','F'],ST:['F'],LM:['M'],RM:['M'],DEF:['D'],MID:['M'],FWD:['F']};
export function positionCompatibility(position_group,specific_position){
  if(!broad[position_group]||!SPECIFIC_POSITIONS.includes(specific_position))throw Error('invalid_position');
  const conflict=!expected[specific_position].includes(position_group);
  // Conflicts: broad group governs eligibility; specific preference is disabled.
  // Wide midfield labels add wing compatibility, never a permanent player role.
  const slots=conflict?[...broad[position_group]]:specific_position==='LM'?['ÖL','MO','OO','SLK']
    :specific_position==='RM'?['ÖL','MO','OO','SĞK']:specific_position==='LW'?['SLK']
    :specific_position==='RW'?['SĞK']:[...broad[position_group]];
  return {position_group,specific_position,conflict,lossy:!direct[specific_position],slots,
    preferredSlot:conflict?null:direct[specific_position]||null};
}
