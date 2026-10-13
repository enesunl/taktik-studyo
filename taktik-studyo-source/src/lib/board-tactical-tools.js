import {mountTacticalDrawings} from './tactical-drawing-ui.js';
import {DRAWING_COLORS,DRAWING_WIDTHS,hitDrawing,createDrawingHistory} from './tactical-drawings.js';

// The public sharing contract remains pen/eraser strokes. This is a bounded
// outline projection, not a second drawing engine. Local drafts retain exact
// objects (including width, zone fill and dashed arrows).
export function drawingStrokes(objects){
  const rows=[],point=p=>({x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))});
  for(const o of objects){
    const g=o.geometry,add=points=>rows.push({tool:'pen',color:DRAWING_COLORS[o.color],width:4,points:points.map(point)});
    if(o.type==='freehand')add(g.points);
    else if(o.type==='zone')add([{x:g.x,y:g.y},{x:g.x+g.width,y:g.y},{x:g.x+g.width,y:g.y+g.height},{x:g.x,y:g.y+g.height},{x:g.x,y:g.y}]);
    else if(o.type==='circle')add(Array.from({length:49},(_,i)=>({x:g.x+g.width/2+g.width/2*Math.cos(i*Math.PI/24),y:g.y+g.height/2+g.height/2*Math.sin(i*Math.PI/24)})));
    else{
      add([g.start,g.end]);
      if(o.type.endsWith('-arrow')){
        const dx=(g.end.x-g.start.x)*1000,dy=(g.end.y-g.start.y)*625,angle=Math.atan2(dy,dx),length=Math.min(12+DRAWING_WIDTHS[o.width]*2,Math.hypot(dx,dy)*.45);
        add([{x:g.end.x-length*Math.cos(angle-.5)/1000,y:g.end.y-length*Math.sin(angle-.5)/625},g.end,{x:g.end.x-length*Math.cos(angle+.5)/1000,y:g.end.y-length*Math.sin(angle+.5)/625}]);
      }
    }
  }
  return rows;
}

export function mountBoardTacticalTools({state,teamId,onChange,...options}){
  const initial=state.tactical||{drawings:[],legacy:state.drawings,pitch:{width:1200,height:650,color:'#285b3b'}};
  const histories=new Map();let activeId=teamId;
  const controller=mountTacticalDrawings({...options,initial,showPitchSizeControls:false,getPreferenceStorage:()=>null,
    onPitchSize(size){options.pitch.setAttribute("data-custom-height",String(size.height!==650));options.pitch.style.setProperty("--board-pitch-width",(size.width/1200*100)+"%");options.pitch.style.setProperty("--board-pitch-ratio",String(680/880*(size.width/1200)/(size.height/650)));},
    hitLegacy(strokes,point,bounds){
      for(let i=strokes.length-1;i>=0;i--){
        const s=strokes[i];if(s.tool!=='pen')continue;
        const points=s.points.length===1?[s.points[0],s.points[0]]:s.points;
        if(hitDrawing([{id:'legacy',type:'freehand',color:'white',width:'medium',geometry:{points}}],point,8,bounds))return i;
      }
      return -1;
    },
    onChange(){
      const {objects,legacy}=controller.getState();
      onChange({drawings:objects,legacy,pitch:controller.getPitch()});
    },
  });
  return Object.freeze({...controller,
    switchTeam(id,nextState){
      controller.cancel();histories.set(activeId,controller.captureHistory());
      const pitch=controller.getPitch(),saved=nextState.tactical||{drawings:[],legacy:nextState.drawings};
      const history=histories.get(id)||createDrawingHistory(saved.drawings,saved.legacy);
      activeId=id;controller.restoreContext(history,pitch);
      return {...saved,pitch};
    },
    dispose(){histories.clear();controller.dispose();},
  });
}
