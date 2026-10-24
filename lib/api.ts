import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { getDb, notify, type Database } from './db';
import { checkOrigin, clearSession, createSession, currentUser, digest, HttpError, publicUserFields, rateLimit, readJson, requireUser, sessionToken, withSession } from './auth';
import { canTransition, email, password, propertySchema, registerSchema, validVisitDate, visitInstant } from './validation';
import type { User } from './types';

const PROPERTY_SELECT=`SELECT p.*,u.name AS owner_name,u.verified AS owner_verified,
 COALESCE((SELECT avg(r.rating)::float FROM reviews r WHERE r.property_id=p.id),0) AS rating,
 (SELECT count(*)::int FROM reviews r WHERE r.property_id=p.id) AS review_count`;
const PROPERTY_FROM=' FROM properties p JOIN users u ON p.owner_id=u.id ';
const VISIT_SELECT=`SELECT v.*,p.title,p.location,p.images,p.price,p.owner_id,t.name AS tenant_name,o.name AS owner_name
 FROM visits v JOIN properties p ON p.id=v.property_id JOIN users t ON t.id=v.tenant_id JOIN users o ON o.id=p.owner_id`;
const ok=(data:unknown,status=200)=>Response.json({data},{status,headers:{'Cache-Control':'no-store'}});
const fail=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const idSchema=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
function assert(value:unknown,message='Not found.',status=404):asserts value {if(!value)throw new HttpError(status,message);}
async function ownProperty(db:Database,id:string,user:User) {
 const [p]=await db.query('SELECT * FROM properties WHERE id=$1',[id]);
 assert(p);assert(p.owner_id===user.id||user.role==='admin','You do not own this property.',403);return p;
}
async function conversation(db:Database,id:string,user:User) {
 const [c]=await db.query('SELECT * FROM conversations WHERE id=$1 AND (tenant_id=$2 OR owner_id=$2)',[id,user.id]);
 assert(c,'Conversation not found.');return c;
}
async function dispatch(req:Request,parts:string[]) {
 const route=parts.join('/'), method=req.method, url=new URL(req.url), query=url.searchParams;
 checkOrigin(req);
 if(route==='config'&&method==='GET')return ok({localDemo:!process.env.VERCEL&&process.env.NODE_ENV!=='production'&&process.env.LOCAL_DEMO!=='false',passwordReset:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)||(!process.env.VERCEL&&process.env.NODE_ENV!=='production'&&process.env.DEV_EMAIL_PREVIEW==='true'),timezone:'Africa/Nairobi',currency:'KES'});
 const db=await getDb();
 if(route==='health'&&method==='GET') {await db.query('SELECT version FROM schema_migrations LIMIT 1');return ok({status:'ok',database:'connected',app:'StayNest'});}
 if(route==='auth/me'&&method==='GET') return ok(await currentUser(db));
 if(route==='auth/register'&&method==='POST') {
  const b=registerSchema.parse(await readJson(req));
  await rateLimit(db,'register:'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'local'),15);
  const hash=await bcrypt.hash(b.password,12), id=randomUUID();
  await db.transaction(async tx=>{
   const exists=await tx.query('SELECT id FROM users WHERE email=$1',[b.email]);
   if(exists.length)throw new HttpError(409,'An account with this email already exists.');
   await tx.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,b.name,b.email,hash,b.role]);
   await notify(tx,id,'Welcome to StayNest','Your next chapter starts here. Explore homes and arrange a viewing.','/explore');
  });
  await createSession(db,id);return ok(await currentUser(db),201);
 }
 if(route==='auth/login'&&method==='POST') {
  const b=z.object({email,password:z.string().min(1).max(72)}).parse(await readJson(req));
  await rateLimit(db,'login-email:'+b.email,12);
  await rateLimit(db,'login-ip:'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'local'),60);
  const [u]=await db.query('SELECT * FROM users WHERE email=$1',[b.email]);
  // Equal-cost password work for unknown accounts.
  const valid=await bcrypt.compare(b.password,u?.password_hash||'$2b$12$Gr4K5BtDlQiYLddLf4HWT.JYMZK7wAUxGxWhWVL53yt7HahjfR9rK');
  assert(u&&valid,'Email or password is incorrect.',401);
  await createSession(db,u.id);return ok(await currentUser(db));
 }
 if(route==='auth/logout'&&method==='POST') {
  const token=sessionToken();
  if(token)await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
  clearSession();return ok({success:true});
 }
 if(route==='auth/forgot'&&method==='POST') {
  const b=z.object({email}).parse(await readJson(req));
  await rateLimit(db,'reset:'+b.email,3);
  await rateLimit(db,'reset-ip:'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'local'),15);
  const preview=!process.env.VERCEL&&process.env.NODE_ENV!=='production'&&process.env.DEV_EMAIL_PREVIEW==='true';
  if(!preview&&(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM))throw new HttpError(503,'Password reset email is not configured. Contact the site administrator.');
  const [u]=await db.query('SELECT id FROM users WHERE email=$1',[b.email]);
  let previewUrl:string|undefined;
  if(u) {
   const token=randomBytes(32).toString('hex');
   await db.query('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[digest(token),u.id,new Date(Date.now()+30*60000)]);
   if(process.env.VERCEL&&!process.env.APP_URL)throw new HttpError(503,'The administrator must configure APP_URL for password reset.');
   const link=(process.env.APP_URL||url.origin).replace(/\/$/,'')+'/reset?token='+token;
   if(preview)previewUrl=link;
   else {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:b.email,subject:'Reset your StayNest password',text:`Reset your StayNest password within 30 minutes: ${link}\nIf you did not request this, ignore this email.`}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new HttpError(503,'The email service is unavailable. Please try again later.');
   }
  }
  return ok({message:'If an account exists, a reset link has been sent.',previewUrl});
 }
 if(route==='auth/reset'&&method==='POST') {
  const b=z.object({token:z.string().length(64),password}).parse(await readJson(req));
  const hash=await bcrypt.hash(b.password,12);
  await db.transaction(async tx=>{
   const [reset]=await tx.query('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id',[digest(b.token)]);
   assert(reset,'This reset link has expired or was already used.',400);
   await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,reset.user_id]);
   await tx.query('DELETE FROM sessions WHERE user_id=$1',[reset.user_id]);
   await tx.query('DELETE FROM password_resets WHERE user_id=$1',[reset.user_id]);
  });return ok({success:true});
 }
 if(route==='profile'&&method==='PATCH') {
  const u=await requireUser(db);const b=z.object({name:z.string().trim().min(2).max(80),phone:z.string().trim().max(30).regex(/^[+\d ()-]*$/),bio:z.string().trim().max(500)}).strict().parse(await readJson(req));
  await db.query('UPDATE users SET name=$1,phone=$2,bio=$3 WHERE id=$4',[b.name,b.phone,b.bio,u.id]);return ok(await currentUser(db));
 }
 if(route==='profile/password'&&method==='POST') {
  const u=await requireUser(db);const b=z.object({currentPassword:z.string().max(72),password}).parse(await readJson(req));
  await rateLimit(db,'password:'+u.id,8);
  const [old]=await db.query('SELECT password_hash FROM users WHERE id=$1',[u.id]);
  assert(await bcrypt.compare(b.currentPassword,old.password_hash),'Current password is incorrect.',400);
  const hash=await bcrypt.hash(b.password,12);
  await db.transaction(async tx=>{await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,u.id]);await tx.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);});
  await createSession(db,u.id);return ok({success:true});
 }
 if(route==='properties'&&method==='GET') {
  const u=await currentUser(db), values:unknown[]=[u?.id||''];let where=" WHERE p.status='published'";
  function condition(sql:string,value:unknown) {values.push(value);where+=' AND '+sql.replace('?',`$${values.length}`);}
  const q=(query.get('q')||'').trim().slice(0,100);
  if(q) {values.push('%'+q+'%');where+=` AND (p.title ILIKE $${values.length} OR p.location ILIKE $${values.length} OR p.address ILIKE $${values.length})`;}
  if(query.get('type'))condition('p.type=?',query.get('type'));
  for(const [key,sql] of [['min','p.price>=?'],['max','p.price<=?'],['beds','p.beds>=?']]){const v=query.get(key);if(v!==null&&v!==''&&Number.isFinite(Number(v)))condition(sql,Number(v));}
  if(query.get('amenities'))condition('p.amenities @> ?::jsonb',JSON.stringify(query.get('amenities')!.split(',').filter(Boolean)));
  if(query.get('saved')==='true') {assert(u,'Please sign in to view your saved homes.',401);where+=' AND EXISTS(SELECT 1 FROM favorites f WHERE f.property_id=p.id AND f.user_id=$1)';}
  if(query.get('verified')==='true')where+=' AND u.verified=true';
  const order:Record<string,string>={recommended:'p.featured DESC,p.created_at DESC,p.id',price_asc:'p.price ASC,p.id',price_desc:'p.price DESC,p.id',newest:'p.created_at DESC,p.id'};
  const page=Math.max(1,Math.min(1000,Number(query.get('page'))||1));
  const rows=await db.query(PROPERTY_SELECT+',EXISTS(SELECT 1 FROM favorites f WHERE f.property_id=p.id AND f.user_id=$1) AS saved,count(*) OVER()::int AS total'+PROPERTY_FROM+where+' ORDER BY '+(order[query.get('sort')||'']||order.recommended)+' LIMIT 24 OFFSET '+Math.floor((page-1)*24),values);
  return ok({properties:rows,total:rows[0]?.total||0,page});
 }
 if(route==='properties'&&method==='POST') {
  const u=await requireUser(db,['landlord','admin']),b=propertySchema.parse(await readJson(req));await rateLimit(db,'listing:'+u.id,15);
  const id=randomUUID();
  await db.query(`INSERT INTO properties(id,owner_id,title,location,address,type,price,beds,baths,area,description,images,amenities,lat,lng,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16)`,[id,u.id,b.title,b.location,b.address,b.type,b.price,b.beds,b.baths,b.area,b.description,JSON.stringify(b.images),JSON.stringify(b.amenities),b.lat,b.lng,u.role==='admin'?'published':'pending']);
  return ok({id,status:u.role==='admin'?'published':'pending'},201);
 }
 if(parts[0]==='properties'&&parts.length>=2) {
  const id=idSchema.parse(parts[1]);
  if(parts.length===2&&method==='GET') {
   const u=await currentUser(db);
   const [p]=await db.query(PROPERTY_SELECT+',EXISTS(SELECT 1 FROM favorites f WHERE f.property_id=p.id AND f.user_id=$2) AS saved'+PROPERTY_FROM+' WHERE p.id=$1',[id,u?.id||'']);
   assert(p&&(p.status==='published'||p.owner_id===u?.id||u?.role==='admin'));
   const reviews=await db.query('SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE property_id=$1 ORDER BY r.created_at DESC LIMIT 50',[id]);
   const eligible=u?await db.query("SELECT id FROM visits WHERE tenant_id=$1 AND property_id=$2 AND status='completed' LIMIT 1",[u.id,id]):[];
   return ok({property:p,reviews,canReview:eligible.length>0});
  }
  if(parts.length===2&&method==='PATCH') {
   const u=await requireUser(db,['landlord','admin']);await ownProperty(db,id,u);const b=propertySchema.parse(await readJson(req));
   await db.query(`UPDATE properties SET title=$1,location=$2,address=$3,type=$4,price=$5,beds=$6,baths=$7,area=$8,description=$9,images=$10::jsonb,amenities=$11::jsonb,lat=$12,lng=$13,status=$14,featured=false,updated_at=now() WHERE id=$15`,[b.title,b.location,b.address,b.type,b.price,b.beds,b.baths,b.area,b.description,JSON.stringify(b.images),JSON.stringify(b.amenities),b.lat,b.lng,u.role==='admin'?'published':'pending',id]);
   return ok({success:true});
  }
  if(parts.length===2&&method==='DELETE') {
   const u=await requireUser(db,['landlord','admin']);await ownProperty(db,id,u);
   await db.transaction(async tx=>{
    await tx.query("UPDATE properties SET status='archived',updated_at=now() WHERE id=$1",[id]);
    const cancelled=await tx.query("UPDATE visits SET status='cancelled' WHERE property_id=$1 AND status IN ('pending','confirmed') RETURNING tenant_id",[id]);
    for(const v of cancelled)await notify(tx,v.tenant_id,'Visit cancelled','The landlord has withdrawn this property.','/visits');
   });return ok({success:true});
  }
  if(parts[2]==='slots'&&method==='GET') {
   const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(query.get('date'));
   const rows=await db.query("SELECT visit_time FROM visits WHERE property_id=$1 AND visit_date=$2 AND status IN ('pending','confirmed','completed')",[id,date]);
   return ok(rows.map(r=>r.visit_time));
  }
  if(parts[2]==='favorite'&&['POST','DELETE'].includes(method)) {
   const u=await requireUser(db);
   const [p]=await db.query("SELECT id FROM properties WHERE id=$1 AND status='published'",[id]);assert(p);
   if(method==='POST')await db.query('INSERT INTO favorites(user_id,property_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[u.id,id]);
   else await db.query('DELETE FROM favorites WHERE user_id=$1 AND property_id=$2',[u.id,id]);
   return ok({saved:method==='POST'});
  }
  if(parts[2]==='reviews'&&method==='POST') {
   const u=await requireUser(db),b=z.object({rating:z.number().int().min(1).max(5),body:z.string().trim().min(10).max(1500)}).parse(await readJson(req));
   const [eligible]=await db.query("SELECT id FROM visits WHERE property_id=$1 AND tenant_id=$2 AND status='completed'",[id,u.id]);assert(eligible,'Reviews are available after a completed viewing.',403);
   await db.query('INSERT INTO reviews(id,property_id,user_id,rating,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(property_id,user_id) DO UPDATE SET rating=$4,body=$5',[randomUUID(),id,u.id,b.rating,b.body]);return ok({success:true});
  }
 }
 if(route==='visits'&&method==='GET') {
  const u=await requireUser(db);return ok(await db.query(VISIT_SELECT+' WHERE v.tenant_id=$1 OR p.owner_id=$1 ORDER BY v.visit_date DESC,v.visit_time DESC LIMIT 300',[u.id]));
 }
 if(route==='visits'&&method==='POST') {
  const u=await requireUser(db);const b=z.object({propertyId:idSchema,date:z.string(),time:z.string(),note:z.string().trim().max(500).default('')}).parse(await readJson(req));
  assert(validVisitDate(b.date,b.time),'Choose a future visit within the next 90 days.',400);await rateLimit(db,'visit:'+u.id,15);
  const id=randomUUID();
  await db.transaction(async tx=>{
   const [p]=await tx.query("SELECT * FROM properties WHERE id=$1 AND status='published' FOR UPDATE",[b.propertyId]);
   assert(p,'This property is not available.');assert(p.owner_id!==u.id,'You cannot book a visit to your own property.',400);
   await tx.query('INSERT INTO visits(id,property_id,tenant_id,visit_date,visit_time,note) VALUES($1,$2,$3,$4,$5,$6)',[id,p.id,u.id,b.date,b.time,b.note]);
   await notify(tx,u.id,'Visit requested',`Your viewing of ${p.title} is awaiting the host’s confirmation.`,'/visits');
   await notify(tx,p.owner_id,'New viewing request',`${u.name} requested ${b.date} at ${b.time} (EAT).`,'/visits');
  });return ok({id,status:'pending'},201);
 }
 if(parts[0]==='visits'&&parts.length===2&&method==='PATCH') {
  const u=await requireUser(db),b=z.object({status:z.enum(['confirmed','cancelled','declined','completed'])}).parse(await readJson(req));
  await db.transaction(async tx=>{
   const [v]=await tx.query('SELECT v.*,p.owner_id,p.title FROM visits v JOIN properties p ON p.id=v.property_id WHERE v.id=$1 FOR UPDATE OF v',[parts[1]]);
   assert(v&&(v.tenant_id===u.id||v.owner_id===u.id),'Visit not found.');
   assert(canTransition(v.status,b.status,v.owner_id===u.id,visitInstant(v.visit_date,v.visit_time).getTime()<Date.now()),'This visit cannot be changed to that status.',409);
   await tx.query('UPDATE visits SET status=$1 WHERE id=$2',[b.status,parts[1]]);
   await notify(tx,v.tenant_id===u.id?v.owner_id:v.tenant_id,'Visit '+b.status,`${v.title}: ${v.visit_date} at ${v.visit_time} (EAT).`,'/visits');
  });return ok({success:true});
 }
 if(route==='conversations'&&method==='GET') {
  const u=await requireUser(db);return ok(await db.query(`SELECT c.*,p.title,p.images,t.name AS tenant_name,o.name AS owner_name,
   (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_message,
   COALESCE((SELECT max(created_at) FROM messages WHERE conversation_id=c.id),c.created_at) AS last_at,
   (SELECT count(*)::int FROM messages WHERE conversation_id=c.id AND sender_id<>$1 AND read_at IS NULL) AS unread
   FROM conversations c JOIN properties p ON p.id=c.property_id JOIN users t ON t.id=c.tenant_id JOIN users o ON o.id=c.owner_id
   WHERE c.tenant_id=$1 OR c.owner_id=$1 ORDER BY last_at DESC LIMIT 100`,[u.id]));
 }
 if(route==='conversations'&&method==='POST') {
  const u=await requireUser(db),b=z.object({propertyId:idSchema}).parse(await readJson(req));await rateLimit(db,'conversation:'+u.id,30);
  const [p]=await db.query("SELECT * FROM properties WHERE id=$1 AND status='published'",[b.propertyId]);assert(p);assert(p.owner_id!==u.id,'This is your own listing.',400);
  const [c]=await db.query('INSERT INTO conversations(id,property_id,tenant_id,owner_id) VALUES($1,$2,$3,$4) ON CONFLICT(property_id,tenant_id) DO UPDATE SET property_id=excluded.property_id RETURNING id',[randomUUID(),p.id,u.id,p.owner_id]);return ok(c,201);
 }
 if(parts[0]==='conversations'&&parts.length===3&&parts[2]==='messages') {
  const u=await requireUser(db),c=await conversation(db,parts[1],u);
  if(method==='GET')return ok(await db.query('SELECT * FROM (SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200) recent ORDER BY created_at,id',[c.id]));
  if(method==='PATCH') {await db.query('UPDATE messages SET read_at=now() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL',[c.id,u.id]);return ok({success:true});}
  if(method==='POST') {
   const b=z.object({body:z.string().trim().min(1).max(3000)}).parse(await readJson(req));await rateLimit(db,'message:'+u.id,80);const id=randomUUID();
   await db.transaction(async tx=>{await tx.query('INSERT INTO messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)',[id,c.id,u.id,b.body]);await notify(tx,c.tenant_id===u.id?c.owner_id:c.tenant_id,'New message',`${u.name} sent you a message.`,`/messages?conversation=${c.id}`);});return ok({id},201);
  }
 }
 if(route==='notifications'&&method==='GET') {const u=await requireUser(db);return ok(await db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[u.id]));}
 if(route==='notifications'&&method==='PATCH') {const u=await requireUser(db);await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[u.id]);return ok({success:true});}
 if(route==='host'&&method==='GET') {
  const u=await requireUser(db,['landlord','admin']);return ok(await db.query(PROPERTY_SELECT+PROPERTY_FROM+' WHERE p.owner_id=$1 ORDER BY p.created_at DESC',[u.id]));
 }
 if(parts[0]==='landlords'&&parts.length===2&&method==='GET') {
  const [u]=await db.query("SELECT id,name,bio,verified,created_at FROM users WHERE id=$1 AND role IN ('landlord','admin')",[parts[1]]);assert(u);
  return ok({landlord:u,properties:await db.query(PROPERTY_SELECT+PROPERTY_FROM+" WHERE p.owner_id=$1 AND p.status='published' ORDER BY p.created_at DESC",[u.id])});
 }
 if(route==='support'&&method==='GET') {const u=await requireUser(db);return ok(await db.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[u.id]));}
 if(route==='support'&&method==='POST') {
  const u=await requireUser(db),b=z.object({subject:z.string().trim().min(4).max(120),body:z.string().trim().min(10).max(3000)}).parse(await readJson(req));await rateLimit(db,'support:'+u.id,5);
  const id=randomUUID();await db.query('INSERT INTO support_tickets(id,user_id,subject,body) VALUES($1,$2,$3,$4)',[id,u.id,b.subject,b.body]);return ok({id},201);
 }
 if(route==='admin'&&method==='GET') {
  await requireUser(db,['admin']);
  const [properties,users,tickets]=await Promise.all([
   db.query(PROPERTY_SELECT+PROPERTY_FROM+' ORDER BY p.created_at DESC LIMIT 500'),
   db.query(`SELECT ${publicUserFields} FROM users u ORDER BY u.created_at DESC LIMIT 500`),
   db.query('SELECT s.*,u.name,u.email FROM support_tickets s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 200')
  ]);return ok({properties,users,tickets});
 }
 if(parts[0]==='admin'&&parts[1]==='properties'&&parts.length===3&&method==='PATCH') {
  await requireUser(db,['admin']);const b=z.object({status:z.enum(['pending','published','archived']),featured:z.boolean().default(false)}).parse(await readJson(req));
  await db.transaction(async tx=>{
   const [p]=await tx.query('UPDATE properties SET status=$1,featured=$2,updated_at=now() WHERE id=$3 RETURNING owner_id,title',[b.status,b.featured,parts[2]]);assert(p);
   await notify(tx,p.owner_id,'Listing '+b.status,p.title,'/host');
   if(b.status!=='published') {
    const visits=await tx.query("UPDATE visits SET status='cancelled' WHERE property_id=$1 AND status IN ('pending','confirmed') RETURNING tenant_id",[parts[2]]);
    for(const v of visits)await notify(tx,v.tenant_id,'Visit cancelled','This listing is currently unavailable.','/visits');
   }
  });return ok({success:true});
 }
 if(parts[0]==='admin'&&parts[1]==='users'&&parts.length===3&&method==='PATCH') {
  await requireUser(db,['admin']);const b=z.object({verified:z.boolean()}).strict().parse(await readJson(req));
  const rows=await db.query("UPDATE users SET verified=$1 WHERE id=$2 AND role='landlord' RETURNING id",[b.verified,parts[2]]);assert(rows.length);return ok({success:true});
 }
 if(parts[0]==='admin'&&parts[1]==='tickets'&&parts.length===3&&method==='PATCH') {
  await requireUser(db,['admin']);const b=z.object({status:z.enum(['open','resolved'])}).parse(await readJson(req));
  await db.transaction(async tx=>{const [t]=await tx.query('UPDATE support_tickets SET status=$1 WHERE id=$2 RETURNING user_id,subject',[b.status,parts[2]]);assert(t);await notify(tx,t.user_id,'Support request '+b.status,t.subject,'/help');});return ok({success:true});
 }
 throw new HttpError(404,'Endpoint not found.');
}
export async function handleApi(req:Request,parts:string[]) {
 return withSession(req,async()=>{
 try{return await dispatch(req,parts);}catch(error:any){
  if(error instanceof HttpError)return fail(error.status,error.message);
  if(error instanceof ZodError)return fail(400,error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  if(error.code==='23505')return fail(409,'This entry already exists or this visit time is no longer available. Please choose another.');
  if(error.message==='DATABASE_NOT_CONFIGURED')return fail(503,'Connect PostgreSQL and set DATABASE_URL in Vercel. See docs/VERCEL.md.');
  if(error.message==='SESSION_SECRET_NOT_CONFIGURED')return fail(503,'Set SESSION_SECRET to a random value of at least 32 characters in Vercel.');
  if(error.code==='42P01')return fail(503,'Initialize the database with npm run db:setup. See docs/VERCEL.md.');
  console.error('StayNest API failure:',error.code||error.name||'unknown');
  return fail(500,'Something went wrong. Please try again.');
 }
 });
}
