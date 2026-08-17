import { matchesSelectedStore, state } from './state.js';
import { $, $$, escapeHtml } from './utils.js';
import { toast } from './toast.js';
import { isContentSaved } from './experience.js';

const today = new Date();
const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let periodFilter = 'week';
let eventFilter = 'today';
let actionsBound = false;
let activePartnerRoute = 'courses';
const deferredRendered = new Set();

function setTextIfPresent(id, value){
  const element = document.getElementById(id);
  if(element) element.textContent = value;
}
function setHtmlIfPresent(id, value){
  const element = document.getElementById(id);
  if(element) element.innerHTML = value;
}

function parseDate(value){
  if(!value) return null;
  if(value instanceof Date) return value;
  const text = String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(),23,59,59); }
export function startOfWeek(d){ const s=startOfDay(d); const diff=(s.getDay()+6)%7; s.setDate(s.getDate()-diff); return s; }
export function endOfWeek(d){ const e=startOfWeek(d); e.setDate(e.getDate()+6); return endOfDay(e); }
function addDays(d, days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
function inRange(evt, start, end){
  const a=parseDate(evt['Fecha Inicio']);
  const b=parseDate(evt['Fecha Fin']) || a;
  if(!a && !b) return true;
  return (!b || b >= start) && (!a || a <= end);
}
function fmtDDMM(value){
  const d=parseDate(value); if(!d) return '';
  return d.toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit'});
}
function briefText(text='', max=82){
  const clean = String(text || '').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
  return clean.length > max ? clean.slice(0, max-1).trim() + '…' : clean;
}
export function getWeekNumber(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}
function nextWeeklyActivity(day){
  const list = state.operacional.actividadesSemanales || [];
  const nowIndex = today.getDay();
  for(let i=1;i<=7;i++){
    const idx=(nowIndex+i)%7;
    const name=dayNames[idx];
    const found=list.find(a => (a['Día']||'').toLowerCase() === name.toLowerCase());
    if(found) return found;
  }
  return null;
}
function isImageResource(item){ return item?.TipoRecurso === 'imagen' && item?.Recurso; }
function renderResourceAction(item){
  if(!item?.Recurso) return '';
  if(item.TipoRecurso === 'link' || String(item.Recurso).startsWith('http')) return `<a class="mini-link" href="${escapeHtml(item.Recurso)}" target="_blank" rel="noopener">${String(item.Recurso).includes('consulta.delivery') ? 'Abrir Consulta Delivery' : 'Abrir link'}</a>`;
  return `<button class="mini-link image-link" type="button" data-image-viewer="${escapeHtml(item.Recurso)}" data-image-title="${escapeHtml(item.Actividad)}">Ver imagen</button>`;
}
function opsCard(title, text, icon='✅', extra='', item=null){
  return `<article class="ops-card"><div class="ops-icon">${icon}</div><div class="ops-content"><h4>${escapeHtml(title || 'Actividad')}</h4><p>${escapeHtml(briefText(text))}</p>${extra ? `<div class="inline-actions">${extra}</div>` : ''}</div></article>`;
}
export function planningWindow(reference, leadDays=15){
  const planningDate = addDays(reference, leadDays);
  return {planningDate, weekStart:startOfWeek(planningDate), weekEnd:endOfWeek(planningDate), week:getWeekNumber(planningDate)};
}
function planningLeadDays(){
  const match = String(state.operacional.wfmRegla || '').match(/(\d+)\s*d[ií]as?/i);
  return Math.max(1, Number(match?.[1]) || 15);
}
function isCurrentlyValid(item){
  const now = new Date();
  const start = parseDate(item?.['Vigencia Inicio']);
  const end = parseDate(item?.['Vigencia Fin']);
  if(start) start.setHours(0,0,0,0);
  if(end) end.setHours(23,59,59,999);
  return (!start || now >= start) && (!end || now <= end);
}
function isVisualResource(value=''){
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(String(value).trim());
}
function safeExternalResource(value=''){
  const text = String(value || '').trim();
  if(!/^https?:\/\//i.test(text) || text.includes('...') || /[{}<>]/.test(text)) return '';
  try{
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) && url.hostname ? url.href : '';
  }catch{
    return '';
  }
}
function informativeVisual(item, eager = false){
  const optimized = String(item?.MiniaturaRecurso || item?.Recurso || '').trim();
  const original = String(item?.OriginalRecurso || item?.Recurso || '').trim();
  if(!isVisualResource(optimized) && !isVisualResource(original)) return '';
  const image = isVisualResource(original) ? original : optimized;
  const source = isVisualResource(optimized) ? optimized : image;
  const picture = `<picture>${/\.webp(?:[?#].*)?$/i.test(source) ? `<source type="image/webp" srcset="${escapeHtml(source)}">` : ''}<img src="${escapeHtml(image)}" alt="Vista previa de ${escapeHtml(item?.Actividad || 'informativo')}" width="1200" height="675" loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${eager ? 'high' : 'low'}" decoding="async"></picture>`;
  return {picture, image};
}
function validEventLink(value){
  const text = String(value || '').trim();
  if(!/^https?:\/\//i.test(text) || text.includes('...') || /[{}<>]/.test(text)) return '';
  try{
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) && url.hostname ? url.href : '';
  }catch{
    return '';
  }
}
function validEventImage(value){
  const text = String(value || '').trim();
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(text) ? text : '';
}
function eventDestination(item){
  const action = String(item?.TipoAccion || 'Informativo').trim().toLocaleLowerCase('es');
  const link = validEventLink(item?.Link);
  const image = validEventImage(item?.ImagenOriginal || item?.ImagenPath || item?.MiniaturaPath);
  if(action === 'enlace' && link) return {kind:'link', link, image:''};
  if(action === 'imagen' && image) return {kind:'image', link:'', image};
  return {kind:'informative', link:'', image};
}
function eventCard(e){
  const title = e.Actividad || 'Evento';
  const dateLine = `${fmtDDMM(e['Fecha Inicio'])}${e['Fecha Fin'] ? ' al ' + fmtDDMM(e['Fecha Fin']) : ''}`;
  const priority = /referente operativo|unicorn/i.test(title);
  const media = e.MiniaturaPath || e.ImagenPath || '';
  const destination = eventDestination(e);
  const actionLabel = destination.kind === 'link' ? 'Abrir acceso →' : destination.kind === 'image' ? 'Ver imagen →' : 'Informativo';
  const content = `${media ? `<img class="event-card-media" src="${escapeHtml(media)}" alt="" loading="lazy"/>` : ''}
      <span class="event-card-top"><span class="event-date">${escapeHtml(dateLine)}</span><span class="event-type">${priority ? 'Prioridad' : 'Evento'}</span></span>
      <h4>${escapeHtml(title)}</h4>
      <span class="event-open">${actionLabel}</span>`;
  return `<article class="ops-card event-card ${priority ? 'is-priority' : ''}">
    ${destination.kind === 'informative'
      ? `<div class="event-card-main is-static" aria-label="${escapeHtml(title)}">${content}</div>`
      : `<button class="event-card-main" type="button" data-open-event-id="${escapeHtml(e.ID)}" aria-label="${escapeHtml(actionLabel.replace(' →',''))}: ${escapeHtml(title)}">${content}</button>`}
  </article>`;
}
function eventGroups(events){
  return events.map(eventCard).join('');
}
function celebrationEvents(start, end){
  const output = [];
  for(const partner of state.operacional.celebraciones || []){
    const source = parseDate(partner.Fecha);
    if(!source || partner.Publicar === false || !matchesSelectedStore(partner.TIENDA)) continue;
    for(let year=start.getFullYear(); year<=end.getFullYear(); year++){
      const occurrence = new Date(year, source.getMonth(), source.getDate());
      if(occurrence < start || occurrence > end) continue;
      if(partner.Tipo === 'Aniversario' && year - source.getFullYear() < 1) continue;
      output.push({...partner, occurrence});
    }
  }
  return output;
}
function celebrationCard(item){
  const isAnniversary = item.Tipo === 'Aniversario';
  const icon = isAnniversary ? '🏅' : '🎂';
  const date = item.occurrence.toLocaleDateString('es-MX', { weekday:'short', day:'2-digit', month:'long' });
  const occurrence = `${item.occurrence.getFullYear()}-${String(item.occurrence.getMonth()+1).padStart(2,'0')}-${String(item.occurrence.getDate()).padStart(2,'0')}`;
  const source = parseDate(item.Fecha);
  const years = isAnniversary && source ? Math.max(1, item.occurrence.getFullYear() - source.getFullYear()) : 0;
  const celebrationLabel = isAnniversary ? `${years} año${years === 1 ? '' : 's'} de trayectoria` : 'Cumpleaños';
  const person = item.NOMBRE || 'Partner';
  return `<button class="ops-card celebration-card ${isAnniversary ? 'is-anniversary' : 'is-birthday'}" type="button" data-celebration-id="${escapeHtml(item.ID || '')}" data-celebration-date="${occurrence}" aria-label="Crear felicitación PDF para ${escapeHtml(person)}"><div class="ops-icon" aria-hidden="true">${icon}</div><div class="ops-content"><span class="event-date">${escapeHtml(date)}</span><h4>${escapeHtml(person)}</h4><p>${escapeHtml(item.TIENDA || '')}${item.PUESTO ? ` · ${escapeHtml(item.PUESTO)}` : ''}</p><strong>${escapeHtml(celebrationLabel)}</strong><span class="celebration-cta"><span>Crear felicitación</span><b>PDF ↓</b></span></div></button>`;
}
export function periodBounds(reference=today, mode=periodFilter){
  if(mode === 'month') return {start:new Date(reference.getFullYear(), reference.getMonth(), 1), end:endOfDay(new Date(reference.getFullYear(), reference.getMonth()+1, 0))};
  return {start:startOfWeek(reference), end:endOfWeek(reference)};
}
function personRow(p, tipo){
  const nombre = p.Partner || p['NOMBRE COMPLETO'] || p.NOMBRE || 'Partner';
  const tienda = p.Tienda || p.TIENDA || '';
  const estatus = p.Estatus || p['ESTATUS ALTA'] || p.BT || '';
  return `<div class="person-row"><strong>${escapeHtml(nombre)}</strong><span>${escapeHtml(tienda)}</span><em>${escapeHtml(tipo)} · ${escapeHtml(String(estatus))}</em></div>`;
}
function tbwRow(p){
  const nombre = p.Partner || p.NOMBRE || 'Partner';
  const tienda = p.Tienda || p.TIENDA || '';
  const avance = String(p.AvanceResumen || p.Avance || '0%');
  const pct = parseInt(avance,10) || 0;
  return `<div class="tbw-row"><div><strong>${escapeHtml(nombre)}</strong><span>${escapeHtml(tienda)}</span></div><div class="progress" aria-label="Avance ${escapeHtml(avance)}"><i style="width:${Math.min(100,Math.max(0,pct))}%"></i></div><em>${escapeHtml(avance)}</em></div>`;
}

export function renderOperationalSections(){
  renderUnicornCampaign();
  renderInformativo();
  renderAltas();
  renderToday();
  renderEvents();
  deferOperationalSections();
  bindOperationalActions();
}
export function unicornCampaignPhase(reference = new Date(), source = null){
  const current = startOfDay(reference);
  const start = parseDate(source?.['Fecha Inicio']);
  const finishDate = parseDate(source?.['Fecha Fin']);
  if(!start || !finishDate) return null;
  const finish = endOfDay(finishDate);
  if(current < startOfDay(start) || current > finish) return null;
  const range = start.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
  const rangeEnd = finishDate.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
  return {
    tone:'live',
    eyebrow:`${range}–${rangeEnd} · Evento activo`,
    title:String(source?.Actividad || 'Campaña operativa'),
    message:String(source?.['Contexto / Recordatorio'] || 'Consulta la guía vigente y alinea al equipo.'),
    action:'Abrir guía →'
  };
}
export function renderUnicornCampaign(reference = today){
  const host = document.getElementById('unicorn-campaign');
  if(!host) return;
  const source = (state.operacional.eventos || []).find((event) =>
    event.TipoAccion === 'Enlace' && /unicorn/i.test(String(event.Actividad || ''))
  );
  const phase = unicornCampaignPhase(reference, source);
  const link = validEventLink(source?.Link);
  if(!phase || !link){ host.hidden=true; host.replaceChildren(); return; }
  host.hidden=false;
  host.dataset.tone=phase.tone;
  host.innerHTML=`<div class="unicorn-campaign__mark" aria-hidden="true">✦</div>
    <div class="unicorn-campaign__copy"><span>${escapeHtml(phase.eyebrow)}</span><strong>${escapeHtml(phase.title)}</strong><p>${escapeHtml(phase.message)}</p></div>
    <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(phase.action)}</a>`;
}
export function renderToday(){
  const day = dayNames[today.getDay()];
  const daily = (state.operacional.actividadesDiarias || [])
    .filter(a => a.Visible !== false)
    .sort((a,b)=>(a.Prioridad||9)-(b.Prioridad||9));
  const weekly = (state.operacional.actividadesSemanales || []).filter(a => (a['Día'] || '').toLowerCase() === day.toLowerCase());
  const todayLong = today.toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  setTextIfPresent('today-date', 'Rutina diaria, WFM y Duty Roster en una vista ejecutiva.');
  const mainDaily = daily[0];
  const mainWeekly = weekly[0];
  const dutyItem = (state.operacional.dutyRoster || []).find(d => (d['Día'] || '').toLowerCase() === day.toLowerCase());
  const dutyDetails = (state.operacional.dutyDetail || []).filter(d => dutyItem && (d['Día'] || '').toLowerCase() === (dutyItem['Día'] || '').toLowerCase());
  const dutyCritical = dutyDetails.filter(d => d['Crítico'] === true || String(d['Crítico']).toLowerCase() === 'true');
  setTextIfPresent('today-focus-date', 'Prioridades activas');
  setTextIfPresent('today-focus-message', 'Revisa actividades críticas y accesos clave.');
  setTextIfPresent('today-main-activity', mainWeekly?.Actividad || mainDaily?.Actividad || 'Revisión operativa');
  setTextIfPresent('today-main-action', briefText(mainWeekly?.['Descripción'] || mainDaily?.DescripcionBreve || mainDaily?.['Descripción'] || 'Revisa tus prioridades, actividades críticas y accesos clave del día.', 92));
  setTextIfPresent('today-duty-summary', dutyItem ? `${dutyItem['Día']}: ${dutyItem.Estaciones}` : 'Duty Roster');
  setTextIfPresent('today-critical-summary', dutyCritical.length ? `${dutyCritical.length} punto${dutyCritical.length === 1 ? '' : 's'} crítico${dutyCritical.length === 1 ? '' : 's'} por validar` : 'Sin críticos marcados para hoy');
  renderWFM(day, weekly[0]);
  setHtmlIfPresent('daily-grid', daily.map(a => opsCard(a.Actividad, a.DescripcionBreve || a['Descripción'], a.Icono || '✅', renderResourceAction(a), a)).join(''));
  setHtmlIfPresent('weekly-grid', weekly.length ? weekly.map(a => opsCard(a.Actividad, `${a['Descripción'] || ''}${a['Hora / Corte'] ? ' · ' + a['Hora / Corte'] : ''}`, a.Icono || '📌', a.Link ? `<a class="mini-link" href="${escapeHtml(a.Link)}" target="_blank" rel="noopener">Abrir link</a>` : '')).join('') : opsCard('Sin actividad semanal específica', 'Mantén foco en apertura, calidad y seguimiento.', '☕'));
}
function renderWFM(day, todayActivity){
  const leadDays = planningLeadDays();
  const {planningDate, weekStart, weekEnd, week} = planningWindow(today, leadDays);
  const next = nextWeeklyActivity(day);
  const todayLabel = today.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const planningLabel = `${weekStart.toLocaleDateString('es-MX',{day:'numeric',month:'long'})} al ${weekEnd.toLocaleDateString('es-MX',{day:'numeric',month:'long'})}`;
  const actionTitle = `${todayActivity?.Icono || '✅'} ${escapeHtml(todayActivity?.Actividad || 'Revisión operativa')}`;
  const actionText = briefText(todayActivity?.['Descripción'] || 'Revisa prioridades del día y anticipa necesidades de la semana en planeación.', 150);
  setHtmlIfPresent('wfm-card', `
    <div class="wfm-head"><div><span>📅 WFM</span><strong>Planeación Inteligente</strong></div><b class="wfm-lead">${leadDays} días de anticipación</b></div>
    <div class="wfm-timeline" aria-label="Planeación WFM">
      <div class="wfm-step is-now"><small>Hoy · Semana ${getWeekNumber(today)}</small><b>${escapeHtml(todayLabel)}</b></div>
      <div class="wfm-connector">+${leadDays} días</div>
      <div class="wfm-step is-plan"><small>Semana en planeación</small><b>Semana ${week}</b><em>${planningLabel}</em></div>
    </div>
    <div class="wfm-action"><small>Actividad de hoy</small><strong>${actionTitle}</strong><p>${escapeHtml(actionText)}</p></div>
    ${next ? `<div class="wfm-next"><small>Próxima actividad</small><span>${next.Icono || '⏭️'} ${escapeHtml(next.Actividad)}</span></div>` : ''}
    <p class="wfm-auto">💡 Se actualiza automáticamente con la fecha actual y la pestaña WFM del CMS.</p>`);
}

export function renderInformativo(){
  const info = (state.operacional.informativo || [])
    .filter(a => a.Visible !== false)
    .filter(isCurrentlyValid)
    .sort((a,b)=>(a.Orden||a.Prioridad||99)-(b.Orden||b.Prioridad||99));
  const count = document.getElementById('info-count');
  if(count) count.textContent = `${info.length} vigente${info.length === 1 ? '' : 's'}`;
  const grid = document.getElementById('info-grid');
  if(!grid) return;
  grid.classList.toggle('is-empty', !info.length);
  grid.hidden = !info.length;
  if(!info.length){
    grid.innerHTML = '';
    return;
  }
  const cards = info.map((item, index) => {
    const contentId = `info-${item.ID}`;
    const resource = String(item.Recurso || '').trim();
    const visual = informativeVisual(item, index === 0);
    const externalLink = item.TipoRecurso === 'link' ? safeExternalResource(resource) : '';
    const destination = Boolean(visual || externalLink);
    const saved = isContentSaved(contentId);
    const visualMarkup = visual
      ? `<button class="permanent-info-media" type="button" data-open-content="${escapeHtml(contentId)}" aria-label="Ver ${escapeHtml(item.Actividad || 'informativo')}">${visual.picture}<span>Ver imagen completa</span></button>`
      : `<span class="permanent-info-icon" aria-hidden="true">${item.Icono || 'ℹ️'}</span>`;
    return `<article class="permanent-info-card ${visual ? 'has-visual' : 'is-text-only'}">
      ${visualMarkup}
      <div class="permanent-info-copy">
        <strong>${escapeHtml(item.Actividad || 'Informativo')}</strong>
        <p>${escapeHtml(briefText(item.DescripcionBreve || item['Descripción'] || '', 120))}</p>
        <div class="permanent-info-actions">
          ${destination ? `<button type="button" data-open-content="${escapeHtml(contentId)}">${visual ? 'Ver imagen' : 'Abrir acceso'}</button>` : ''}
          ${destination ? `<button class="permanent-info-save ${saved ? 'is-saved' : ''}" type="button" data-save-content="${escapeHtml(contentId)}" aria-label="${escapeHtml(saved ? `Quitar ${item.Actividad} de Guardados` : `Guardar ${item.Actividad}`)}" aria-pressed="${saved}"><span aria-hidden="true">${saved ? '♥' : '♡'}</span><span class="save-content-label">${saved ? 'Guardado' : 'Guardar'}</span></button>` : '<span class="catalog-info-state">Informativo</span>'}
        </div>
      </div>
    </article>`;
  }).join('');
  grid.innerHTML = `<div class="informative-catalog">
    ${info.length > 1 ? `<div class="home-catalog-toolbar">
      <span id="informative-catalog-status" aria-live="polite">1 de ${info.length}</span>
      <div class="home-catalog-controls" aria-label="Controles de Informativo">
        <button type="button" data-catalog-scroll="prev" data-catalog-kind="informative" aria-label="Informativo anterior">‹</button>
        <button type="button" data-catalog-scroll="next" data-catalog-kind="informative" aria-label="Informativo siguiente">›</button>
      </div>
    </div>` : ''}
    <div id="informative-catalog-track" class="home-catalog-track informative-catalog-track" ${info.length > 1 ? 'tabindex="0"' : ''} aria-label="Informativos vigentes">${cards}</div>
  </div>`;
}
export function renderEvents(){
  const all = (state.operacional.eventos || []).filter(item => matchesSelectedStore(item.Tienda));
  const now = startOfDay(today);
  const bounds = eventFilter === 'today'
    ? {start:now, end:endOfDay(today)}
    : eventFilter === 'month' ? periodBounds(today, 'month') : periodBounds(today, 'week');
  const {start, end} = bounds;
  const filtered = all.filter(e => e.Publicar !== false && inRange(e,start,end))
    .filter(e => eventFilter !== 'upcoming' || (parseDate(e['Fecha Fin']) || parseDate(e['Fecha Inicio']) || now) >= now)
    .sort((a,b)=>(parseDate(a['Fecha Inicio'])||0)-(parseDate(b['Fecha Inicio'])||0));
  const upcoming = eventFilter === 'upcoming'
    ? all.filter(e => e.Publicar !== false && (parseDate(e['Fecha Fin']) || parseDate(e['Fecha Inicio']) || now) >= now)
        .sort((a,b)=>(parseDate(a['Fecha Inicio'])||0)-(parseDate(b['Fecha Inicio'])||0))
    : filtered;
  const ranked = [...upcoming].sort((a,b) => {
    const priority = item => /referente operativo/i.test(String(item.Actividad || '')) ? 0 : inRange(item, now, endOfDay(today)) ? 1 : 2;
    return priority(a) - priority(b) || (parseDate(a['Fecha Inicio'])||0) - (parseDate(b['Fecha Inicio'])||0);
  });
  const visible = ranked.slice(0,18);
  const label = eventFilter === 'today' ? 'vigentes hoy' : eventFilter === 'upcoming' ? 'próximos' : eventFilter === 'week' ? 'esta semana' : 'este mes';
  setTextIfPresent('events-count', `${upcoming.length} ${label}`);
  setHtmlIfPresent('events-grid', eventGroups(visible) || opsCard('Sin eventos vigentes', 'No hay eventos publicados para este periodo.', '📅'));
  const celebrationBounds = periodBounds();
  setTextIfPresent('period-label', `${celebrationBounds.start.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})} al ${celebrationBounds.end.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}`);
  renderCelebrations();
}
export function renderCelebrations(){
  const {start, end} = periodBounds();
  const filtered = celebrationEvents(start, end).sort((a,b)=>a.occurrence-b.occurrence || String(a.NOMBRE).localeCompare(String(b.NOMBRE)));
  const label = periodFilter === 'week' ? 'esta semana' : 'este mes';
  setTextIfPresent('celebrations-count', `${filtered.length} ${label}`);
  setHtmlIfPresent('celebrations-grid', filtered.map(celebrationCard).join('') || opsCard('Sin aniversarios o cumpleaños', 'No hay celebraciones para el periodo seleccionado.', '🎂'));
}
function partnerGroups(records, route){
  const grouped = new Map();
  records.forEach(item => {
    const store = String(item.tienda || 'Tienda no indicada').replace(/\s+/g, ' ').trim();
    const partner = {id:item.id, nombre:String(item.nombre || '').replace(/\s+/g, ' ').trim()};
    if(route === 'tbw') partner.avance = item.avance;
    else partner.programa = item.programa;
    if(!grouped.has(store)) grouped.set(store, []);
    grouped.get(store).push(partner);
  });
  return [...grouped.entries()]
    .sort(([a],[b]) => a.localeCompare(b, 'es-MX'))
    .map(([tienda, partners]) => ({
      tienda,
      total:partners.length,
      partners:partners.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es-MX'))
    }));
}
function formattedCut(value){
  const parsed = parseDate(value);
  return parsed
    ? parsed.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}).replace('.', '')
    : String(value || '');
}
function partnerBoard(route, data, records){
  if(!records.length){
    const message = route === 'tbw'
      ? 'No hay Partners pendientes de TBW.'
      : 'No hay Partners activos registrados en Cursos de Alta.';
    return `<div class="partner-development-empty"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="21" r="9"/><path d="M15 55c0-13 7-21 17-21s17 8 17 21M11 10h42"/></svg><p>${message}</p></div>`;
  }
  const savedView = route === 'tbw' ? data.vistas?.tbw : data.vistas?.alta;
  const useSavedSummary = !state.selectedStore;
  const groups = useSavedSummary && Array.isArray(savedView?.grupos) && savedView.grupos.length
    ? savedView.grupos
    : partnerGroups(records, route);
  const storeCount = useSavedSummary ? (savedView?.tiendas ?? groups.length) : groups.length;
  const total = useSavedSummary ? (savedView?.total ?? records.length) : records.length;
  const isTbw = route === 'tbw';
  const title = isTbw ? 'Partners pendientes de TBW' : 'Partners en Cursos de Alta';
  const context = isTbw
    ? `Corte ${formattedCut(savedView?.corte || data.actualizado)}`
    : `Periodo ${savedView?.periodo || records.map(item => item.fecha).find(Boolean) || 'vigente'}`;
  const programs = savedView?.programas || {
    BT:records.filter(item => String(item.programa || '').includes('BT')).length,
    SS:records.filter(item => String(item.programa || '').includes('SS')).length
  };
  const progress = savedView?.progreso || {
    sinIniciar:records.filter(item => Number(item.avance || 0) === 0).length,
    enCurso:records.filter(item => Number(item.avance || 0) > 0).length
  };
  const secondaryStats = isTbw
    ? `<span>${progress.sinIniciar} sin iniciar</span>${progress.enCurso ? `<span>${progress.enCurso} en curso</span>` : ''}`
    : `<span>${programs.BT || 0} BT</span><span>${programs.SS || 0} SS</span>`;
  const cards = groups.map(group => {
    const partners = group.partners.map(item => {
      const marker = isTbw
        ? (Number(item.avance || 0) > 0 ? `<em>${escapeHtml(item.avance)}%</em>` : '')
        : `<em>${escapeHtml(item.programa || '')}</em>`;
      return `<li><span>${escapeHtml(item.nombre)}</span>${marker}</li>`;
    }).join('');
    return `<article class="partner-store-card">
      <header><span>${escapeHtml(group.tienda)}</span><b>${group.total}</b></header>
      <ul>${partners}</ul>
    </article>`;
  }).join('');
  return `<div class="partner-board" role="region" aria-label="${escapeHtml(title)}">
    <header class="partner-board-summary">
      <div><span class="partner-board-kicker">${escapeHtml(context)}</span><h4>${escapeHtml(title)}</h4></div>
      <strong><b>${total}</b><span>Partners</span></strong>
    </header>
    <div class="partner-board-stats"><span>${storeCount} tiendas</span>${secondaryStats}</div>
    <div class="partner-store-grid" role="list">${cards}</div>
  </div>`;
}
export function renderAltas(route = activePartnerRoute){
  activePartnerRoute = route === 'tbw' ? 'tbw' : 'courses';
  const data = state.partnerDevelopment || {cursosAlta:[],tbwPendientes:[]};
  const courses = Array.isArray(data.cursosAlta) ? data.cursosAlta : [];
  const tbw = Array.isArray(data.tbwPendientes) ? data.tbwPendientes : [];
  const scopedCourses = courses.filter(item => matchesSelectedStore(item.tienda));
  const scopedTbw = tbw.filter(item => matchesSelectedStore(item.tienda));
  const records = activePartnerRoute === 'tbw' ? scopedTbw : scopedCourses;
  setTextIfPresent('altas-count', `${scopedCourses.length + scopedTbw.length} registros`);
  setTextIfPresent('courses-route-count', `${scopedCourses.length} Partner${scopedCourses.length === 1 ? '' : 's'}`);
  setTextIfPresent('tbw-route-count', `${scopedTbw.length} pendiente${scopedTbw.length === 1 ? '' : 's'}`);
  document.querySelectorAll('[data-partner-route]').forEach(button => {
    const selected = button.dataset.partnerRoute === activePartnerRoute;
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('tabindex', selected ? '0' : '-1');
  });
  setHtmlIfPresent('partner-development-visual', partnerBoard(activePartnerRoute, data, records));
  setTextIfPresent('partner-development-detail', records.length
    ? `Información agrupada por tienda · Actualización ${formattedCut(data.actualizado) || 'desde CMS'}`
    : '');
  deferredRendered.add('altas-curso');
  document.getElementById('altas-curso')?.classList.remove('is-pending');
}
export function renderDuty(requestedDay=dayNames[today.getDay()]){
  const day = dayNames.find(item => item.toLowerCase() === String(requestedDay || '').toLowerCase()) || dayNames[today.getDay()];
  const roster = state.operacional.dutyRoster || [];
  const item = roster.find(d => (d['Día'] || '').toLowerCase() === day.toLowerCase()) || roster[0];
  const detail = (state.operacional.dutyDetail || []).filter(d => item && (d['Día'] || '').toLowerCase() === (item['Día'] || '').toLowerCase()).sort((a,b)=>(a.Orden||0)-(b.Orden||0));
  const critical = detail.filter(d => d['Crítico'] === true || String(d['Crítico']).toLowerCase() === 'true').length;
  setHtmlIfPresent('duty-focus', item ? `<div class="duty-focus-head"><span>Hoy</span><strong>${escapeHtml(item['Día'])}: ${escapeHtml(item.Estaciones)}</strong></div><p>${escapeHtml(item.Enfoque)}</p><div class="duty-premium-meta"><b>${detail.length} puntos</b><b>${critical} críticos</b></div>` : '<p>Sin Duty Roster cargado.</p>');
  setHtmlIfPresent('duty-gallery', item?.ImagenesPath?.length ? item.ImagenesPath.map((src,i)=>{
    const station = String(item.Estaciones || 'Estación').split(',')[i]?.trim() || `Estación ${i+1}`;
    return `<a class="duty-image premium-duty-link" href="${escapeHtml(src)}" data-image-viewer="${escapeHtml(src)}" data-image-title="${escapeHtml(item['Día'] + ' · ' + station)}" aria-label="Ver ${escapeHtml(item['Día'] + ' · ' + station)} en tamaño completo"><img src="${escapeHtml(src)}" alt="${escapeHtml(item['Día'] + ' · ' + station)}" loading="lazy"/><span>${escapeHtml(station)}</span></a>`;
  }).join('') : '');
  setHtmlIfPresent('duty-detail', detail.map(d => `<li class="${d['Crítico'] === true || String(d['Crítico']).toLowerCase() === 'true' ? 'is-critical' : ''}">${d.Icono || '•'} <span>${escapeHtml(d.Actividad)}</span>${d['Crítico'] === true || String(d['Crítico']).toLowerCase() === 'true' ? ' <strong>Crítico</strong>' : ''}</li>`).join(''));
  deferredRendered.add('duty-roster');
  document.getElementById('duty-roster')?.classList.remove('is-pending');
}
export function ensureOperationalSection(id){
  if(deferredRendered.has(id)) return;
  if(id === 'altas-curso') renderAltas();
  if(id === 'duty-roster') renderDuty();
}
function deferOperationalSections(){
  const targets = [...document.querySelectorAll('[data-deferred-section]')];
  if(!('IntersectionObserver' in window)){
    targets.forEach(target => ensureOperationalSection(target.dataset.deferredSection));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => {
      ensureOperationalSection(entry.target.dataset.deferredSection);
      observer.unobserve(entry.target);
    });
  }, {rootMargin:'320px 0px'});
  targets.forEach(target => observer.observe(target));
}
function bindOperationalActions(){
  if(actionsBound) return;
  actionsBound = true;
  window.addEventListener('dgx:show-duty-day', event => {
    const day = event.detail?.day || dayNames[today.getDay()];
    renderDuty(day);
    const target = document.getElementById('duty-roster');
    if(target){
      target.classList.remove('is-destination-highlight');
      requestAnimationFrame(() => target.classList.add('is-destination-highlight'));
      target.scrollIntoView({behavior:'smooth', block:'start'});
      window.setTimeout(() => target.classList.remove('is-destination-highlight'), 1800);
      toast(`Duty Roster de ${day}`);
    }
  });
  window.addEventListener('dgx:open-partner-route', event => {
    const route = event.detail?.route === 'tbw' ? 'tbw' : 'courses';
    renderAltas(route);
    const section = document.getElementById('altas-curso');
    const button = section?.querySelector(`[data-partner-route="${route}"]`);
    const visual = document.getElementById('partner-development-visual');
    if(!section || !button || !visual) return;
    section.classList.remove('is-destination-highlight');
    visual.classList.remove('is-route-highlight');
    requestAnimationFrame(() => {
      section.classList.add('is-destination-highlight');
      visual.classList.add('is-route-highlight');
      section.scrollIntoView({behavior:'smooth', block:'start'});
      window.setTimeout(() => button.focus({preventScroll:true}), 380);
    });
    window.setTimeout(() => {
      section.classList.remove('is-destination-highlight');
      visual.classList.remove('is-route-highlight');
    }, 2200);
    toast(route === 'tbw' ? 'Ruta TBW abierta' : 'Cursos de Alta abiertos');
  });
  document.body.addEventListener('click', async e => {
    const celebration = e.target.closest('[data-celebration-id]');
    if(celebration){
      e.preventDefault();
      const source = (state.operacional.celebraciones || []).find(item => item.ID === celebration.dataset.celebrationId);
      if(!source){
        toast('No se encontró la información del partner');
        return;
      }
      celebration.disabled = true;
      celebration.classList.add('is-generating');
      celebration.setAttribute('aria-busy', 'true');
      try{
        const { generateCelebrationPdf } = await import('./celebration-pdf.js');
        await generateCelebrationPdf({...source, occurrence:parseDate(celebration.dataset.celebrationDate)});
        toast(`Felicitación de ${source.Tipo.toLowerCase()} lista`);
      }catch(error){
        console.error('[Distrito Go] No se pudo generar la felicitación:', error);
        toast('No se pudo generar el PDF. Intenta nuevamente.');
      }finally{
        celebration.disabled = false;
        celebration.classList.remove('is-generating');
        celebration.removeAttribute('aria-busy');
      }
      return;
    }
    const segment = e.target.closest('[data-period-filter]');
    if(segment){
      periodFilter = segment.dataset.periodFilter;
      $$('[data-period-filter]').forEach(b=>b.classList.toggle('is-active', b===segment));
      renderEvents();
      return;
    }
    const eventSegment = e.target.closest('[data-event-filter]');
    if(eventSegment){
      eventFilter = eventSegment.dataset.eventFilter || 'upcoming';
      $$('[data-event-filter]').forEach(button => button.classList.toggle('is-active', button === eventSegment));
      renderEvents();
      return;
    }
    const eventCardButton = e.target.closest('[data-open-event-id]');
    if(eventCardButton){
      const item = (state.operacional.eventos || []).find(entry => String(entry.ID) === eventCardButton.dataset.openEventId);
      if(!item) return;
      const destination = eventDestination(item);
      if(destination.kind === 'informative') return;
      const dateLine = `${fmtDDMM(item['Fecha Inicio'])}${item['Fecha Fin'] ? ' al ' + fmtDDMM(item['Fecha Fin']) : ''}`;
      window.dispatchEvent(new CustomEvent('dgx:open-destination', {detail:{
        trigger:eventCardButton,
        item:{
          id:`event-${item.ID}`,
          title:item.Actividad || 'Evento',
          description:item['Contexto / Recordatorio'] || '',
          category:'Eventos',
          label:'Próximo',
          dateLabel:dateLine,
          fullImage:item.ImagenPath || '',
          imageOriginal:item.ImagenOriginal || item.ImagenPath || '',
          link:destination.link,
          section:''
        }
      }}));
    }
  });
}
export function goToSection(id){
  ensureOperationalSection(id);
  const el = document.getElementById(id);
  if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); toast('Sección abierta'); }
}
