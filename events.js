window.LMK_EVENTS = (() => {
let ctx, events=[], meetings=[], polls=[], votes=[], meetingAttendance=[], eventAttendance=[], protocols=[];
const PDFJS_VERSION='4.10.38';
const MAX_PDF_PAGES=16;
let pdfJsPromise;
function timed(promise,ms,message){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(message)),ms);
  Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},reason=>{clearTimeout(timer);reject(reason);});
 });
}
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const board=()=>['admin','vorstand'].includes(ctx.profile.role);
const officer=()=>['admin','vorstand','spiess'].includes(ctx.profile.role);
const date=v=>new Date(v).toLocaleString('de-DE',{timeZone:'Europe/Berlin'});
function button(text,action){const b=node('button',text);b.type='button';b.className='button neutral';b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){error(e);}finally{if(b.isConnected)b.disabled=false;}};return b;}
function error(e){const box=document.getElementById('events-error');box.textContent=e.message;box.classList.remove('hidden');}
async function edgeResult(result){
 if(!result.error)return result.data;
 let message=result.error.message||'Die Serverfunktion ist fehlgeschlagen.';
 try{
  const response=result.error.context;
  const payload=response?.clone?await response.clone().json():null;
  if(payload?.error)message=payload.error;
 }catch(_){}
 throw new Error(message);
}
async function reload(){
 const protocolFiles=officer()?',storage_path,mime_type,page_image_paths':'';
 [events,meetings,polls,votes,meetingAttendance,eventAttendance,protocols]=await Promise.all([
 'zug_events?select=*&order=starts_at.asc',
 'termine?select=*&order=starts_at.asc',
 'cash_polls?select=*',
 'cash_votes?select=*',
 'anwesenheit?select=termin_id,profile_id,status,updated_at',
 'zug_event_attendance?select=event_id,profile_id,status,updated_at',
 'protokolle?select=id,meeting_id,event_id,original_name'+protocolFiles+',status,summary,topics,decisions,action_items,error_message,analyzed_at,mailed_at&order=created_at.desc'
 ].map(p=>ctx.api(p)));
 render();
}
function form(title,fields,save){
 const dialog=node('dialog'),f=node('form');f.className='dialog-card';
 f.append(node('h2',title));const inputs={};
 fields.forEach(([key,label,type,value,required=true])=>{
 const l=node('label',label),i=node(type==='textarea'?'textarea':type==='select'?'select':'input');
 if(type==='select'){value.forEach(([v,t])=>{const o=node('option',t);o.value=v;i.append(o);});}
 else {if(type!=='textarea')i.type=type;i.value=value||'';}
 i.required=required;inputs[key]=i;l.append(i);f.append(l);
 });
 const msg=node('p');msg.setAttribute('role','status');f.append(msg);
 const submit=node('button','Speichern');submit.className='button primary';submit.type='submit';
 f.append(submit,button('Abbrechen',()=>dialog.close()));
 f.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await save(Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value])));dialog.close();await reload();await ctx.refresh();}catch(e){msg.textContent=e.message;}finally{submit.disabled=false;}};
 dialog.append(f);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
}
function local(v){if(!v)return '';const d=new Date(v);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function edit(item,table){
 const fields=[['title','Titel','text',item?.title],['starts_at','Datum und Uhrzeit (Gerätezeitzone)','datetime-local',local(item?.starts_at)],['location','Ort / Adresse','text',item?.location],['description','Weitere Infos','textarea',item?.description,false]];
 if(!item && officer())fields.unshift(['kind','Art','select',[['zug_events','Event'],['termine','Schützentreffen']]]);
 form(item?'Termin bearbeiten':'Neuen Termin eintragen',fields,async data=>{
 const target=table||data.kind||'zug_events';delete data.kind;data.starts_at=new Date(data.starts_at).toISOString();
 await ctx.api(target+(item?'?id=eq.'+item.id:''),{method:item?'PATCH':'POST',body:data,prefer:'return=minimal'});
 });
}
function configure(event,poll){
 form('Zugkassen-Abstimmung',[
 ['question','Frage','text',poll?.question||'Soll die Zugkasse mitgenommen werden?'],
 ['closes_at','Abstimmungsende (Gerätezeitzone)','datetime-local',local(poll?.closes_at||event.starts_at)],
 ['enabled','Status','select',poll?.enabled===false?[['false','Geschlossen'],['true','Offen']]:[['true','Offen'],['false','Geschlossen']]]
 ],async d=>{
 await ctx.api('cash_polls'+(poll?'?id=eq.'+poll.id:''),{method:poll?'PATCH':'POST',prefer:'return=minimal',body:{event_id:event.id,question:d.question,closes_at:new Date(d.closes_at).toISOString(),enabled:d.enabled==='true'}});
 });
}
const attendanceLabels={kann:'Dabei',kann_nicht:'Kann nicht',unsicher:'Unsicher'};
async function saveAttendance(item,status){
 const meeting=item.table==='termine',table=meeting?'anwesenheit':'zug_event_attendance',idKey=meeting?'termin_id':'event_id';
 await ctx.api(table+'?on_conflict='+idKey+',profile_id',{
  method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
  body:{[idKey]:item.id,profile_id:ctx.profile.id,status,updated_at:new Date().toISOString()}
 });
 await reload();await ctx.refresh();
}
function attendanceBox(item){
 const meeting=item.table==='termine';
 const rows=(meeting?meetingAttendance:eventAttendance).filter(a=>(meeting?a.termin_id:a.event_id)===item.id);
 const own=rows.find(a=>a.profile_id===ctx.profile.id);
 const box=node('section');box.className='event-attendance';
 box.append(node('h4','Teilnahme'));
 const actions=node('div');actions.className='event-vote-row';
 ['kann','kann_nicht','unsicher'].forEach(status=>{
  const count=rows.filter(a=>a.status===status).length;
  const b=button(attendanceLabels[status]+' · '+count,()=>saveAttendance(item,status));
  if(own?.status===status)b.className='button primary';
  actions.append(b);
 });
 box.append(actions,node('small',own?'Deine Antwort: '+attendanceLabels[own.status]:'Du hast noch nicht geantwortet.'));
 return box;
}
function attendanceSummary(item){
 const meeting=item.table==='termine';
 const rows=(meeting?meetingAttendance:eventAttendance).filter(a=>(meeting?a.termin_id:a.event_id)===item.id);
 const box=node('section');box.className='event-attendance';
 box.append(node('h4','Teilnahme beim Termin'));
 const summary=node('div');summary.className='event-vote-row attendance-readonly';
 ['kann','kann_nicht','unsicher'].forEach(status=>summary.append(node('span',attendanceLabels[status]+' · '+rows.filter(a=>a.status===status).length)));
 box.append(summary);
 return box;
}
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Die PDF-Seite konnte nicht vorbereitet werden.')),'image/jpeg',0.9));}
async function pdfJs(){
 if(!pdfJsPromise)pdfJsPromise=timed(import('https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VERSION+'/build/pdf.min.mjs'),30000,'Der PDF-Scanner konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.').then(lib=>{
  lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VERSION+'/build/pdf.worker.min.mjs';
  return lib;
 }).catch(e=>{pdfJsPromise=null;throw e;});
 return pdfJsPromise;
}
async function preparePdfScans(protocol,source,status){
 if(protocol.mime_type!=='application/pdf'||protocol.page_image_paths?.length)return protocol.page_image_paths||[];
 status?.('PDF wird auf gescannte Seiten geprüft …');
 let blob=source;
 if(!blob){
  status?.('Originaldatei wird sicher geladen …');
  const sourceResult=await timed(ctx.client.functions.invoke('analyze-protocol',{body:{protocol_id:protocol.id,action:'source'}}),45000,'Das gespeicherte PDF konnte nicht rechtzeitig geladen werden.');
  blob=await edgeResult(sourceResult);
  if(blob?.error)throw new Error(blob.error);
  if(!(blob instanceof Blob))throw new Error('Das gespeicherte PDF konnte nicht geladen werden.');
 }
 status?.('PDF-Scanner wird geladen …');
 const lib=await pdfJs();
 status?.('PDF-Seiten werden geöffnet …');
 const loadingTask=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())});
 const pdfDocument=await timed(loadingTask.promise,45000,'Das PDF konnte nicht rechtzeitig geöffnet werden.');
 if(pdfDocument.numPages>MAX_PDF_PAGES)throw new Error('Gescannte PDF-Protokolle dürfen höchstens '+MAX_PDF_PAGES+' Seiten enthalten.');
 const paths=[];
 try{
  for(let pageNumber=1;pageNumber<=pdfDocument.numPages;pageNumber++){
   const page=await pdfDocument.getPage(pageNumber);
   status?.('Texterkennung wird vorbereitet: Seite '+pageNumber+' von '+pdfDocument.numPages+' …');
   const base=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:Math.min(2.4,1200/base.width)});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;
   const tileHeight=680,overlap=40,step=tileHeight-overlap;
   for(let top=0,tile=1;top<canvas.height;top+=step,tile++){
    const height=Math.min(tileHeight,canvas.height-top),part=document.createElement('canvas');part.width=canvas.width;part.height=height;
    part.getContext('2d',{alpha:false}).drawImage(canvas,0,top,canvas.width,height,0,0,canvas.width,height);
    const image=await canvasBlob(part);
    const path=ctx.profile.id+'/'+Date.now()+'-'+protocol.id+'-seite-'+pageNumber+'-'+tile+'.jpg';
    const uploaded=await ctx.client.storage.from('protokolle').upload(path,image,{contentType:'image/jpeg',upsert:false});
    if(uploaded.error)throw uploaded.error;
    paths.push(path);part.width=part.height=1;
   }
   canvas.width=canvas.height=1;page.cleanup();
  }
  await pdfDocument.destroy();
  if(paths.length){
   await ctx.api('protokolle?id=eq.'+protocol.id,{method:'PATCH',prefer:'return=minimal',body:{page_image_paths:paths}});
   protocol.page_image_paths=paths;
  }
  return paths;
 }catch(e){
  if(paths.length)await ctx.client.storage.from('protokolle').remove(paths);
  try{await pdfDocument.destroy();}catch(_){}
  throw e;
 }
}
async function analyzeProtocol(protocol,force=false,status){
 await preparePdfScans(protocol,null,status);
 status?.('Protokoll wird vollständig ausgewertet …');
 const result=await ctx.client.functions.invoke('analyze-protocol',{body:{protocol_id:protocol.id,force}});
 const data=await edgeResult(result);
 if(data?.error)throw new Error(data.error);
 await reload();
}
function protocolDetails(protocol){
 const box=node('article');box.className='protocol-result';
 const progress=node('small');progress.setAttribute('role','status');
 const analyze=async force=>{
  progress.classList.remove('form-error');
  try{await analyzeProtocol(protocol,force,text=>progress.textContent=text);}
  catch(e){progress.textContent='Fehler: '+e.message;progress.classList.add('form-error');}
 };
 box.append(node('strong',protocol.original_name));
 if(protocol.status==='pending'||protocol.status==='processing'){
  box.append(node('p',protocol.status==='processing'?'KI-Auswertung läuft …':'Auswertung wartet …'));
   if(officer())box.append(button('Jetzt auswerten',()=>analyze(false)));
 }else if(protocol.status==='error'){
  const note=node('p','Fehler: '+(protocol.error_message||'Unbekannter Fehler'));note.className='form-error';box.append(note);
   if(officer())box.append(button('Erneut auswerten',()=>analyze(false)));
 }else{
  box.append(node('h5','Zusammenfassung'),node('p',protocol.summary||'Keine Zusammenfassung vorhanden.'));
  if(protocol.topics?.length){
   box.append(node('h5','Alle besprochenen Punkte'));
   protocol.topics.forEach(topic=>{
    const item=node('section');item.className='protocol-topic';
    item.append(node('strong',topic.title),node('p',topic.details));
    if(topic.outcome)item.append(node('small',topic.outcome));
    box.append(item);
   });
  }
  if(protocol.decisions?.length){
   box.append(node('h5','Beschlüsse'));const list=node('ul');protocol.decisions.forEach(x=>list.append(node('li',x)));box.append(list);
  }
  if(protocol.action_items?.length){
   box.append(node('h5','Aufgaben'));const list=node('ul');
   protocol.action_items.forEach(x=>list.append(node('li',x.task+(x.owner?' · '+x.owner:'')+(x.due_date?' · bis '+x.due_date:''))));
   box.append(list);
  }
  box.append(node('small',protocol.mailed_at?'Zusammenfassung wurde per E-Mail verschickt.':'E-Mail-Versand steht noch aus.'));
   if(officer())box.append(button('Neu auswerten',()=>analyze(true)));
 }
 if(officer())box.append(progress);
 return box;
}
async function uploadProtocol(item,input,submit,status){
 const file=input.files?.[0];
 if(!file)throw new Error('Bitte zuerst eine Datei auswählen.');
 if(file.size>8*1024*1024)throw new Error('Die Datei darf höchstens 8 MB groß sein.');
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 const mimeByExt={pdf:'application/pdf',txt:'text/plain',md:'text/markdown',rtf:'application/rtf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',odt:'application/vnd.oasis.opendocument.text'};
 if(!mimeByExt[ext])throw new Error('Erlaubt sind PDF, DOCX, ODT, RTF, TXT und MD.');
 submit.disabled=true;status.textContent='Datei wird hochgeladen …';
 const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-180);
 const path=ctx.profile.id+'/'+Date.now()+'-'+crypto.randomUUID()+'-'+safe;
 const uploaded=await ctx.client.storage.from('protokolle').upload(path,file,{contentType:mimeByExt[ext],upsert:false});
 if(uploaded.error){submit.disabled=false;throw uploaded.error;}
 let registered=false;
 try{
  const body={created_by:ctx.profile.id,original_name:file.name,storage_path:path,mime_type:mimeByExt[ext]};
  body[item.table==='termine'?'meeting_id':'event_id']=item.id;
  const saved=await ctx.api('protokolle',{method:'POST',prefer:'return=representation',body});
  registered=true;
   const protocol=saved[0];
   await preparePdfScans(protocol,file,text=>status.textContent=text);
   await analyzeProtocol(protocol,false,text=>status.textContent=text);
  input.value='';status.textContent='Auswertung abgeschlossen. Die E-Mail wird automatisch vorbereitet.';
 }catch(e){
  if(!registered)await ctx.client.storage.from('protokolle').remove([path]);
  throw e;
 }finally{submit.disabled=false;await reload();}
}
function protocolBox(item){
 const box=node('section');box.className='protocol-box';
 box.append(node('h4','Protokolle & KI-Zusammenfassungen'));
 const own=protocols.filter(p=>(item.table==='termine'?p.meeting_id:p.event_id)===item.id);
 own.forEach(p=>box.append(protocolDetails(p)));
 if(!own.length)box.append(node('p','Noch kein Protokoll vorhanden.'));
 if(officer()){
  const label=node('label','Protokoll auswählen');
  const input=node('input');input.type='file';input.accept='.pdf,.docx,.odt,.rtf,.txt,.md';label.append(input);
  const status=node('small');status.setAttribute('role','status');
  const submit=button('Hochladen & auswerten',()=>uploadProtocol(item,input,submit,status));submit.className='button primary';
  box.append(label,submit,status);
 }
 return box;
}
function renderItem(item,past){
 const card=node('details');card.className='rsvp-box';card.style.marginBottom='14px';
 card.dataset.startsAt=item.starts_at;card.dataset.kind=item.table;
 card.append(node('summary',item.title+' · '+date(item.starts_at)));
 card.append(node('h3',item.title),node('p',(item.table==='termine'?'Schützentreffen · ':'Event · ')+date(item.starts_at)),node('p',item.location),node('p',item.description));
 if(item.table==='termine'?officer():board()||item.created_by===ctx.profile.id)card.append(button('Bearbeiten',()=>edit(item,item.table)));
 card.append(past?attendanceSummary(item):attendanceBox(item));
 if(item.table==='zug_events'){
  const p=polls.find(p=>p.event_id===item.id);
  if(!past&&board())card.append(button(p?'Abstimmung konfigurieren':'Zugkassen-Abstimmung starten',()=>configure(item,p)));
  if(p){
   const own=votes.find(v=>v.poll_id===p.id&&v.profile_id===ctx.profile.id);
   card.append(node('h4',p.question),node('p','Ende: '+date(p.closes_at)),node('small','Die Stimmen sind für angemeldete Mitglieder einsehbar.'));
   const open=!past&&p.enabled&&new Date(p.closes_at)>new Date();
   ['ja','nein','enthaltung'].forEach(choice=>{
    const count=votes.filter(v=>v.poll_id===p.id&&v.choice===choice).length;
    const b=button(choice+' ('+count+')'+(own?.choice===choice?' ✓':''),async()=>{
     await ctx.api('cash_votes?on_conflict=poll_id,profile_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{poll_id:p.id,profile_id:ctx.profile.id,choice}});await reload();
    });b.disabled=!open;card.append(b);
   });if(!open)card.append(node('p','Abstimmung geschlossen.'));
  }
 }
 card.append(protocolBox(item));
 return card;
}
function render(){
 document.getElementById('new-event').onclick=()=>edit();
 const futureRoot=document.getElementById('events-list'),pastRoot=document.getElementById('past-events-list'),now=Date.now();
 const items=[...meetings.map(x=>({...x,table:'termine'})),...events.map(x=>({...x,table:'zug_events'}))];
 const future=items.filter(x=>Date.parse(x.starts_at)>=now).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 const past=items.filter(x=>Date.parse(x.starts_at)<now).sort((a,b)=>b.starts_at.localeCompare(a.starts_at));
 futureRoot.replaceChildren(...future.map(item=>renderItem(item,false)));
 pastRoot.replaceChildren(...past.map(item=>renderItem(item,true)));
 window.LMK_LISTS.update('events-list',{events:true,eventScope:'future'});
 window.LMK_LISTS.update('past-events-list',{events:true,eventScope:'past'});
}
return {load:async context=>{ctx=context;await reload();}};
})();
