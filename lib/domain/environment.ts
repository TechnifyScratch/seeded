import { Action, EnvironmentObject } from './schema';
export const baseActions = ['inspect','read','interact','move','compare','write_note','journal','reflect','rest'];
// Only these fields are visible to the model.
export function visibleObject(o:EnvironmentObject){return {id:o.id,name:o.name,description:o.public_description,location:o.location,available_actions:o.available_actions};}
export function executeEnvironment(action:Action, objects:EnvironmentObject[], location:string, communication:boolean){
 const target = 'target' in action ? objects.find(o=>o.id===action.target) : undefined;
 if ('target' in action && !target) throw new Error('Unknown or unobserved target');
 if (target && action.type !== 'compare' && target.location !== location) throw new Error('Move to the object location before acting');
 let observation=''; let updated:EnvironmentObject|null=null; let nextLocation=location;
 switch(action.type){
  case 'inspect': case 'read': {
   if(!target!.available_actions.includes(action.type)) throw new Error('Action unavailable');
   observation=`${target!.name}: ${target!.public_description}`;
   const detail=action.type==='inspect'?target!.hidden_properties.inspect_text:target!.hidden_properties.read_text;
   if(detail) observation+=` ${detail}`;
   if(target!.hidden_properties.reveals_on===action.type) observation+=` ${target!.hidden_properties.reveal_text}`;
   break;
  }
  case 'interact': {
   if(!target!.available_actions.includes(action.interaction)) throw new Error('Interaction unavailable');
   updated=structuredClone(target!);
   if(action.interaction==='open')updated.internal_state.open=true;
   if(action.interaction==='close')updated.internal_state.open=false;
   if(action.interaction==='toggle')updated.internal_state.on=!updated.internal_state.on;
   if(action.interaction==='press')updated.internal_state.press_count=(updated.internal_state.press_count??0)+1;
   observation=`${action.interaction} applied to ${target!.name}. ${target!.hidden_properties.interaction_text}`;
   if(target!.hidden_properties.reveals_on===action.interaction)observation+=` ${target!.hidden_properties.reveal_text}`;
   if(['open','close'].includes(action.interaction)) observation+=` It is now ${updated.internal_state.open?'open':'closed'}.`;
   if(action.interaction==='toggle') observation+=` It is now ${updated.internal_state.on?'on':'off'}.`;
   break;
  }
  case 'compare': {
   const other=objects.find(o=>o.id===action.other_target);
   if(!other || other.id===target!.id)throw new Error('Comparison needs two observed objects');
   observation=`Comparison of recorded visible descriptions: ${target!.name}: ${target!.public_description}; ${other.name}: ${other.public_description}. No new inspection was performed.`; break;
  }
  case 'move': nextLocation=action.location;observation=`Location changed to ${nextLocation}.`;break;
  case 'ask_observer':if(!communication)throw new Error('Communication disabled');observation='Message delivered to the observer channel.';break;
  case 'journal': case 'reflect':case 'write_note':observation=`${action.type} recorded verbatim.`;break;
  case 'rest':observation='No environment interaction was made.';break;
  case 'use_skill':throw new Error('Skill selection is handled by the cycle engine');
 }
 return {observation,updated,location:nextLocation};
}
