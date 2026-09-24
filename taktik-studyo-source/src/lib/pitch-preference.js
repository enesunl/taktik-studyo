export const PITCH_COLOR_KEY='taktik:match-studio:pitch-color:v1';
export const DEFAULT_PITCH_COLOR='#285b3b';
export const validPitchColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function pitchMarkings(color){
  if(!validPitchColor(color))color=DEFAULT_PITCH_COLOR;
  const linear=value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
  const rgb=[1,3,5].map(i=>linear(parseInt(color.slice(i,i+2),16)));
  const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}
export function createPitchPreference({getStorage=()=>null,onChange=()=>{},initial,persist=true}={}){
  let color=DEFAULT_PITCH_COLOR;
  try{const saved=getStorage()?.getItem(PITCH_COLOR_KEY);if(validPitchColor(saved))color=saved.toLowerCase();}catch{}
  if(validPitchColor(initial))color=initial.toLowerCase();
  const publish=()=>onChange({color,markings:pitchMarkings(color),isDefault:color===DEFAULT_PITCH_COLOR});
  publish();
  return Object.freeze({get:()=>color,set(value){
    if(!validPitchColor(value))return false;color=value.toLowerCase();publish();
    try{if(persist)getStorage()?.setItem(PITCH_COLOR_KEY,color);}catch{}return true;
  },reset(){color=DEFAULT_PITCH_COLOR;publish();try{if(persist)getStorage()?.removeItem(PITCH_COLOR_KEY);}catch{}}});
}
