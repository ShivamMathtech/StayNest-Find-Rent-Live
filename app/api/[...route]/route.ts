import { handleApi } from '@/lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
async function handler(request:Request,context:{params:Promise<{route:string[]}>}) {
 return handleApi(request,(await context.params).route);
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
