import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const {getDb,migrate,seedDatabase}=await import('../lib/db');
 const db=await getDb();
 try{
  const action=process.argv[2];
  if(action==='setup'){await migrate(db);console.log('Database schema is ready.');}
  else if(action==='seed'){await migrate(db);await seedDatabase(db,!process.env.DATABASE_URL&&!process.env.POSTGRES_URL&&!process.env.VERCEL);console.log('Sample catalog added. Remote sample hosts have no known password.');}
  else if(action==='admin'){
   const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.ADMIN_PASSWORD;
   if(!email||!password||password.length<12||Buffer.byteLength(password)>72)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12–72 bytes) in .env.local first.');
   const {randomUUID}=await import('node:crypto'),bcrypt=(await import('bcryptjs')).default;
   await migrate(db);
   await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin') ON CONFLICT(email) DO UPDATE SET role='admin',password_hash=excluded.password_hash",[randomUUID(),process.env.ADMIN_NAME||'StayNest Administrator',email,await bcrypt.hash(password,12)]);
   console.log('Administrator created/updated. Remove ADMIN_PASSWORD from .env.local after signing in.');
  }else throw new Error('Use setup, seed or admin.');
 }finally{await db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
