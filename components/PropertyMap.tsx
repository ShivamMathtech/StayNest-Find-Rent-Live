'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap} from 'leaflet';
import type {Property} from '@/lib/types';
export default function PropertyMap({properties}:{properties:Property[]}){
 const node=useRef<HTMLDivElement>(null),[error,setError]=useState(false);
 const locations=JSON.stringify(properties.map(p=>({id:p.id,title:p.title,lat:p.lat,lng:p.lng,price:p.price})));
 useEffect(()=>{
  let map:LeafletMap|undefined,disposed=false;setError(false);
  import('leaflet').then(L=>{
   if(disposed||!node.current)return;
   const places=JSON.parse(locations) as Property[];if(!places.length)return;
   map=L.map(node.current,{scrollWheelZoom:false}).setView([places[0].lat,places[0].lng],14);
   const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
   let errors=0;tiles.on('tileerror',()=>{if(++errors>=3&&!disposed)setError(true);});tiles.on('tileload',()=>{if(!disposed)setError(false);});
   places.forEach(p=>{
    const label=document.createElement('a');label.href='/property/'+encodeURIComponent(p.id);label.textContent=p.title+' · KSh '+Number(p.price).toLocaleString('en-KE')+'/month';
    const icon=L.divIcon({className:'map-price-pin',html:'<span>KSh '+Math.round(p.price/1000)+'k</span>',iconSize:[76,30],iconAnchor:[38,30]});
    L.marker([p.lat,p.lng],{icon,title:p.title}).addTo(map!).bindPopup(label);
   });
   if(places.length>1)map.fitBounds(L.latLngBounds(places.map(p=>[p.lat,p.lng] as [number,number])),{padding:[35,35],maxZoom:14});
  }).catch(()=>{if(!disposed)setError(true);});
  return()=>{disposed=true;map?.remove();};
 },[locations]);
 return <div className="property-map-wrap"><div className="property-map" ref={node} role="region" aria-label="Property location map"/>{error&&<div className="map-error">Map tiles are unavailable. <a target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${properties[0]?.lat}&mlon=${properties[0]?.lng}`}>Open map</a></div>}</div>;
}
