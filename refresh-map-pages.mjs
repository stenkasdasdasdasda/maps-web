// This file is published to GitHub: public metadata and public URLs only.
import {readFile,writeFile,mkdir,readdir,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.MAPS_PAGES_ROOT||'.'),origin='https://maps.furry.by';
const template=await readFile(path.join(root,'site-template.html'),'utf8');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=new Map([['/',{title:'Карта Фурри Знакомств',description:'Фурри знакомства, сообщества и встречи на карте.'}],['/city/',{title:'Города — Карта Фурри Знакомств',description:'Найди фурри в своём городе.'}]]);
let offset=0;
for(let batch=0;batch<5001;batch++){
 let data;
 for(const host of ['https://maps-origin.furry.by','https://cf-maps.furry.by']){
  try{const response=await fetch(host+'/site-metadata?offset='+offset,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();data=await response.json();break;}catch{}
 }
 if(!data||!Array.isArray(data.pages)||data.pages.length>200)throw Error('Public map metadata unavailable; previous Pages build retained.');
 for(const item of [...(data.cities||[]),...data.pages]){
  if(!/^\/(?:profiles|city)\/[A-Za-z0-9_.%~-]{1,180}$/.test(item.path)||typeof item.title!=='string'||typeof item.description!=='string')throw Error('Unexpected public metadata');
  pages.set(item.path,{title:item.title.slice(0,240),description:item.description.slice(0,240)});
 }
 if(data.next===null)break;
 if(data.next!==offset+200)throw Error('Invalid metadata pagination');offset=data.next;
 if(batch===5000)throw Error('Metadata pagination limit');
}
for(const section of ['profiles','city']){
 for(const entry of await readdir(path.join(root,section),{withFileTypes:true}).catch(()=>[])){
  if(!entry.isDirectory()||!/^[A-Za-z0-9_.%~-]{1,180}$/.test(entry.name)||pages.has('/'+section+'/'+entry.name))continue;
  const directory=path.resolve(root,section,entry.name);
  if(!directory.startsWith(path.resolve(root,section)+path.sep))throw Error('Invalid obsolete page path');
  await unlink(path.join(directory,'index.html')).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory).catch(error=>{if(error.code!=='ENOTEMPTY')throw error;});
 }
}
for(const [route,item] of pages){
 const canonical=origin+route,html=template.replace(/<title>[\s\S]*?<\/title>/,'<title>'+escape(item.title)+'</title>').replace(/<meta name="description"[^>]*>/,'<meta name="description" content="'+escape(item.description)+'">').replace(/<link rel="canonical"[^>]*>/,'<link rel="canonical" href="'+escape(canonical)+'">');
 const file=route==='/'?path.join(root,'index.html'):path.join(root,route.slice(1),'index.html');
 await mkdir(path.dirname(file),{recursive:true});await writeFile(file,html);
}
const xml=value=>'<?xml version="1.0" encoding="UTF-8"?>'+value;
const profiles=[...pages.keys()].filter(p=>p.startsWith('/profiles/')),parts=['sitemap-pages.xml'];
const urlset=urls=>xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(p=>'<url><loc>'+escape(origin+p)+'</loc></url>').join('')+'</urlset>');
await writeFile(path.join(root,parts[0]),urlset([...pages.keys()].filter(p=>!p.startsWith('/profiles/'))));
for(let i=0;i<profiles.length;i+=1000){const file='sitemap-profiles-'+(i/1000+1)+'.xml';parts.push(file);await writeFile(path.join(root,file),urlset(profiles.slice(i,i+1000)));}
await writeFile(path.join(root,'sitemap.xml'),xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+parts.map(p=>'<sitemap><loc>'+origin+'/'+p+'</loc></sitemap>').join('')+'</sitemapindex>'));
await writeFile(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /internal/\nDisallow: /?\nSitemap: '+origin+'/sitemap.xml\n');
console.log('Public map SEO pages ready: '+pages.size+'. No coordinates or profile descriptions exported.');
