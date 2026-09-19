-- All mutation RPCs are service-role-only. Each route first checks authenticated profile/membership.
create function public.claim_cycle(p_experiment uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare e experiments;c cycles;t uuid:=gen_random_uuid();begin
 select * into e from experiments where id=p_experiment for update;
 if not found or e.status not in ('running','reflecting') or e.is_demo then return null;end if;
 if e.lease_until>now() then return null;end if;
 if exists(select 1 from cycles where experiment_id=e.id and status='pending') then
  update cycles set status='failed',error='Worker lease expired',completed_at=now() where experiment_id=e.id and status='pending';
  update experiments set status='paused',last_error='Worker lease expired; inspect timeline before resuming',lease_token=null,lease_until=null where id=e.id;
  insert into experiment_logs(experiment_id,event_type,summary) values(e.id,'worker_expired','Worker lease expired. Experiment paused; no action was committed.');return null;
 end if;
 if e.status='running' and e.actions_used>=e.action_budget then update experiments set status='reflecting' where id=e.id;e.status:='reflecting';end if;
 if not exists(select 1 from constitutions where id=e.constitution_id and active) then raise exception 'Active constitution required';end if;
 update experiments set lease_token=t,lease_until=now()+interval '150 seconds',last_error=null where id=e.id;
 insert into cycles(experiment_id,day,action_number,phase,lease_token,model,constitution_id) values(e.id,e.day,e.actions_used+1,case when e.status='reflecting' then 'reflection' else 'action' end,t,e.model,e.constitution_id) returning * into c;
 return jsonb_build_object('experiment',to_jsonb(e),'cycle',to_jsonb(c),'token',t);
end$$;
create function public.save_context(p_cycle uuid,p_token uuid,p_context jsonb) returns void language plpgsql security definer set search_path=public as $$begin
 update cycles set context=p_context where id=p_cycle and lease_token=p_token and status='pending';if not found then raise exception 'Stale cycle';end if;
end$$;
create function public.fail_cycle(p_cycle uuid,p_token uuid,p_error text) returns void language plpgsql security definer set search_path=public as $$declare e experiments;c cycles;begin
 select * into c from cycles where id=p_cycle;
 select * into e from experiments where id=c.experiment_id for update;
 if e.lease_token is distinct from p_token then return;end if;
 update cycles set status='failed',error=left(p_error,500),completed_at=now() where id=c.id;
 update experiments set status='paused',lease_token=null,lease_until=null,last_error=left(p_error,500),updated_at=now() where id=e.id;
 insert into experiment_logs(experiment_id,cycle_id,event_type,summary) values(e.id,c.id,'cycle_failed',left(p_error,500));
end$$;
create function public.commit_cycle(p_cycle uuid,p_token uuid,p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare e experiments;c cycles;r jsonb;a uuid:=gen_random_uuid();obs uuid:=gen_random_uuid();m uuid;n uuid;cost int;skill uuid;old_edge jsonb;old_node jsonb;object_node uuid;begin
 select * into c from cycles where id=p_cycle;
 select * into e from experiments where id=c.experiment_id for update;
 if c.status='completed' then return;end if;
 if c.status<>'pending' or e.lease_token is distinct from p_token or e.lease_until<now() or e.status not in ('running','reflecting') then raise exception 'Stale or stopped cycle';end if;
 skill:=nullif(p->>'skill_id','')::uuid;
 if skill is not null then
  if c.phase='reflection' or e.skill_selections>=3 or not exists(select 1 from skills where id=skill and enabled) or not exists(select 1 from capabilities where experiment_id=e.id and name='skills' and enabled) then raise exception 'Skill unavailable';end if;
  cost:=case when e.skill_costs_action then 1 else 0 end;
 else cost:=case when c.phase='reflection' then 0 else 1 end;end if;
 if e.actions_used+cost>e.action_budget then raise exception 'Action budget exhausted';end if;
 if c.phase='reflection' and p->'decision'->'selected_action'->>'type' not in ('reflect','rest') then raise exception 'Reflection cannot act on environment';end if;
 insert into decision_records(experiment_id,cycle_id,record) values(e.id,c.id,p->'decision');
 insert into actions(id,experiment_id,cycle_id,type,target,payload,result,cost) values(a,e.id,c.id,p->'decision'->'selected_action'->>'type',nullif(p->'decision'->'selected_action'->>'target','')::uuid,p->'decision'->'selected_action',jsonb_build_object('observation',p->>'observation'),cost);
 insert into observations(id,experiment_id,cycle_id,content,object_id) values(obs,e.id,c.id,p->>'observation',nullif(p->'decision'->'selected_action'->>'target','')::uuid);
 if p->'object_update' is not null and p->'object_update'<>'null'::jsonb then
  update environment_objects set internal_state=p->'object_update'->'internal_state',updated_at=now() where id=(p->'object_update'->>'id')::uuid and experiment_id=e.id;
  if not found then raise exception 'Foreign object';end if;
 end if;
 if skill is not null then
  update skill_usage set result='Superseded by another skill selection',duration_ms=least(2147483647,extract(epoch from(now()-created_at))*1000)::int where experiment_id=e.id and subsequent_action_id is null and result is null;
  insert into skill_usage(experiment_id,cycle_id,skill_id,reason_summary,context) values(e.id,c.id,skill,p->'decision'->>'decision_summary',jsonb_build_object('day',e.day,'action_number',c.action_number,'expires','after next environment action'));
 else
  update skill_usage set subsequent_action_id=a,result=p->>'observation',duration_ms=least(2147483647,extract(epoch from(now()-created_at))*1000)::int where experiment_id=e.id and subsequent_action_id is null and result is null;
 end if;
 for r in select * from jsonb_array_elements(coalesce(p->'retrievals','[]')) loop
  if not exists(select 1 from memories where id=(r->>'id')::uuid and experiment_id=e.id) then raise exception 'Foreign memory';end if;
  insert into memory_retrievals(experiment_id,cycle_id,memory_id,score,reasons) values(e.id,c.id,(r->>'id')::uuid,(r->>'score')::float,r->'reasons');
  update memories set recall_count=recall_count+1,last_recalled_at=now() where id=(r->>'id')::uuid;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(p->'decision'->'memory_requests','[]')) loop
  if not exists(select 1 from capabilities where experiment_id=e.id and name='memory' and enabled) then raise exception 'Memory disabled';end if;
  if r->>'operation'='archive' then
   update memories set archived=true,updated_at=now() where id=(r->>'memory_id')::uuid and experiment_id=e.id;
   if not found then raise exception 'Foreign memory';end if;
   insert into experiment_logs(experiment_id,cycle_id,event_type,summary,payload) values(e.id,c.id,'memory_archived',r->>'reason',r);
  else
   m:=gen_random_uuid();
   insert into memories(id,experiment_id,type,title,content,reason_saved,importance,confidence,cycle_created) values(m,e.id,r->>'type',r->>'title',r->>'content',r->>'reason_saved',(r->>'importance')::float,(r->>'confidence')::float,c.id);
   insert into graph_nodes(experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) values(e.id,case when r->>'type'='self_model' then 'self_model' else 'memory' end,m,r->>'title',r->>'content',(r->>'importance')::float,(r->>'confidence')::float,array[obs]);
   insert into experiment_logs(experiment_id,cycle_id,event_type,summary,payload) values(e.id,c.id,'memory_created',r->>'title',jsonb_build_object('memory_id',m));
  end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(p->'nodes','[]')) loop
  select to_jsonb(g) into old_node from graph_nodes g where id=(r->>'id')::uuid and experiment_id=e.id;
  insert into graph_nodes(id,experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) values((r->>'id')::uuid,e.id,r->>'node_type',nullif(r->>'reference_id','')::uuid,r->>'label',r->>'summary',(r->>'importance')::float,(r->>'confidence')::float,array(select jsonb_array_elements_text(r->'evidence_ids'))::uuid[])
  on conflict(id) do update set summary=excluded.summary,importance=excluded.importance,confidence=excluded.confidence,evidence_ids=excluded.evidence_ids,updated_at=now() where graph_nodes.experiment_id=e.id;
  insert into experiment_logs(experiment_id,cycle_id,event_type,summary,payload) values(e.id,c.id,'graph_node',r->>'label',jsonb_build_object('before',old_node,'after',r));
 end loop;
 for r in select * from jsonb_array_elements(coalesce(p->'edges','[]')) loop
  select to_jsonb(g) into old_edge from graph_edges g where experiment_id=e.id and source_node_id=(r->>'source_node_id')::uuid and target_node_id=(r->>'target_node_id')::uuid and relationship=r->>'relationship';
  insert into graph_edges(experiment_id,source_node_id,target_node_id,relationship,strength,confidence,status,evidence_ids) values(e.id,(r->>'source_node_id')::uuid,(r->>'target_node_id')::uuid,r->>'relationship',(r->>'strength')::float,(r->>'confidence')::float,r->>'status',array(select jsonb_array_elements_text(r->'evidence_ids'))::uuid[])
  on conflict(experiment_id,source_node_id,target_node_id,relationship) do update set strength=excluded.strength,confidence=excluded.confidence,status=excluded.status,evidence_ids=excluded.evidence_ids,updated_at=now();
  insert into experiment_logs(experiment_id,cycle_id,event_type,summary,payload) values(e.id,c.id,'graph_edge',r->>'relationship',jsonb_build_object('before',old_edge,'after',r));
 end loop;
 -- Every actual action and resulting observation gets provenance nodes; no invented concepts.
 insert into graph_nodes(experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) values(e.id,'action',a,p->'decision'->'selected_action'->>'type',p->'decision'->>'decision_summary',0.4,1,array[obs]) returning id into n;
 insert into graph_nodes(experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) values(e.id,'observation',obs,left(p->>'observation',70),p->>'observation',0.5,1,array[obs]) returning id into m;
 insert into graph_edges(experiment_id,source_node_id,target_node_id,relationship,strength,confidence,status,evidence_ids) values(e.id,n,m,'resulted_in',1,1,'confirmed',array[obs]);
 if nullif(p->'decision'->'selected_action'->>'target','') is not null then
  select id into object_node from graph_nodes where experiment_id=e.id and node_type='object' and reference_id=(p->'decision'->'selected_action'->>'target')::uuid;
  if object_node is not null then insert into graph_edges(experiment_id,source_node_id,target_node_id,relationship,strength,confidence,status,evidence_ids) values(e.id,n,object_node,'tested_with',1,1,'confirmed',array[obs]);end if;
 end if;
 if skill is not null then
  insert into graph_nodes(experiment_id,node_type,reference_id,label,summary,importance,confidence,evidence_ids) select e.id,'skill',id,name,description,0.4,1,array[obs] from skills where id=skill on conflict(experiment_id,node_type,reference_id) do update set updated_at=now() returning id into object_node;
  insert into graph_edges(experiment_id,source_node_id,target_node_id,relationship,strength,confidence,status,evidence_ids) values(e.id,n,object_node,'used_skill',1,1,'confirmed',array[obs]);
 end if;
 if p->'decision'->'selected_action'->>'type' in ('journal','reflect','write_note') then insert into journal_entries(experiment_id,cycle_id,content,kind) values(e.id,c.id,p->'decision'->'selected_action'->>'content',p->'decision'->'selected_action'->>'type');end if;
 if p->'decision'->'selected_action'->>'type'='ask_observer' then
  if not exists(select 1 from capabilities where experiment_id=e.id and name='communication' and enabled) then raise exception 'Communication disabled';end if;
  insert into messages(experiment_id,sender_type,content,cycle_id) values(e.id,'seeded',p->'decision'->'selected_action'->>'content',c.id);
 end if;
 update cycles set status='completed',completed_at=now() where id=c.id;
 update experiments set actions_used=actions_used+cost,skill_selections=case when skill is null then 0 else skill_selections+1 end,active_skill_id=skill,location=coalesce(p->>'location',location),lease_token=null,lease_until=null,updated_at=now(),status=case when c.phase='reflection' then 'day_complete' when actions_used+cost>=action_budget then 'reflecting' else status end where id=e.id;
 insert into environment_events(experiment_id,cycle_id,event_type,payload) values(e.id,c.id,'action_result',jsonb_build_object('action_id',a,'observation_id',obs));
 insert into experiment_logs(experiment_id,cycle_id,event_type,summary,payload) values(e.id,c.id,case when skill is not null then 'skill_selected' else 'action_completed' end,p->'decision'->>'decision_summary',jsonb_build_object('action_id',a,'day',e.day,'action_number',c.action_number,'cost',cost));
 if c.phase='reflection' then insert into experiment_logs(experiment_id,cycle_id,event_type,summary) values(e.id,c.id,'day_complete','End-of-day reflection completed. Awaiting administrator.');end if;
end$$;
-- Candidate pool merges recency, salience, self-model, and full-text relevance; then semantic reranking occurs server-side.
create function public.memory_candidates(p_experiment uuid,p_query text) returns setof public.memories language sql security definer set search_path=public as $$
 with candidates as (
 (select id from memories where experiment_id=p_experiment and not archived order by created_at desc limit 12)
 union (select id from memories where experiment_id=p_experiment and not archived order by importance desc limit 12)
 union (select id from memories where experiment_id=p_experiment and not archived and type='self_model' order by updated_at desc limit 8)
 union (select id from memories where experiment_id=p_experiment and not archived and search_vector@@websearch_to_tsquery('english',left(p_query,1000)) order by ts_rank(search_vector,websearch_to_tsquery('english',left(p_query,1000))) desc limit 16))
 select m.* from memories m join candidates c on c.id=m.id;
$$;
