import { Suspense } from 'react';
import StayNest from '@/components/StayNest';
export default function Page(){return <Suspense fallback={<div className="boot">StayNest <span>Finding your next chapter…</span></div>}><StayNest/></Suspense>;}
