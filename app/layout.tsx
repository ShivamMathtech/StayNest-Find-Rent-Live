import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
export const metadata:Metadata={title:'StayNest — Find your place. Feel at home.',description:'Explore homes, connect with landlords and book a viewing. Your next chapter begins with StayNest.',icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
