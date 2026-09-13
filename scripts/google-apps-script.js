// Vollständig statt des bisherigen Apps-Script-Codes einsetzen.
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function euro(v){return Number(v).toFixed(2).replace('.',',')+' €';}
function datum(v){return v?Utilities.formatDate(new Date(v),'Europe/Berlin','dd.MM.yyyy'):'–';}
function getMailData(){
 const p=PropertiesService.getScriptProperties();
 const r=UrlFetchApp.fetch(p.getProperty('SUPABASE_URL')+'/rest/v1/rpc/weekly_mail_v6',{
 method:'post',contentType:'application/json',headers:{apikey:p.getProperty('SUPABASE_PUBLISHABLE_KEY')},
 payload:JSON.stringify({p_job_token:p.getProperty('MAIL_JOB_TOKEN')}),muteHttpExceptions:true});
 if(r.getResponseCode()!==200)throw Error('Datenabruf fehlgeschlagen: HTTP '+r.getResponseCode());
 return JSON.parse(r.getContentText());
}
function table(rows,paid){
 return '<table style="width:100%;text-align:left"><tr><th>Strafe vom</th><th>Grund</th><th>Betrag</th>'+(paid?'<th>Bezahlt am</th>':'')+'</tr>'+rows.map(f=>'<tr><td>'+datum(f.occurred_on)+'</td><td>'+esc(f.reason)+'</td><td>'+euro(f.amount)+'</td>'+(paid?'<td>'+datum(f.paid_at)+'</td>':'')+'</tr>').join('')+'</table>';
}
function frame(body){
 const u=PropertiesService.getScriptProperties().getProperty('APP_URL');
 return '<div style="background:#121212;color:#f7f3ea;padding:28px;font-family:Arial"><div style="max-width:650px;margin:auto"><h1 style="color:#f5a900">Lott mar komme</h1>'+body+(u&&/^https:\/\//.test(u)?'<p><a style="color:#f5a900" href="'+esc(u)+'">Zug-App öffnen</a></p>':'')+'<hr><small>Jan Jarre · Danziger Str. 31 · 41352 Korschenbroich<br>LottMarKomme21@gmail.com</small></div></div>';
}
function buildMail(member,data,kind){
 if(kind==='meeting'){
 const upcoming=(data.upcoming||data.meetings||[]).filter(t=>new Date(t.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,3);
 const info=upcoming.map(t=>(t.kind==='event'?'Event: ':'Treffen: ')+t.title+' · '+Utilities.formatDate(new Date(t.starts_at),'Europe/Berlin','dd.MM.yyyy HH:mm')+' Uhr · '+t.location+' · '+t.description).join('\n\n')||'Aktuell sind keine kommenden Treffen oder Events eingetragen.';
 return {subject:'Dein Wochenausblick – nächste Treffen & Events',text:info,html:frame('<h2>Hallo '+esc(member.name)+'</h2><h3>Die nächsten drei Termine</h3><p>'+esc(info).replace(/\n/g,'<br>')+'</p><p>Details und Rückmeldungen findest du in der App.</p>')};
 }
 const own=data.fines.filter(f=>f.member_id===member.id),open=own.filter(f=>!f.is_paid),paid=own.filter(f=>f.is_paid);
 const outstanding=open.length>0;
 const color=outstanding?'#ffb454':'#6ee7b7';
 const banner='<div style="padding:24px;border-radius:14px;background:'+(outstanding?'#422b16':'#123d32')+';border-left:6px solid '+color+'"><h2 style="color:'+color+'">'+(outstanding?'Deine offenen Strafen':'Alles bezahlt – danke!')+'</h2><p>'+(outstanding?'Hier findest du deine offenen Beträge und bisherigen Zahlungen.':'Du hast aktuell keine offenen Strafen. Hier ist deine Wochenübersicht.')+'</p></div>';
 const sum=rows=>euro(rows.reduce((s,f)=>s+Number(f.amount),0));
 const receipt='<h1>Zahlungsübersicht</h1><p>Lott mar komme · '+esc(member.name)+' · Stand '+datum(new Date())+'</p>'+table(paid,true)+'<p>Bereits bezahlt: '+sum(paid)+'</p><p>Übersicht der in der App als bezahlt erfassten Strafen; keine unabhängig geprüfte Quittung.</p>';
 return {subject:(outstanding?'Offen: '+sum(open)+' – deine Wochenübersicht':'Alles bezahlt – deine Wochenübersicht'),text:'Hallo '+member.name+', offen: '+sum(open)+'. Bereits bezahlt: '+sum(paid)+'. Einzelheiten stehen in der beigefügten Zahlungsübersicht.',
 html:frame('<h2>Hallo '+esc(member.name)+'</h2>'+banner+'<h3>Offene Strafen</h3>'+(open.length?table(open,false):'<p>Keine offenen Strafen.</p>')+'<p>Offen: '+sum(open)+'</p><hr><h3>Bereits bezahlt</h3>'+(paid.length?table(paid,true):'<p>Noch keine bezahlten Strafen erfasst.</p>')+'<p>Bezahlt: '+sum(paid)+'</p>'),
 attachment:Utilities.newBlob('<!doctype html><html lang="de"><meta charset="utf-8"><title>Zahlungsübersicht</title><style>body{font:16px Arial;margin:30px}td,th{padding:8px;border-bottom:1px solid #ccc}</style><body>'+receipt+'</body></html>','text/html','Zahlungsuebersicht.html')};
}
function runWeekly(kind,preview){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const data=getMailData(),props=PropertiesService.getScriptProperties();
 // Montag als eindeutige Kalenderwoche, auch über den Jahreswechsel.
 const now=new Date(),parts=Utilities.formatDate(now,'Europe/Berlin','yyyy-MM-dd').split('-').map(Number);
 const monday=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 const week=monday.toISOString().slice(0,10);
 data.members.forEach(m=>{
 const mail=buildMail(m,data,kind);if(!mail)return;
 const marker='sent_'+kind+'_'+m.id;if(!preview&&props.getProperty(marker)===week)return;
 const options={htmlBody:mail.html,name:'Lott mar komme'};if(mail.attachment)options.attachments=[mail.attachment];
 if(preview)GmailApp.createDraft(m.email,mail.subject,mail.text,options);
 else {if(MailApp.getRemainingDailyQuota()<1)throw Error('E-Mail-Kontingent ausgeschöpft.');
 GmailApp.sendEmail(m.email,mail.subject,mail.text,options);props.setProperty(marker,week);}
 });
 }finally{lock.releaseLock();}
}
function sendWeeklyFineEmails(){runWeekly('fine',false);}
function sendWeeklyMeetingEmails(){runWeekly('meeting',false);}
function previewWeeklyEmails(){runWeekly('fine',true);runWeekly('meeting',true);}
function createWeeklyTrigger(){
 ScriptApp.getProjectTriggers().forEach(t=>{if(['sendWeeklyFineEmails','sendWeeklyMeetingEmails'].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);});
 ['sendWeeklyFineEmails','sendWeeklyMeetingEmails'].forEach(fn=>ScriptApp.newTrigger(fn).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone('Europe/Berlin').create());
}
