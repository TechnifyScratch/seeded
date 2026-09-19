import { z } from 'zod';
import { after } from 'next/server';
import { objectSchema } from '@/lib/domain/schema';
import { requireUser,sameOrigin,errorResponse,readBody,HttpError } from '@/lib/server/auth';
import { rpc } from '@/lib/server/db';
import { runCycle } from '@/lib/server/engine';
export const maxDuration=120;
const schema=z.discriminatedUnion('command',[
 z.strictObject({command:z.enum(['create','demo']),name:z.string().trim().min(1).max(100),action_budget:z.number().int().min(1).max(200)}),
 z.strictObject({command:z.enum(['resume','pause','stop','end_day','next_day']),experiment_id:z.uuid()}),
 z.strictObject({command:z.literal('budget'),experiment_id:z.uuid(),action_budget:z.number().int().min(1).max(200),skill_costs_action:z.boolean()}),
 z.strictObject({command:z.literal('capability'),experiment_id:z.uuid(),name:z.enum(['communication','skills','memory','graph']),enabled:z.boolean()}),
 z.strictObject({command:z.literal('member'),experiment_id:z.uuid(),profile_id:z.uuid()}),
 z.strictObject({command:z.literal('object'),experiment_id:z.uuid(),object_id:z.uuid().optional(),object:objectSchema})
]);
export async function POST(request:Request){try{sameOrigin(request);const user=await requireUser();if(user.role!=='admin')throw new HttpError(403,'Administrator access required');const body=schema.parse(await readBody(request));
 if(['resume','end_day'].includes(body.command)&&!process.env.ANTHROPIC_API_KEY)throw new HttpError(400,'Set ANTHROPIC_API_KEY before starting the engine.');
 const id=await rpc('admin_command',{p_actor:user.id,p_command:body.command,p_experiment:'experiment_id'in body?body.experiment_id:null,p_data:{...body,model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5-20250929'}});
 if(['resume','end_day'].includes(body.command))after(async()=>{await runCycle(id);});
 return Response.json({id});}catch(e){return errorResponse(e);}}
