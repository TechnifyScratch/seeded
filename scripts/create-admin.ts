import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
const email=z.email().parse(process.argv[2]);
const role=z.enum(['admin','observer']).parse(process.argv[3]??'admin');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Set Supabase credentials in .env.local');
// Use an environment variable instead of putting passwords in shell history.
const password=z.string().min(12).parse(process.env.SEEDED_USER_PASSWORD);
const client=createClient(url,key,{auth:{persistSession:false}});
const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true});
if(error)throw error;
const profile=await client.from('profiles').insert({id:data.user.id,email,role});
if(profile.error){await client.auth.admin.deleteUser(data.user.id);throw profile.error;}
console.log(`Created ${role}: ${email}\nProfile ID: ${data.user.id}\nObservers require experiment membership, granted from Settings.`);
