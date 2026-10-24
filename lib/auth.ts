import { createHmac,randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from './db';
import type { User } from './types';
export class HttpError extends Error { constructor(public status:number,message:string) {super(message);} }
type SessionContext={token:string|null;setCookie:string|null;secure:boolean};
const sessionContext=new AsyncLocalStorage<SessionContext>();
export async function withSession(req:Request,run:()=>Promise<Response>) {
  const cookie=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('staynest_session='))?.slice(17);
  const ctx:SessionContext={token:cookie&&/^[a-f0-9]{64}$/.test(cookie)?cookie:null,setCookie:null,secure:!!process.env.VERCEL||new URL(req.url).protocol==='https:'};
  return sessionContext.run(ctx,async()=>{
    const response=await run();
    if(ctx.setCookie)response.headers.append('Set-Cookie',ctx.setCookie);
    return response;
  });
}
function session(){const ctx=sessionContext.getStore();if(!ctx)throw new Error('Session request context is missing');return ctx;}
export function sessionToken(){return session().token;}
export function clearSession(){const ctx=session();ctx.token=null;ctx.setCookie='staynest_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(ctx.secure?'; Secure':'');}
export function digest(value:string) {
  const secret=process.env.SESSION_SECRET;
  if(process.env.VERCEL && (!secret || secret.length<32)) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  return createHmac('sha256',secret || 'local-only-staynest-development-secret').update(value).digest('hex');
}
export const publicUserFields='u.id,u.name,u.email,u.role,u.phone,u.bio,u.verified,u.created_at';
export async function currentUser(db:Database):Promise<User|null> {
  const token=sessionToken();
  if(!token) return null;
  const rows=await db.query<User>(`SELECT ${publicUserFields} FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(token)]);
  return rows[0] || null;
}
export async function requireUser(db:Database,roles?:string[]) {
  const u=await currentUser(db);
  if(!u) throw new HttpError(401,'Please sign in to continue.');
  if(roles && !roles.includes(u.role)) throw new HttpError(403,'This action is not available for your account.');
  return u;
}
export async function createSession(db:Database,userId:string) {
  const token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[digest(token),userId,new Date(Date.now()+7*86400000)]);
  const ctx=session();ctx.token=token;ctx.setCookie=`staynest_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${ctx.secure?'; Secure':''}`;
}
export async function rateLimit(db:Database,key:string,max=30) {
  const rows=await db.query(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING hits`,[digest(key)]);
  if(rows[0].hits>max) throw new HttpError(429,'Too many attempts. Please try again in 15 minutes.');
}
export function checkOrigin(req:Request) {
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return;
  if(req.headers.get('sec-fetch-site')==='cross-site') throw new HttpError(403,'Cross-site request rejected.');
  const origin=req.headers.get('origin');
  const allowed=[new URL(req.url).origin];
  if(process.env.APP_URL) allowed.push(new URL(process.env.APP_URL).origin);
  if(origin && !allowed.includes(origin)) throw new HttpError(403,'Request origin is not allowed.');
}
export async function readJson(req:Request) {
  if(!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415,'Send JSON data.');
  const raw=await req.text();
  if(raw.length>40000) throw new HttpError(413,'Request is too large.');
  try {return JSON.parse(raw);} catch {throw new HttpError(400,'Invalid JSON.');}
}
