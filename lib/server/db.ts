import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export function configured(){return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY);}
export function db(){if(!configured())throw new Error('Supabase is not configured');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function authClient(){const jar=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* The proxy handles cookie refresh for Server Components. */}}}});}
export function unwrap<T>(result:{data:T;error:{message:string}|null}):T{if(result.error)throw new Error(result.error.message);return result.data;}
export async function rpc(name:string,args:Record<string,unknown>){return unwrap(await db().rpc(name,args));}
