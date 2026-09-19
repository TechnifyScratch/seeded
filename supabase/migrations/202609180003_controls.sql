create function public.admin_command(p_actor uuid,p_command text,p_experiment uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare e experiments;eid uuid;oid uuid;obid uuid;nid uuid;cid uuid;item jsonb;begin
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'Admin required';end if;
 if p_command in ('create','demo') then
  select id into cid from constitutions where active order by created_at desc limit 1;
  if cid is null then raise exception 'Active constitution required';end if;
  insert into experiments(name,constitution_id,model,action_budget,is_demo) values(p_data->>'name',cid,p_data->>'model',coalesce((p_data->>'action_budget')::int,20),p_command='demo') returning id into eid;
  insert into experiment_members values(eid,p_actor);
  insert into capabilities(experiment_id,name) select eid,unnest(array['communication','skills','memory','graph']);
  insert into experiment_logs(experiment_id,event_type,summary,payload) values(eid,'experiment_created',case when p_command='demo' then 'Synthetic demo created explicitly by administrator' else 'Experiment created with no memories or graph nodes' end,jsonb_build_object('constitution_id',cid,'actor',p_actor));
  if p_command='demo' then
   insert into memories(experiment_id,type,title,content,reason_saved,importance,confidence) values(eid,'episodic','Synthetic demonstration record','This record was explicitly generated for UI testing. No model observed it.','Demonstrate the memory interface',0.5,1);
   insert into graph_nodes(experiment_id,node_type,label,summary,importance,confidence) values(eid,'concept','Demo object','Synthetic UI fixture, not experimental knowledge',0.5,1) returning id into nid;
   insert into graph_nodes(experiment_id,node_type,label,summary,importance,confidence) values(eid,'hypothesis','Demo question','Synthetic UI fixture, not an actual hypothesis',0.4,0.3) returning id into oid;
   insert into graph_edges(experiment_id,source_node_id,target_node_id,relationship,strength,confidence,status) values(eid,nid,oid,'related_to',0.4,0.3,'tentative');
  end if;
  return eid;
 end if;
 select * into e from experiments where id=p_experiment for update;
 if not found then raise exception 'Experiment not found';end if;
 eid:=e.id;
 -- Every configuration change cancels in-flight work before modifying state.
 update cycles set status='cancelled',error='Administrator changed experiment state',completed_at=now() where experiment_id=e.id and status='pending';
 update experiments set lease_token=null,lease_until=null,revision=revision+1,updated_at=now() where id=e.id;
 case p_command
 when 'resume' then
  if e.is_demo or e.status in ('stopped','day_complete') then raise exception 'Experiment cannot resume';end if;
  if not exists(select 1 from constitutions where id=e.constitution_id and active) then raise exception 'Active constitution required';end if;
  update experiments set status=case when actions_used>=action_budget then 'reflecting' else 'running' end,last_error=null where id=e.id;
 when 'pause' then
  if e.status='stopped' then raise exception 'Emergency stopped experiments cannot resume';end if;
  update experiments set status='paused' where id=e.id;
 when 'stop' then update experiments set status='stopped' where id=e.id;
 when 'end_day' then
  if e.status in ('stopped','day_complete') then raise exception 'Day cannot end';end if;
  update experiments set status='reflecting' where id=e.id;
 when 'next_day' then
  if e.status<>'day_complete' then raise exception 'Complete reflection before next day';end if;
  update experiments set day=day+1,actions_used=0,skill_selections=0,active_skill_id=null,status='paused',last_error=null where id=e.id;
 when 'budget' then
  if e.status not in ('paused','day_complete') then raise exception 'Pause before changing budget';end if;
  if (p_data->>'action_budget')::int<e.actions_used then raise exception 'Budget below consumed actions';end if;
  update experiments set action_budget=(p_data->>'action_budget')::int,skill_costs_action=(p_data->>'skill_costs_action')::boolean where id=e.id;
 when 'capability' then
  update capabilities set enabled=(p_data->>'enabled')::boolean where experiment_id=e.id and name=p_data->>'name';
  if not found then raise exception 'Unknown capability';end if;
 when 'member' then
  if not exists(select 1 from profiles where id=(p_data->>'profile_id')::uuid) then raise exception 'Create invited profile first';end if;
  insert into experiment_members values(e.id,(p_data->>'profile_id')::uuid) on conflict do nothing;
 when 'object' then
  if e.status<>'paused' then raise exception 'Pause before modifying environment';end if;
  item:=p_data->'object';oid:=nullif(p_data->>'object_id','')::uuid;
  if oid is null then
   insert into environment_objects(experiment_id,name,public_description,available_actions,hidden_properties,location) values(e.id,item->>'name',item->>'public_description',item->'available_actions',item->'hidden_properties',item->>'location') returning id into oid;
  else
   update environment_objects set name=item->>'name',public_description=item->>'public_description',available_actions=item->'available_actions',hidden_properties=item->'hidden_properties',location=item->>'location',updated_at=now() where id=oid and experiment_id=e.id;
   if not found then raise exception 'Object not found';end if;
  end if;
  -- Objects become known only through an explicit visible environment observation.
  insert into observations(experiment_id,content,object_id) values(e.id,(item->>'name')||': '||(item->>'public_description')||' Location: '||(item->>'location'),oid) returning id into obid;
  insert into graph_nodes(experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) values(e.id,'object',oid,item->>'name',item->>'public_description',0.5,1,array[obid]) on conflict(experiment_id,node_type,reference_id) do update set label=excluded.label,summary=excluded.summary,evidence_ids=excluded.evidence_ids,updated_at=now();
 else raise exception 'Unknown command';
 end case;
 insert into experiment_logs(experiment_id,event_type,summary,payload) values(e.id,'admin_'||p_command,'Administrator: '||replace(p_command,'_',' '),jsonb_build_object('actor',p_actor,'details',case when p_command='object' then jsonb_build_object('object_id',oid) else p_data end));
 return eid;
end$$;
create function public.send_observer_message(p_actor uuid,p_experiment uuid,p_content text) returns void language plpgsql security definer set search_path=public as $$declare e experiments;begin
 select * into e from experiments where id=p_experiment for update;
 if not exists(select 1 from profiles where id=p_actor and (role='admin' or exists(select 1 from experiment_members where experiment_id=e.id and profile_id=p_actor))) then raise exception 'Access denied';end if;
 if not exists(select 1 from capabilities where experiment_id=e.id and name='communication' and enabled) then raise exception 'Communication disabled';end if;
 if (select count(*) from messages where sender_id=p_actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Message rate limit reached';end if;
 insert into messages(experiment_id,sender_id,sender_type,content) values(e.id,p_actor,'observer',p_content);
 insert into experiment_logs(experiment_id,event_type,summary) values(e.id,'observer_message','Observer message received');
end$$;
-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly revoke it from every mutation/retrieval RPC.
revoke all on function public.claim_cycle(uuid),public.save_context(uuid,uuid,jsonb),public.fail_cycle(uuid,uuid,text),public.commit_cycle(uuid,uuid,jsonb),public.memory_candidates(uuid,text),public.admin_command(uuid,text,uuid,jsonb),public.send_observer_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_cycle(uuid),public.save_context(uuid,uuid,jsonb),public.fail_cycle(uuid,uuid,text),public.commit_cycle(uuid,uuid,jsonb),public.memory_candidates(uuid,text),public.admin_command(uuid,text,uuid,jsonb),public.send_observer_message(uuid,uuid,text) to service_role;
-- Authenticated browser roles are read-only at the privilege layer too.
revoke insert,update,delete,truncate,references,trigger on all tables in schema public from anon,authenticated;

-- Full model context (including selected skill instructions) remains server-side.
revoke select on public.cycles from authenticated;
grant select(id,experiment_id,day,action_number,phase,status,model,constitution_id,error,created_at,completed_at) on public.cycles to authenticated;
