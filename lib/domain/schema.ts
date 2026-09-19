import { z } from 'zod';
export const memoryTypes = ['episodic','knowledge','salient','self_model'] as const;
export const nodeTypes = ['observation','memory','object','concept','hypothesis','question','discovery','skill','action','self_model'] as const;
export const relationships = ['observed','related_to','caused','possibly_caused','contradicts','supports','located_near','learned_from','tested_with','resulted_in','reminds_of','used_skill','preference_for','revised_by','followed_by'] as const;
const text = z.string().trim().min(1).max(2000);
const id = z.uuid();
const score = z.number().min(0).max(1);
export const actionSchema = z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('inspect'),target:id}),
 z.strictObject({type:z.literal('read'),target:id}),
 z.strictObject({type:z.literal('interact'),target:id,interaction:z.enum(['press','open','close','toggle'])}),
 z.strictObject({type:z.literal('move'),location:z.enum(['north','south','east','west','center'])}),
 z.strictObject({type:z.literal('compare'),target:id,other_target:id}),
 z.strictObject({type:z.literal('write_note'),content:text}),
 z.strictObject({type:z.literal('journal'),content:text}),
 z.strictObject({type:z.literal('ask_observer'),content:text}),
 z.strictObject({type:z.literal('use_skill'),skill:id}),
 z.strictObject({type:z.literal('reflect'),content:text}),
 z.strictObject({type:z.literal('rest')})
]);
export const memoryRequestSchema = z.discriminatedUnion('operation',[
 z.strictObject({operation:z.literal('create'),type:z.enum(memoryTypes),title:z.string().min(1).max(160),content:text,reason_saved:text,importance:score,confidence:score}),
 z.strictObject({operation:z.literal('archive'),memory_id:id,reason:text})
]);
export const graphUpdateSchema = z.discriminatedUnion('operation',[
 z.strictObject({operation:z.literal('node'),key:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),node_type:z.enum(['concept','hypothesis','question','discovery','self_model']),label:z.string().min(1).max(120),summary:text,importance:score,confidence:score,evidence_ids:z.array(id).min(1).max(8)}),
 z.strictObject({operation:z.literal('edge'),source:z.string().max(64),target:z.string().max(64),relationship:z.enum(relationships),strength:score,confidence:score,status:z.enum(['confirmed','tentative','contradicted','historical']),evidence_ids:z.array(id).min(1).max(8)})
]);
export const decisionSchema = z.strictObject({observation_summary:text,interpretation:text,uncertainty:text,considered_options:z.array(z.string().min(1).max(300)).max(4),selected_action:actionSchema,decision_summary:z.string().min(1).max(700),memory_requests:z.array(memoryRequestSchema).max(4),graph_updates:z.array(graphUpdateSchema).max(8)});
export type Decision = z.infer<typeof decisionSchema>;
export type Action = z.infer<typeof actionSchema>;
export const objectSchema = z.strictObject({name:z.string().trim().min(1).max(100),public_description:text,location:z.enum(['north','south','east','west','center']),available_actions:z.array(z.enum(['inspect','read','press','open','close','toggle'])).min(1).max(6),hidden_properties:z.strictObject({inspect_text:z.string().max(1500).default(''),read_text:z.string().max(1500).default(''),interaction_text:z.string().max(1500).default(''),reveals_on:z.enum(['inspect','read','open','press','toggle','never']).default('never'),reveal_text:z.string().max(1500).default('')})});
export type ObjectInput = z.infer<typeof objectSchema>;
export type EnvironmentObject = ObjectInput & {id:string;experiment_id:string;internal_state:{open?:boolean;on?:boolean;press_count?:number};created_at:string;updated_at:string};
export type Experiment = {id:string;name:string;status:'paused'|'running'|'reflecting'|'day_complete'|'stopped';day:number;action_budget:number;actions_used:number;skill_selections:number;skill_costs_action:boolean;constitution_id:string;model:string;is_demo:boolean;location:string;active_skill_id:string|null;created_at:string;updated_at:string;last_error:string|null};
export type Memory = {id:string;experiment_id:string;type:typeof memoryTypes[number];title:string;content:string;reason_saved:string;importance:number;confidence:number;cycle_created:string;created_at:string;updated_at:string;last_recalled_at:string|null;recall_count:number;archived:boolean};
export type GraphNode = {id:string;experiment_id:string;node_type:typeof nodeTypes[number];reference_id:string|null;label:string;summary:string;importance:number;confidence:number;created_at:string;updated_at:string;evidence_ids:string[]};
export type GraphEdge = {id:string;source_node_id:string;target_node_id:string;relationship:string;strength:number;confidence:number;status:string;evidence_ids:string[]};
export type Row = {id:string;experiment_id?:string;created_at:string;[key:string]:unknown};
export type Snapshot = {configured:boolean;role:'admin'|'observer';email:string;experiments:Experiment[];experiment:Experiment|null;memories:Memory[];graph_nodes:GraphNode[];graph_edges:GraphEdge[];observations:Row[];actions:Row[];decision_records:Row[];journal_entries:Row[];messages:Row[];experiment_logs:Row[];skills:Row[];skill_usage:Row[];capabilities:Row[];cycles:Row[];memory_retrievals:Row[];environment_objects:Row[];constitutions:Row[]};
