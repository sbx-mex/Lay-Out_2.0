"use strict";
const DATA_URL="data/layouts.json";
const $=id=>document.getElementById(id);
let catalog=null,activeStationId=null,activeCode=null,activeSubgroup="all",deferredInstall=null,evidenceDataUrl=null;
const memoryKey="layout20-state-v1";

function station(){return catalog?.stations.find(x=>x.id===activeStationId)||catalog?.stations[0]}
function variants(){
  const s=station(); if(!s) return [];
  let items=s.variants;
  if(activeSubgroup!=="all") items=items.filter(v=>v.subgroup===activeSubgroup);
  const q=$("searchInput").value.trim().toLowerCase();
  if(q) items=items.filter(v=>`${v.code} ${v.subgroup}`.toLowerCase().includes(q));
  return items;
}
function activeVariant(){const s=station();return s?.variants.find(v=>v.code===activeCode)||variants()[0]||s?.variants[0]}
function saveState(){localStorage.setItem(memoryKey,JSON.stringify({station:activeStationId,code:activeCode,store:$("storeName").value}))}
function loadState(){try{return JSON.parse(localStorage.getItem(memoryKey)||"{}") }catch{return {}}}

async function loadCatalog(){
  const res=await fetch(DATA_URL,{cache:"no-store"}); if(!res.ok) throw new Error("No se pudo cargar el catálogo");
  catalog=await res.json();
  const saved=loadState(); activeStationId=catalog.stations.some(s=>s.id===saved.station)?saved.station:catalog.stations[0].id;
  $("storeName").value=saved.store||"";
  const s=station(); activeCode=s.variants.some(v=>v.code===saved.code)?saved.code:s.variants[0].code;
  $("catalogSummary").textContent=`${catalog.stations.length} estaciones · ${catalog.stations.reduce((n,s)=>n+s.variants.length,0)} configuraciones`;
  renderAll();
}
function renderAll(){renderStationNav();renderStation();renderComparison();saveState()}
function renderStationNav(){
  const nav=$("stationNav"); nav.innerHTML="";
  catalog.stations.forEach(s=>{
    const b=document.createElement("button");b.type="button";b.className="station-tab";b.setAttribute("role","tab");b.setAttribute("aria-selected",String(s.id===activeStationId));
    b.innerHTML=`<span aria-hidden="true">${s.icon}</span><strong>${s.label}</strong><small>${s.variants.length} opciones</small>`;
    b.addEventListener("click",()=>selectStation(s.id));nav.appendChild(b);
  });
}
function selectStation(id){
  activeStationId=id; activeSubgroup="all"; const s=station(); activeCode=s.variants[0].code; $("searchInput").value=""; renderAll();
  document.querySelector(".workspace").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderStation(){
  const s=station();$("stationShort").textContent=s.short;$("stationLabel").textContent=s.label;$("stationDescription").textContent=s.description;$("stationTranslation").textContent=s.translation;
  $("stationTips").innerHTML=s.tips.map(t=>`<li>${t}</li>`).join("");
  const groups=[...new Set(s.variants.map(v=>v.subgroup))]; const bar=$("subgroupBar");bar.innerHTML="";
  if(groups.length>1){bar.classList.remove("hidden");[{id:"all",label:"Todas"},...groups.map(g=>({id:g,label:g}))].forEach(g=>{const b=document.createElement("button");b.type="button";b.className=`subgroup-chip${activeSubgroup===g.id?" active":""}`;b.textContent=g.label;b.addEventListener("click",()=>{activeSubgroup=g.id;const list=variants();if(list.length&&!list.some(v=>v.code===activeCode))activeCode=list[0].code;renderStation();renderComparison();saveState()});bar.appendChild(b)})}else bar.classList.add("hidden");
  renderTechnical(s);renderVariants();renderActive();
}
function renderVariants(){
  const rail=$("variantRail");rail.innerHTML="";const list=variants();
  if(!list.length){rail.innerHTML='<p class="metric">No hay coincidencias. Prueba otro código.</p>';return}
  if(!list.some(v=>v.code===activeCode))activeCode=list[0].code;
  list.forEach(v=>{const b=document.createElement("button");b.type="button";b.className="variant-card";b.setAttribute("role","option");b.setAttribute("aria-selected",String(v.code===activeCode));b.innerHTML=`<img src="${v.thumb}" alt="" loading="lazy"><strong>${v.code}</strong><small>${v.subgroup}</small>`;b.addEventListener("click",()=>{activeCode=v.code;renderActive();renderVariants();renderComparison();saveState()});rail.appendChild(b)});
}
function renderActive(){
  const v=activeVariant();if(!v)return;activeCode=v.code;$("activeCode").textContent=v.code;$("referenceImage").src=v.image;$("referenceImage").alt=`Referencia ${v.code} de ${station().label}`;$("sourceCaption").textContent=`Código original ${v.code} · Imagen optimizada desde ${v.source}`;
}
function shiftVariant(delta){const list=variants();if(!list.length)return;let idx=list.findIndex(v=>v.code===activeCode);idx=(idx+delta+list.length)%list.length;activeCode=list[idx].code;renderActive();renderVariants();renderComparison();saveState()}
function renderTechnical(s){
  const box=$("technicalButtons");box.innerHTML="";let items=s.technical||[];
  if(s.id==="coldbar"&&activeSubgroup!=="all") items=items.filter(x=>activeSubgroup.startsWith("CBS")?x.key.includes("cbs"):x.key.includes("cbe"));
  items.forEach(item=>{const b=document.createElement("button");b.type="button";b.className="technical-button";b.textContent=item.label;b.addEventListener("click",()=>openTechnical(item));box.appendChild(b)});
}
function openTechnical(item){$("technicalTitle").textContent=item.label;$("technicalImage").src=item.image;$("technicalDialog").showModal()}
function renderComparison(){const v=activeVariant();if(!v)return;$("compareCode").textContent=v.code;$("compareReference").src=v.image}

async function processEvidence(file){
  if(!file)return;const data=await file.arrayBuffer();const blob=new Blob([data],{type:file.type});const url=URL.createObjectURL(blob);const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
  const max=1800,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);evidenceDataUrl=canvas.toDataURL("image/jpeg",.88);URL.revokeObjectURL(url);
  $("evidenceImage").src=evidenceDataUrl;$("evidenceImage").classList.remove("hidden");$("dropZone").classList.add("hidden");$("removeEvidence").classList.remove("hidden");
}
function clearEvidence(){evidenceDataUrl=null;$("evidenceImage").src="";$("evidenceImage").classList.add("hidden");$("dropZone").classList.remove("hidden");$("removeEvidence").classList.add("hidden");$("evidenceInput").value=""}

