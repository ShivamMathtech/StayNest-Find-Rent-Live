/** Full API request/response integration against an isolated, persistent PostgreSQL engine.
 * Uses the exact handler exported by the Next.js route, without a second web server.
 * No production connection is used. Temporary records are removed after the run.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
async function main(){
 const folder=await mkdtemp(path.join(tmpdir(),'staynest-integration-'));
 delete process.env.DATABASE_URL;delete process.env.POSTGRES_URL;delete process.env.VERCEL;
 process.env.LOCAL_DATABASE_PATH=path.join(folder,'postgres');process.env.LOCAL_DEMO='false';
 process.env.SESSION_SECRET='integration-test-secret-not-a-production-credential';
 process.env.DEV_EMAIL_PREVIEW='true';delete process.env.APP_URL;
 const {handleApi}=await import('../lib/api');
 const {getDb,migrate,seedDatabase}=await import('../lib/db');
 let db=await getDb();await migrate(db);await seedDatabase(db,true);
 let checks=0;const passed=(message:string)=>{checks++;console.log('PASS '+message);};
 function client(){
  let cookie='';return {
   cookie:()=>cookie,
   request:async(url:string,method='GET',body?:unknown,status=200,headers:Record<string,string>={})=>{
    const req=new Request('http://localhost:3000/api/'+url,{method,headers:{Origin:'http://localhost:3000',...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const response=await handleApi(req,url.split('?')[0].split('/'));
    const json=await response.json();assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(json)}`);
    const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {data:json.data,error:json.error,response};
   }
  };
 }
 const guest=client(),tenant=client(),host=client(),outsider=client(),admin=client();
 const credentials={password:'Test-password-123'};
 try {
  await guest.request('health');passed('Health confirms initialized database');
  const catalog=await guest.request('properties');assert.equal(catalog.data.total,8);passed('Public catalog contains eight seeded homes');
  await guest.request('auth/register','POST',{...credentials,name:'Illegal Admin',email:'admin-attacker@test.example',role:'admin'},400);passed('Public signup cannot create admins');
  const t=await tenant.request('auth/register','POST',{...credentials,name:'Test Tenant',email:'tenant@test.example',role:'tenant'},201);
  assert.match(t.response.headers.get('set-cookie')||'',/HttpOnly/);assert.match(t.response.headers.get('set-cookie')||'',/SameSite=Lax/);passed('Registration issues an HttpOnly same-site session');
  const h=await host.request('auth/register','POST',{...credentials,name:'Test Host',email:'host@test.example',role:'landlord'},201);
  await outsider.request('auth/register','POST',{...credentials,name:'Test Outsider',email:'outsider@test.example',role:'tenant'},201);
  await guest.request('auth/register','POST',{...credentials,name:'Duplicate',email:'TENANT@TEST.EXAMPLE',role:'tenant'},409);passed('Duplicate emails are rejected case-insensitively');
  assert.equal((await tenant.request('auth/me')).data.id,t.data.id);passed('Session resolves the correct user');
  await guest.request('visits','POST',{},401);passed('Guests cannot create visits');
  await tenant.request('profile','PATCH',{},403,{Origin:'https://attacker.test'});passed('Cross-origin mutation is rejected');
  const listing={title:'Integration Garden Home',location:'Test Park, Nairobi',address:'12 Test Park, Nairobi',type:'Apartment',price:45000,beds:2,baths:1,area:90,description:'A deliberately fictional home used only by the automated integration test suite.',images:['/images/house.jpg'],amenities:['Wi-Fi','Parking'],lat:-1.29,lng:36.8};
  await tenant.request('properties','POST',listing,403);passed('Tenant accounts cannot create listings');
  const made=await host.request('properties','POST',listing,201),id=made.data.id;
  assert.equal(made.data.status,'pending');passed('New landlord listing awaits moderation');
  await guest.request('properties/'+id,'GET',undefined,404);passed('Unpublished listing is hidden from guests');
  await outsider.request('properties/'+id,'PATCH',listing,403);passed('Non-owner cannot edit another listing');
  await host.request('properties/'+id,'PATCH',{...listing,verified:true},400);passed('Listing updates reject privilege fields');
  await admin.request('auth/login','POST',{email:'admin@staynest.demo',password:'StayNest!2026'});
  await admin.request('admin/properties/'+id,'PATCH',{status:'published',featured:true});passed('Administrator can publish and feature listings');
  assert.equal((await guest.request('properties?q=Integration')).data.total,1);passed('Search returns the matching published property');
  assert.equal((await guest.request('properties?max=40000&q=Integration')).data.total,0);passed('Price filter applies on the server');
  assert.equal((await guest.request('properties?amenities=Pool&q=Integration')).data.total,0);passed('Amenity filter applies on the server');
  await guest.request("properties?q="+encodeURIComponent("' OR 1=1; --"));passed('Search treats SQL-like input as data');
  await tenant.request('properties/'+id+'/favorite','POST',{});await tenant.request('properties/'+id+'/favorite','POST',{});
  assert.equal((await tenant.request('properties?saved=true')).data.total,1);passed('Saved properties are persistent and idempotent');
  assert.equal((await outsider.request('properties?saved=true')).data.total,0);passed('Saved properties are private to each user');
  const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10),visit={propertyId:id,date,time:'10:30',note:'A test appointment.'};
  await tenant.request('visits','POST',{...visit,date:'2000-01-01'},400);passed('Past viewing dates are rejected');
  const races=await Promise.all([tenant.request('visits','POST',visit,201),outsider.request('visits','POST',{...visit,time:'12:00'},201)]);
  const visitId=races[0].data.id;
  await outsider.request('visits','POST',visit,409);passed('Database uniqueness prevents double-booking a slot');
  assert.ok((await guest.request('properties/'+id+'/slots?date='+date)).data.includes('10:30'));passed('Reserved slots are excluded from availability');
  await tenant.request('visits/'+visitId,'PATCH',{status:'confirmed'},409);passed('A tenant cannot self-confirm a viewing');
  await outsider.request('visits/'+visitId,'PATCH',{status:'cancelled'},404);passed('Unrelated user cannot cancel another viewing');
  await host.request('visits/'+visitId,'PATCH',{status:'confirmed'});passed('Host can confirm the viewing');
  await host.request('visits/'+visitId,'PATCH',{status:'completed'},409);passed('Future viewings cannot be marked completed');
  await host.request('visits','POST',{...visit,time:'15:00'},400);passed('Hosts cannot book their own property');
  const conv=(await tenant.request('conversations','POST',{propertyId:id},201)).data;
  assert.equal((await tenant.request('conversations','POST',{propertyId:id},201)).data.id,conv.id);passed('Conversation creation is idempotent');
  await tenant.request(`conversations/${conv.id}/messages`,'POST',{body:'Is the property available for a viewing?'},201);
  const incoming=(await host.request(`conversations/${conv.id}/messages`)).data;assert.equal(incoming.length,1);passed('Host receives the tenant message');
  await outsider.request(`conversations/${conv.id}/messages`,'GET',undefined,404);passed('Unrelated user cannot read a private conversation');
  await outsider.request(`conversations/${conv.id}/messages`,'POST',{body:'Intrusion'},404);passed('Unrelated user cannot send into a private conversation');
  await host.request(`conversations/${conv.id}/messages`,'PATCH',{});assert.ok((await tenant.request(`conversations/${conv.id}/messages`)).data[0].read_at);passed('Read receipt is persisted');
  await host.request(`conversations/${conv.id}/messages`,'POST',{body:'Yes. Your requested viewing is confirmed.'},201);passed('Two-way messaging works');
  assert.ok((await tenant.request('notifications')).data.length>=2);passed('Viewing and messaging notifications are stored');
  await tenant.request('notifications','PATCH',{});assert.ok((await tenant.request('notifications')).data.every((n:any)=>n.read_at));passed('Mark-all-read only changes current user notifications');
  await tenant.request('properties/'+id+'/reviews','POST',{rating:5,body:'A very good place to live.'},403);passed('Unvisited properties cannot be reviewed');
  // Time is advanced by arranging only this isolated test fixture as a past visit.
  await db.query("UPDATE visits SET visit_date='2020-01-01' WHERE id=$1",[visitId]);
  await host.request('visits/'+visitId,'PATCH',{status:'completed'});
  await tenant.request('properties/'+id+'/reviews','POST',{rating:5,body:'A bright, welcoming home with a thoughtful host.'});
  await tenant.request('properties/'+id+'/reviews','POST',{rating:4,body:'Updated review after my completed viewing.'});
  const reviewed=(await guest.request('properties/'+id)).data;assert.equal(reviewed.property.review_count,1);assert.equal(reviewed.property.rating,4);passed('Completed visitors can create and edit one review');
  const ticket=(await tenant.request('support','POST',{subject:'Test support request',body:'Please help with the test property listing.'},201)).data;
  await admin.request('admin/tickets/'+ticket.id,'PATCH',{status:'resolved'});assert.equal((await tenant.request('support')).data[0].status,'resolved');passed('Support tickets can be resolved by the administrator');
  await tenant.request('admin','GET',undefined,403);passed('Tenant cannot open administrator data');
  await tenant.request('profile','PATCH',{name:'Updated Tenant',phone:'+254 700 000 000',bio:'Looking for a bright home.'});
  assert.equal((await tenant.request('auth/me')).data.name,'Updated Tenant');passed('Profile edits persist');
  await tenant.request('profile','PATCH',{name:'Updated Tenant',phone:'',bio:'',role:'admin'},400);passed('Profile endpoint cannot escalate privileges');
  const reset=(await tenant.request('auth/forgot','POST',{email:'tenant@test.example'})).data;
  assert.ok(reset.previewUrl);const token=new URL(reset.previewUrl).searchParams.get('token');
  await guest.request('auth/reset','POST',{token,password:'Updated-password-456'});assert.equal((await tenant.request('auth/me')).data,null);passed('Password reset revokes old sessions');
  await guest.request('auth/reset','POST',{token,password:'Another-password-456'},400);passed('Reset tokens are single-use');
  await tenant.request('auth/login','POST',{email:'tenant@test.example',password:'Updated-password-456'});passed('Reset password can be used to sign in');
  await tenant.request('profile/password','POST',{currentPassword:'Updated-password-456',password:'Final-password-789'});passed('Authenticated password changes succeed');
  const oldCookie=tenant.cookie();await tenant.request('auth/logout','POST',{});
  assert.equal((await guest.request('auth/me','GET',undefined,200,{Cookie:oldCookie})).data,null);passed('Logout revokes token in database, including replay');
  await host.request('properties/'+id,'DELETE');
  await guest.request('properties/'+id,'GET',undefined,404);assert.equal((await outsider.request('visits')).data[0].status,'cancelled');passed('Archiving cancels active visits and hides property');
  await db.close();global.staynestDatabase=undefined;db=await getDb();
  const [persisted]=await db.query('SELECT name FROM users WHERE id=$1',[t.data.id]);assert.equal(persisted.name,'Updated Tenant');passed('Data survives closing and reopening the local database');
  for(let i=0;i<12;i++)await guest.request('auth/login','POST',{email:'missing@test.example',password:'incorrect-password'},401);
  await guest.request('auth/login','POST',{email:'missing@test.example',password:'incorrect-password'},429);passed('Repeated login failures are rate-limited in the database');
  console.log(`\n${checks} integration checks passed.`);
 }finally{await db.close();global.staynestDatabase=undefined;await rm(folder,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
