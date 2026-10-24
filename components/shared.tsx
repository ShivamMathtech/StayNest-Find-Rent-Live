'use client';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import { ArrowRight,Bath,BedDouble,Heart,Home,MapPin,Maximize2,ShieldCheck,Star,X,Loader2,Search } from 'lucide-react';
import type { Property,User } from '@/lib/types';
export async function api<T=any>(url:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api/'+url,{method,headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const result=await response.json().catch(()=>({error:'The server returned an unexpected response.'}));
 if(!response.ok)throw new Error(result.error||'Request failed.');return result.data;
}
export type AppContextValue={user:User|null;authLoading:boolean;reloadUser:()=>Promise<void>;toast:(text:string)=>void;config:{localDemo?:boolean;passwordReset?:boolean};version:number;refresh:()=>void};
export const AppContext=createContext<AppContextValue>(null!);
export const useApp=()=>useContext(AppContext);
export function useData<T>(url:string|null,version=0){
 const previousUrl=useRef(url);
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;if(previousUrl.current!==url){setData(null);previousUrl.current=url;}if(!url){setLoading(false);setData(null);return;}setLoading(true);setError('');api<T>(url).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[url,version,revision]);
 return {data,error,loading,setData,reload:()=>setRevision(v=>v+1)};
}
export function Money({amount,small=false}:{amount:number;small?:boolean}){return <span className={small?'money small':'money'}>KSh {Number(amount).toLocaleString('en-KE')}<small> / month</small></span>;}
export function Logo(){return <Link href="/" className="logo"><span className="logo-symbol"><Home size={23} fill="currentColor" strokeWidth={1.8}/></span>StayNest<span className="logo-dot">.</span></Link>;}
export function Avatar({name,size=''}:{name:string;size?:string}){return <span className={'avatar '+size}>{name.split(' ').map(v=>v[0]).slice(0,2).join('').toUpperCase()}</span>;}
export function Loader(){return <div className="loading" role="status"><Loader2 className="spin"/><span>Making room for you…</span></div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><strong>We couldn’t load this just yet.</strong><p>{message}</p>{retry&&<button className="btn secondary" onClick={retry}>Try again</button>}</div>;}
export function Empty({title,text,href,label}:{title:string;text:string;href?:string;label?:string}){return <div className="empty"><span className="empty-icon"><Home size={34}/></span><h2>{title}</h2><p>{text}</p>{href&&<Link className="btn" href={href}>{label||'Explore homes'}<ArrowRight size={16}/></Link>}</div>;}
export function AuthGate({children}:{children:React.ReactNode}){const{user,authLoading}=useApp();if(authLoading)return <Loader/>;if(!user)return <Empty title="Your home journey starts here" text="Sign in to save your favourites, arrange viewings and talk to landlords." href="/login" label="Sign in"/>;return <>{children}</>;}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=before;};},[]);
 return <dialog ref={ref} className={'modal '+(wide?'wide':'')} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X/></button></div>{children}</dialog>;
}
export function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function PageHeading({eyebrow,title,description,children}:{eyebrow?:string;title:string;description?:string;children?:React.ReactNode}){return <div className="page-heading"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;}
export function PropertyCard({p,onSave}:{p:Property;onSave:(p:Property)=>void}){return <article className="property-card"><div className="card-photo"><Link href={'/property/'+p.id}><img src={p.images[0]} alt={p.title} loading="lazy" onError={e=>{e.currentTarget.src='/images/apartment.jpg';}}/></Link><div className="card-badges">{p.featured&&<span className="tag white">Featured</span>}{p.owner_verified&&<span className="tag verified"><ShieldCheck size={12}/>Verified host</span>}</div><button className={'save-btn '+(p.saved?'saved':'')} aria-label={(p.saved?'Unsave ':'Save ')+p.title} onClick={()=>onSave(p)}><Heart size={18} fill={p.saved?'currentColor':'none'}/></button></div><div className="card-content"><div className="row-between"><span className="property-type">{p.type}{p.demo?' · Sample listing':''}</span>{Number(p.rating)>0?<span className="rating"><Star size={12} fill="currentColor"/>{Number(p.rating).toFixed(1)}</span>:<span className="subtle">New</span>}</div><h3><Link href={'/property/'+p.id}>{p.title}</Link></h3><p className="location"><MapPin size={13}/>{p.location}</p><div className="specs"><span><BedDouble size={15}/>{p.beds||'Studio'}{p.beds?' beds':''}</span><span><Bath size={15}/>{p.baths} baths</span><span><Maximize2 size={14}/>{p.area} m²</span></div><div className="card-bottom"><Money amount={p.price} small/><Link className="round-link" href={'/property/'+p.id} aria-label={'View '+p.title}><ArrowRight size={17}/></Link></div></div></article>;}
export function SearchBar({value,onChange,onSubmit,placeholder='Neighbourhood, city or property…'}:{value:string;onChange:(s:string)=>void;onSubmit:()=>void;placeholder?:string}){return <form className="search-bar" onSubmit={e=>{e.preventDefault();onSubmit();}}><MapPin size={20}/><label className="sr-only" htmlFor="home-search">Search location or property</label><input id="home-search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/><button type="submit" className="btn"><Search size={17}/><span>Find a home</span></button></form>;}
export const dateLabel=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Nairobi'});
export function dayOffset(days:number){const date=new Date(Date.now()+days*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
