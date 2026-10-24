'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {ArrowRight,Bell,Building2,CalendarDays,CheckCircle2,ChevronDown,Heart,HelpCircle,Home,LogOut,MapPin,MessageCircle,Search,Settings,ShieldCheck,Sparkles,UserRound,X} from 'lucide-react';
import type {Notification,User} from '@/lib/types';
import {api,AppContext,AuthGate,Avatar,Empty,Logo,useData} from './shared';
import Explore from './Explore';
import PropertyDetail from './PropertyDetail';
import Auth from './Auth';
import {Help,Messages,Notifications,Profile,Visits} from './Account';
import {Admin,Host} from './Management';
const nav=[{href:'/',label:'Discover',icon:Home},{href:'/explore',label:'Find a home',icon:Search},{href:'/saved',label:'Saved homes',icon:Heart},{href:'/visits',label:'My visits',icon:CalendarDays},{href:'/messages',label:'Messages',icon:MessageCircle}];
export default function StayNest(){
 const pathname=usePathname(),router=useRouter();const[user,setUser]=useState<User|null>(null),[authLoading,setAuthLoading]=useState(true),[config,setConfig]=useState({}),[notice,setNotice]=useState(''),[version,setVersion]=useState(0),[menu,setMenu]=useState(false),[bootError,setBootError]=useState('');
 const reloadUser=useCallback(async()=>{const u=await api<User|null>('auth/me');setUser(u);setBootError('');},[]);
 useEffect(()=>{Promise.allSettled([reloadUser(),api('config').then(setConfig)]).then(r=>{if(r[0].status==='rejected')setBootError(r[0].reason.message);setAuthLoading(false);});},[reloadUser]);
 useEffect(()=>{setMenu(false);window.scrollTo(0,0);},[pathname]);
 useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);}},[notice]);
 const notifications=useData<Notification[]>(user?'notifications':null,version);
 useEffect(()=>{if(!user)return;const timer=setInterval(()=>{if(!document.hidden)notifications.reload();},30000);return()=>clearInterval(timer);},[user?.id]);
 const count=notifications.data?.filter(n=>!n.read_at).length||0;
 const segment=pathname.split('/').filter(Boolean),route=segment[0]||'home';
 const authPage=['login','register','forgot','reset'].includes(route);
 let page:React.ReactNode;
 switch(route){
  case 'home':page=<Explore home/>;break;
  case 'explore':page=<Explore/>;break;
  case 'saved':page=<AuthGate><Explore saved/></AuthGate>;break;
  case 'property':page=segment[1]?<PropertyDetail key={segment[1]} id={segment[1]}/>:<Empty title="Which home are you looking for?" text="Start with the homes in our collection." href="/explore"/>;break;
  case 'visits':page=<AuthGate><Visits/></AuthGate>;break;
  case 'messages':page=<AuthGate><Messages/></AuthGate>;break;
  case 'profile':page=<AuthGate><Profile/></AuthGate>;break;
  case 'notifications':page=<AuthGate><Notifications/></AuthGate>;break;
  case 'host':page=<AuthGate><Host/></AuthGate>;break;
  case 'admin':page=<AuthGate><Admin/></AuthGate>;break;
  case 'help':page=<Help/>;break;
  case 'login':case 'register':case 'forgot':case 'reset':page=<Auth key={route} mode={route}/>;break;
  default:page=<Empty title="This page has moved out." text="Let’s get you back to finding your place." href="/" label="Back to Discover"/>;
 }
 const context={user,authLoading,reloadUser,toast:setNotice,config,version,refresh:()=>setVersion(v=>v+1)};
 async function logout(){try{await api('auth/logout','POST',{});setUser(null);setMenu(false);setVersion(v=>v+1);router.push('/');setNotice('You’re signed out. See you soon.');}catch(e:any){setNotice(e.message);}}
 return <AppContext.Provider value={context}><a className="skip-link" href="#main-content">Skip to content</a><div className={'app-shell '+(authPage?'auth-shell':'')}><aside className="sidebar"><Logo/><div className="sidebar-caption">YOUR SPACE TO FIND HOME</div><nav aria-label="Main navigation">{nav.map(({href,label,icon:Icon})=><Link className={'nav-link '+(pathname===href?'active':'')} href={href} key={href}><Icon size={19}/><span>{label}</span>{pathname===href&&<span className="nav-marker"/>}</Link>)}{user&&['landlord','admin'].includes(user.role)&&<Link className={'nav-link '+(route==='host'?'active':'')} href="/host"><Building2 size={19}/>My listings</Link>}{user?.role==='admin'&&<Link className={'nav-link '+(route==='admin'?'active':'')} href="/admin"><ShieldCheck size={19}/>Admin console</Link>}</nav><div className="sidebar-callout"><span><Sparkles size={23}/></span><h3>A fresh start,<br/>a familiar feeling.</h3><p>Your next home might be<br/>just around the corner.</p><Link href="/explore">Find your place<ArrowRight size={15}/></Link></div><div className="sidebar-bottom"><Link className="nav-link" href="/help"><HelpCircle size={18}/>Help & support</Link>{user?<Link className="sidebar-user" href="/profile"><Avatar name={user.name}/><span><strong>{user.name}</strong><small>View your profile</small></span><ChevronDown size={15}/></Link>:<Link href="/login" className="btn secondary full">Welcome, sign in<ArrowRight size={16}/></Link>}<span className="sidebar-credit">© {new Date().getFullYear()} StayNest · Find. Rent. Live.</span></div></aside><div className="main-shell"><header className="topbar"><div className="mobile-logo"><Logo/></div><Link className="topbar-location" href="/explore"><span className="location-icon"><MapPin size={17}/></span><span><small>LET’S FIND YOUR PLACE</small><strong>Nairobi, Kenya<ChevronDown size={12}/></strong></span></Link><nav className="topbar-links"><Link href="/explore">Explore homes</Link><Link href={user&&['landlord','admin'].includes(user.role)?'/host':'/register?role=landlord'}>Become a host<ArrowRight size={12}/></Link></nav><div className="topbar-actions"><Link href={user?'/notifications':'/login'} className="icon-btn notification-button" aria-label={'Notifications'+(count?`, ${count} unread`:'')}><Bell size={19}/>{count>0&&<span/>}</Link><span className="topbar-divider"/>{user?<div className="user-menu-wrap"><button className="user-menu-button" onClick={()=>setMenu(!menu)} aria-expanded={menu}><Avatar name={user.name}/><ChevronDown size={14}/></button>{menu&&<div className="user-menu"><strong>{user.name}</strong><small>{user.email}</small><Link href="/profile"><UserRound size={16}/>My profile</Link><Link href="/visits"><CalendarDays size={16}/>My visits</Link><button onClick={logout}><LogOut size={16}/>Sign out</button></div>}</div>:<Link href="/login" className="btn top-signin">Sign in<ArrowRight size={15}/></Link>}</div></header><main id="main-content" className={'main-content '+(authPage?'auth-content':'')}>{bootError&&<div className="setup-banner" role="alert"><strong>Setup needs one more step.</strong><span>{bootError}</span><button onClick={()=>{reloadUser().then(()=>setAuthLoading(false)).catch(e=>setBootError(e.message));}}>Retry</button></div>}{page}</main><footer className="footer"><span><Home size={14}/>StayNest. A place for your next chapter.</span><div><Link href="/help">Help & privacy</Link><span>Made for feeling at home.</span></div></footer></div></div>{!authPage&&<nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(({href,label,icon:Icon})=><Link className={pathname===href?'active':''} href={href} key={href}><Icon size={20}/><span>{label==='Find a home'?'Search':label==='Saved homes'?'Saved':label==='My visits'?'Visits':label}</span></Link>)}<Link href="/profile" className={route==='profile'?'active':''}><UserRound size={20}/><span>Profile</span></Link></nav>}{notice&&<div className="toast" role="status"><CheckCircle2 size={19}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}</AppContext.Provider>;
}