async function imageToDataUrl(url){const r=await fetch(url);const blob=await r.blob();const objectUrl=URL.createObjectURL(blob);const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=objectUrl});const canvas=document.createElement("canvas");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(objectUrl);return canvas.toDataURL("image/jpeg",.93)}
function containBox(imgProps,x,y,w,h){const scale=Math.min(w/imgProps.width,h/imgProps.height);const dw=imgProps.width*scale,dh=imgProps.height*scale;return{x:x+(w-dw)/2,y:y+(h-dh)/2,w:dw,h:dh}}
async function exportPdf(){
  const v=activeVariant();if(!v)return;const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});const W=297,H=210,m=12;
  pdf.setFillColor(0,98,65);pdf.rect(0,0,W,18,"F");pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(15);pdf.text("LAY OUT 2.0",m,12);
  pdf.setFontSize(8);pdf.setFont("helvetica","normal");pdf.text(`Tienda: ${$("storeName").value.trim()||"Sin definir"}`,W-92,8);pdf.text(new Date().toLocaleDateString("es-MX"),W-92,13);
  pdf.setTextColor(0,59,42);pdf.setFont("helvetica","bold");pdf.setFontSize(13);pdf.text(`${station().label} · ${v.code}`,m,28);
  pdf.setTextColor(85,95,91);pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.text("Referencia visual",m,34);
  const ref=await imageToDataUrl(v.image);const refProps=pdf.getImageProperties(ref);
  const gap=8,contentW=W-m*2,boxW=evidenceDataUrl?(contentW-gap)/2:contentW,boxY=40,boxH=112;const b1=containBox(refProps,m,boxY,boxW,boxH);pdf.addImage(ref,"JPEG",b1.x,b1.y,b1.w,b1.h,undefined,"FAST");pdf.setDrawColor(220,228,224);pdf.rect(m,boxY,boxW,boxH);
  if(evidenceDataUrl){pdf.setTextColor(85,95,91);pdf.text("Acomodo real",m+boxW+gap,34);const ep=pdf.getImageProperties(evidenceDataUrl),b2=containBox(ep,m+boxW+gap,boxY,boxW,boxH);pdf.addImage(evidenceDataUrl,"JPEG",b2.x,b2.y,b2.w,b2.h,undefined,"FAST");pdf.rect(m+boxW+gap,boxY,boxW,boxH)}
  const tips=station().tips.slice(0,3);pdf.setTextColor(0,59,42);pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.text("VALIDAR",m,162);pdf.setTextColor(35,48,43);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);tips.forEach((t,i)=>pdf.text(`• ${t}`,m,169+i*5,{maxWidth:128}));
  const notes=$("notes").value.trim();pdf.setTextColor(0,59,42);pdf.setFont("helvetica","bold");pdf.text("NOTAS",154,162);pdf.setTextColor(35,48,43);pdf.setFont("helvetica","normal");pdf.text(notes||"Sin notas.",154,169,{maxWidth:131});
  pdf.setTextColor(120,128,124);pdf.setFontSize(6.5);pdf.text("Margen seguro: 12 mm · Documento de una sola página A4 horizontal",m,H-5);
  if(pdf.internal.getNumberOfPages()!==1) throw new Error("La exportación excedió una página");pdf.save(`Layout_2.0_${v.code.replace(/\s+/g,"_")}.pdf`);
}

