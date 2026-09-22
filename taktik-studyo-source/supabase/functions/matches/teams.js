// Explicit BSD IDs -> existing catalogue IDs/colors (supabase/seed.sql).
// No catalogue writes, provider logos or board-engine dependency.
const rows = [
  [125,'fotmob-8637','Galatasaray','#a51935','#efb62a'],
  [134,'fotmob-8695','Fenerbahçe','#19294d','#f3d233'],
  [196,'fotmob-10188','Beşiktaş','#222222','#eeeeee'],
  [194,'fotmob-1933','Başakşehir','#ed7835','#213a63'],
  [197,'fotmob-9752','Trabzonspor','#702039','#8cc1dc'],
  [184,'fotmob-9750','Samsunspor','#ca303a','#eeeeee'],
  [190,'fotmob-1925','Göztepe','#bb2039','#edc932'],
  [189,'fotmob-2166','Çaykur Rizespor','#198c55','#276dad'],
  [187,'fotmob-4685','Kasımpaşa','#173c74','#ffffff'],
  [192,'fotmob-8622','Konyaspor','#23855c','#ffffff'],
  [188,'fotmob-4678','Alanyaspor','#ef802b','#228756'],
  [183,'fotmob-4081','Gaziantep FK','#c3313c','#252b2b'],
  [191,'fotmob-4681','Eyüpspor','#713576','#e6be42'],
  [198,'fotmob-1569','Kocaelispor','#148255','#242b28'],
  [185,'fotmob-7800','Gençlerbirliği','#b72637','#262725'],
  [1346,'fotmob-281467','Erzurumspor FK','#2c65ad','#ffffff'],
  [3380,'fotmob-96498','Amedspor','#168553','#c5353d'],
  [3295,'fotmob-357274','Çorum FK','#c1303b','#242a28'],
];
export const teamMapping = new Map(rows.map(([id,teamId,name,color,color2]) => [String(id),Object.freeze({teamId,name,color,color2})]));
export function mapTeam(id,name) {
  if (!Number.isSafeInteger(id) || id < 1 || typeof name !== 'string' || !name.trim() || name.length > 120) return null;
  return {providerId:String(id),...(teamMapping.get(String(id)) || {teamId:null,name:name.trim(),color:'#647067',color2:'#e4e8e2'})};
}
