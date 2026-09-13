window.LMK_EVENTS = (() => {
let ctx, events=[], meetings=[], polls=[], votes=[];
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const board=()=>['admin','vorstand'].includes(ctx.profile.role);
const officer=()=>['admin','vorstand','spiess'].includes(ctx.profile.role);
const date=v=>new Date(v).toLocaleString('de-DE',{timeZone:'Europe/Berlin'});
function button(text,action){const b=node('button',text);b.type='button';b.className='button neutral';b.onclick=()=>Promise.resolve().then(action).catch(error);return b;}
function error(e){const box=document.getElementById('events-error');box.textContent=e.message;box.classList.remove('hidden');}
async function reload(){
 [events,meetings,polls,votes]=await Promise.all(['zug_events?select=*&order=starts_at.asc','termine?select=*&order=starts_at.asc','cash_polls?select=*','cash_votes?select=*'].map(p=>ctx.api(p)));
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
function render(){
 document.getElementById('new-event').onclick=()=>edit();
 const root=document.getElementById('events-list');root.replaceChildren();
 [...meetings.map(x=>({...x,table:'termine'})),...events.map(x=>({...x,table:'zug_events'}))].sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).forEach(item=>{
 const card=node('details');card.className='rsvp-box';card.style.marginBottom='14px';
 card.dataset.startsAt=item.starts_at;card.dataset.kind=item.table;
 card.append(node('summary',item.title+' · '+date(item.starts_at)));
 card.append(node('h3',item.title),node('p',(item.table==='termine'?'Schützentreffen · ':'Event · ')+date(item.starts_at)),node('p',item.location),node('p',item.description));
 if(item.table==='termine'?officer():board()||item.created_by===ctx.profile.id)card.append(button('Bearbeiten',()=>edit(item,item.table)));
 if(item.table==='zug_events'){
 const p=polls.find(p=>p.event_id===item.id);
 if(board())card.append(button(p?'Abstimmung konfigurieren':'Zugkassen-Abstimmung starten',()=>configure(item,p)));
 if(p){
 const own=votes.find(v=>v.poll_id===p.id&&v.profile_id===ctx.profile.id);
 card.append(node('h4',p.question),node('p','Ende: '+date(p.closes_at)),node('small','Die Stimmen sind für angemeldete Mitglieder einsehbar.'));
 const open=p.enabled&&new Date(p.closes_at)>new Date();
 ['ja','nein','enthaltung'].forEach(choice=>{
 const count=votes.filter(v=>v.poll_id===p.id&&v.choice===choice).length;
 const b=button(choice+' ('+count+')'+(own?.choice===choice?' ✓':''),async()=>{
 await ctx.api('cash_votes?on_conflict=poll_id,profile_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{poll_id:p.id,profile_id:ctx.profile.id,choice}});await reload();
 });b.disabled=!open;card.append(b);
 });if(!open)card.append(node('p','Abstimmung geschlossen.'));
 }
 }root.append(card);
 });
 window.LMK_LISTS.update('events-list',{events:true});
}
return {load:async context=>{ctx=context;await reload();}};
})();
