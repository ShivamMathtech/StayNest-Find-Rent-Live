import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { SCHEMA } from '../db/schema';
import { SEED_PROPERTIES } from '../db/seed';

export type Row = Record<string, any>;
export interface Database {
  query<T extends Row = Row>(sql:string, values?:unknown[]):Promise<T[]>;
  transaction<T>(fn:(db:Database)=>Promise<T>):Promise<T>;
  close():Promise<void>;
}
declare global { var staynestDatabase: Promise<Database> | undefined; }

function wrapLocal(engine:PGlite | any):Database {
  return {
    async query<T extends Row>(sql:string, values:unknown[] = []) { return (await engine.query(sql,values)).rows as T[]; },
    async transaction<T>(fn:(db:Database)=>Promise<T>) { return engine.transaction((tx:any)=>fn(wrapLocal(tx))); },
    async close() { if(engine.close) await engine.close(); }
  };
}
async function open():Promise<Database> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if(connectionString) {
    const pool = new Pool({connectionString,max:4,idleTimeoutMillis:20000,connectionTimeoutMillis:10000,query_timeout:15000,allowExitOnIdle:true});
    const db:Database = {
      async query<T extends Row>(sql:string,values:unknown[]=[]) { return (await pool.query(sql,values)).rows as T[]; },
      async transaction<T>(fn:(db:Database)=>Promise<T>) {
        const client=await pool.connect();
        const tx:Database={query:async <R extends Row>(sql:string,values:unknown[]=[]) => (await client.query(sql,values)).rows as R[],transaction:fn=>fn(tx),close:async()=>{}};
        try { await client.query('BEGIN'); const result=await fn(tx); await client.query('COMMIT'); return result; }
        catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      },
      close:async()=>{ await pool.end(); }
    };
    return db;
  }
  if(process.env.VERCEL) throw new Error('DATABASE_NOT_CONFIGURED');
  const dir=path.resolve(process.env.LOCAL_DATABASE_PATH || '.data/staynest');
  await mkdir(dir,{recursive:true});
  const engine=new PGlite(dir);
  await engine.waitReady;
  await engine.exec(SCHEMA);
  const db=wrapLocal(engine);
  if(process.env.LOCAL_DEMO !== 'false' && process.env.NODE_ENV !== 'production') await seedDatabase(db,true);
  return db;
}
export function getDb():Promise<Database> {
  if(!global.staynestDatabase) global.staynestDatabase=open().catch(e=>{global.staynestDatabase=undefined;throw e;});
  return global.staynestDatabase;
}
export async function migrate(db:Database) {
  // All statements run atomically; IF NOT EXISTS makes repeat setup safe.
  await db.transaction(async tx=>{for(const statement of SCHEMA.split(';').map(s=>s.trim()).filter(Boolean)) await tx.query(statement);});
}
export async function seedDatabase(db:Database, localDemo=false) {
  const id='demo-landlord';
  const exists=await db.query('SELECT id FROM users WHERE id=$1',[id]);
  if(!exists.length) {
    const hash=await bcrypt.hash(localDemo?'StayNest!2026':randomBytes(40).toString('hex'),12);
    await db.query("INSERT INTO users(id,name,email,password_hash,role,bio) VALUES($1,$2,$3,$4,'landlord',$5) ON CONFLICT DO NOTHING",[id,'Greenhomes Studio','host@staynest.demo',hash,'Demonstration host for the StayNest sample catalog. These are fictional listings.']);
  }
  if(localDemo) {
    for(const [id,name,email,role] of [['demo-tenant','Jamie Morgan','tenant@staynest.demo','tenant'],['demo-admin','StayNest Admin','admin@staynest.demo','admin']]) {
      const existing=await db.query('SELECT id FROM users WHERE id=$1',[id]);
      if(!existing.length) await db.query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[id,name,email,await bcrypt.hash('StayNest!2026',12),role]);
    }
  }
  for(const p of SEED_PROPERTIES) {
    await db.query(`INSERT INTO properties(id,owner_id,title,location,address,type,price,beds,baths,area,description,images,amenities,lat,lng,status,featured,demo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,'published',$16,true) ON CONFLICT(id) DO NOTHING`,
      [p.id,id,p.title,p.location,p.address,p.type,p.price,p.beds,p.baths,p.area,p.description,JSON.stringify(p.images.map(i=>'/images/'+i+'.jpg')),JSON.stringify(p.amenities),p.lat,p.lng,p.id==='eleven-green'||p.id==='the-courtyard']);
  }
}
export async function notify(db:Database,userId:string,title:string,body:string,href:string) {
  await db.query('INSERT INTO notifications(id,user_id,title,body,href) VALUES($1,$2,$3,$4,$5)',[randomUUID(),userId,title,body,href]);
}