function bind(){
  $("prevButton").addEventListener("click",()=>shiftVariant(-1));$("nextButton").addEventListener("click",()=>shiftVariant(1));
  $("searchInput").addEventListener("input",()=>{renderVariants();const list=variants();if(list.length&&!list.some(v=>v.code===activeCode)){activeCode=list[0].code;renderActive();renderComparison()} });
  $("storeName").addEventListener("input",saveState);$("evidenceInput").addEventListener("change",e=>processEvidence(e.target.files[0]));$("removeEvidence").addEventListener("click",clearEvidence);$("exportButton").addEventListener("click",()=>exportPdf().catch(err=>alert(`No se pudo exportar: ${err.message}`)));
  $("resetButton").addEventListener("click",()=>{localStorage.removeItem(memoryKey);$("storeName").value="";$("searchInput").value="";activeStationId=catalog.stations[0].id;activeSubgroup="all";activeCode=catalog.stations[0].variants[0].code;clearEvidence();$("notes").value="";renderAll()});
  $("closeTechnical").addEventListener("click",()=>$("technicalDialog").close());$("technicalDialog").addEventListener("click",e=>{if(e.target===$("technicalDialog"))$("technicalDialog").close()});
  const dz=$("dropZone");["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragging")}));["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragging")}));dz.addEventListener("drop",e=>processEvidence(e.dataTransfer.files[0]));
  window.addEventListener("online",updateNetwork);window.addEventListener("offline",updateNetwork);window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installButton").classList.remove("hidden")});$("installButton").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installButton").classList.add("hidden")});
}
function updateNetwork(){$("networkStatus").textContent=navigator.onLine?"En línea":"Sin conexión"}
async function start(){bind();updateNetwork();try{await loadCatalog()}catch(err){document.querySelector(".app").innerHTML=`<section class="panel"><h1>No se pudo abrir Lay Out 2.0</h1><p>${err.message}</p></section>`}if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{})}
document.addEventListener("DOMContentLoaded",start);
