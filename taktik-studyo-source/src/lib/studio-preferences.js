export const SIZE_KEY='taktik:match-studio:pitch-size:v1';
export const SIDEBAR_KEY='taktik:match-studio:sidebar:v1';
export const DEFAULT_SIZE=Object.freeze({width:1200,height:650});
export const SIZE_BOUNDS=Object.freeze({width:[800,1800],height:[450,900]});
export function safeSize(value){return Object.fromEntries(Object.entries(SIZE_BOUNDS).map(([k,[min,max]])=>[k,typeof value?.[k]==='number'&&Number.isFinite(value[k])?Math.max(min,Math.min(max,Math.round(value[k]))):DEFAULT_SIZE[k]]));}
export function createStudioPreferences({getStorage,onSize=()=>{},onSidebar=()=>{},initialSize,persistSize=true}={}){
  let size={...DEFAULT_SIZE},collapsed=false;
  try{size=safeSize(JSON.parse(getStorage?.()?.getItem(SIZE_KEY)));}catch{}
  if(initialSize)size=safeSize(initialSize);
  try{collapsed=getStorage?.()?.getItem(SIDEBAR_KEY)==='collapsed';}catch{}
  const save=(key,value)=>{try{getStorage?.()?.setItem(key,value);}catch{}};
  onSize({...size});onSidebar(collapsed);
  return {setSize(value){size=safeSize(value);if(persistSize)save(SIZE_KEY,JSON.stringify(size));onSize({...size});},resetSize(){this.setSize(DEFAULT_SIZE);},getSize:()=>({...size}),
    toggleSidebar(){collapsed=!collapsed;save(SIDEBAR_KEY,collapsed?'collapsed':'expanded');onSidebar(collapsed);}};
}
