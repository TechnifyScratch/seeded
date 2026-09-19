import 'server-only';
import { authClient,db,unwrap } from './db';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function requireUser(){
 const client=await authClient();const {data:{user},error}=await client.auth.getUser();
 if(error||!user)throw new HttpError(401,'Please sign in with an invited account.');
 const profile=unwrap(await db().from('profiles').select('id,email,role').eq('id',user.id).maybeSingle()) as {id:string;email:string;role:'admin'|'observer'}|null;
 if(!profile)throw new HttpError(403,'This account has not been invited to Seeded.');return profile;
}
export async function requireAccess(experimentId:string,admin=false){const p=await requireUser();if(admin&&p.role!=='admin')throw new HttpError(403,'Administrator access required.');if(p.role!=='admin'){const membership=unwrap(await db().from('experiment_members').select('experiment_id').eq('profile_id',p.id).eq('experiment_id',experimentId).maybeSingle());if(!membership)throw new HttpError(403,'No access to this experiment.');}return p;}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');const expected=new URL(process.env.NEXT_PUBLIC_APP_URL||request.url).origin;if(!origin||origin!==expected)throw new HttpError(403,'Invalid request origin.');}
export function errorResponse(error:unknown){if(error instanceof HttpError)return Response.json({error:error.message},{status:error.status});if(error instanceof Error&&error.name==='ZodError')return Response.json({error:'Invalid request. Check the supplied values.'},{status:400});console.error('Seeded request failed',error instanceof Error?error.message:'Unknown error');return Response.json({error:'The operation could not be completed. Check the experiment status and server logs.'},{status:400});}
export async function readBody(request:Request){const body=await request.text();if(body.length>32000)throw new HttpError(413,'Request too large');return JSON.parse(body);}
