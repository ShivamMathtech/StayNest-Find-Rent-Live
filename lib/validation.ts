import { z } from 'zod';
import { AMENITIES, SLOTS, TYPES } from './types';
export const password = z.string().min(10,'Use at least 10 characters').max(72).refine(v=>new TextEncoder().encode(v).length<=72,'Password must be at most 72 UTF-8 bytes');
export const email = z.string().trim().email().max(254).transform(v=>v.toLowerCase());
export const registerSchema=z.object({name:z.string().trim().min(2).max(80),email,password,role:z.enum(['tenant','landlord']).default('tenant')}).strict();
export const imageUrl=z.string().max(1000).refine(v=>/^\/images\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(v) || (()=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}})(),'Use an HTTPS image URL');
export const propertySchema=z.object({
 title:z.string().trim().min(4).max(100),location:z.string().trim().min(3).max(100),address:z.string().trim().min(5).max(200),
 type:z.enum(TYPES as [string,...string[]]),price:z.number().int().min(1000).max(10000000),beds:z.number().int().min(0).max(20),baths:z.number().int().min(1).max(20),area:z.number().int().min(10).max(10000),
 description:z.string().trim().min(40).max(5000),images:z.array(imageUrl).min(1).max(8),amenities:z.array(z.enum(AMENITIES as [string,...string[]])).max(12),
 lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)
}).strict();
export function visitInstant(date:string,time:string) { return new Date(`${date}T${time}:00+03:00`); }
export function validVisitDate(date:string,time:string,now=Date.now()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!SLOTS.includes(time)) return false;
  const canonical=new Date(date+'T12:00:00Z');
  if(!Number.isFinite(canonical.getTime())||canonical.toISOString().slice(0,10)!==date) return false;
  const ms=visitInstant(date,time).getTime();
  return ms>now && ms<now+91*86400000;
}
export function canTransition(status:string,next:string,owner:boolean,elapsed:boolean) {
  if(next==='cancelled') return ['pending','confirmed'].includes(status);
  if(!owner) return false;
  if(status==='pending' && ['confirmed','declined'].includes(next)) return true;
  return status==='confirmed' && next==='completed' && elapsed;
}
