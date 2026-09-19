import { getSnapshot } from '@/lib/server/snapshot';
import { errorResponse } from '@/lib/server/auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await getSnapshot(new URL(request.url).searchParams.get('experiment')??undefined),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
