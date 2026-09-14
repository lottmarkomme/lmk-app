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
// Explicit cell colors and table layout keep the email independent of website CSS.
function textBlock(text,size,color){
 return '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:'+(size||16)+'px;line-height:1.55;color:'+(color||'#f7f3ea')+';">'+esc(text)+'</p>';
}
function panel(content,bg){
 bg=bg||'#1c1c1c';
 return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;margin:0 0 16px;border-collapse:separate;"><tr><td bgcolor="'+bg+'" style="background-color:'+bg+';color:#f7f3ea;padding:20px;border:1px solid #3a3a3a;border-radius:16px;overflow-wrap:anywhere;word-break:break-word;">'+content+'</td></tr></table>';
}
function table(rows,paid){
 return rows.map(f=>panel(textBlock(f.reason,16)+textBlock(euro(f.amount),24,paid?'#78dba0':'#ffd166')+textBlock('Strafe vom '+datum(f.occurred_on),13,'#c4beb4')+(paid?textBlock('Bezahlt am '+datum(f.paid_at),13,'#c4beb4'):textBlock('Noch offen',13,'#ffd166')))).join('');
}
function frame(body){
 const u=PropertiesService.getScriptProperties().getProperty('APP_URL');
 const button=u&&/^https:\/\//.test(u)?'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td bgcolor="#f5a900" style="background-color:#f5a900;border-radius:10px;"><a href="'+esc(u)+'" style="display:inline-block;padding:15px 22px;color:#121212;font:bold 16px Arial;text-decoration:none;">Zug-App öffnen →</a></td></tr></table>':'';
 return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>:root{color-scheme:light dark;supported-color-schemes:light dark}body{margin:0!important;padding:0!important}table{border-spacing:0}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media(max-width:480px){.mail-pad{padding:20px 14px!important}}</style></head><body bgcolor="#121212" style="margin:0;background-color:#121212;color:#f7f3ea;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#121212" style="width:100%;background-color:#121212;"><tr><td align="center" bgcolor="#121212" style="background-color:#121212;padding:12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;table-layout:fixed;"><tr><td class="mail-pad" bgcolor="#121212" style="padding:32px 24px;background-color:#121212;color:#f7f3ea;overflow-wrap:anywhere;"><p style="margin:0 0 10px;color:#f5a900;font:bold 11px Arial;letter-spacing:2px;">SCHÜTZENZUG KORSCHENBROICH</p><h1 style="margin:0 0 8px;color:#f7f3ea;font:bold 30px Arial;">Lott mar komme<span style="color:#f5a900;">.</span></h1><p style="margin:0 0 28px;padding-bottom:20px;border-bottom:2px solid #f5a900;color:#c4beb4;font:13px Arial;">Deine Zugpost · '+esc(datum(new Date()))+'</p>'+body+button+'<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #3a3a3a;color:#c4beb4;font:12px/1.7 Arial;">Jan Jarre · Danziger Str. 31<br>41352 Korschenbroich<br><a href="mailto:LottMarKomme21@gmail.com" style="color:#ffd166;">LottMarKomme21@gmail.com</a></p></td></tr></table></td></tr></table></body></html>';
}
function buildMail(member,data,kind){
 const greeting=textBlock('Hallo '+member.name+',',20);
 if(kind==='meeting'){
 const upcoming=(data.upcoming||data.meetings||[]).filter(t=>new Date(t.starts_at)>new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,3);
 const info=upcoming.map(t=>t.title+' · '+Utilities.formatDate(new Date(t.starts_at),'Europe/Berlin','dd.MM.yyyy HH:mm')+' Uhr · '+t.location+' · '+(t.description||'')).join('\n\n')||'Aktuell sind keine kommenden Treffen oder Events eingetragen.';
 const cards=upcoming.map((t,i)=>panel(textBlock('0'+(i+1)+' / '+(t.kind==='event'?'EVENT':'SCHÜTZENTREFFEN'),12,'#ffd166')+textBlock(t.title,22)+textBlock(Utilities.formatDate(new Date(t.starts_at),'Europe/Berlin','dd.MM.yyyy HH:mm')+' Uhr',16,'#ffd166')+textBlock(t.location,16)+textBlock(t.description||'',14,'#c4beb4'))).join('');
 return {subject:'Dein Wochenausblick – nächste Treffen & Events',text:info,html:frame(greeting+textBlock('Das steht als Nächstes an.',26)+textBlock('Die nächsten drei Treffen & Events – für deine Planung.',15,'#c4beb4')+(cards||panel(textBlock(info)))+textBlock('Details und Rückmeldungen findest du in der App.',14,'#c4beb4'))};
 }
 const own=data.fines.filter(f=>f.member_id===member.id),open=own.filter(f=>!f.is_paid),paid=own.filter(f=>f.is_paid);
 const outstanding=open.length>0,sum=rows=>euro(rows.reduce((s,f)=>s+Number(f.amount),0));
 const banner=panel(textBlock(outstanding?'NOCH OFFEN':'ALLES BEZAHLT',12,outstanding?'#ffd166':'#78dba0')+textBlock(sum(open),38,outstanding?'#ffd166':'#78dba0')+textBlock(outstanding?'Deine Strafenübersicht':'Alles erledigt – danke!',22)+textBlock(outstanding?'Hier findest du deine offenen Beträge und bisherigen Zahlungen.':'Du hast aktuell keine offenen Strafen. So kann die Woche starten!',15,'#f7f3ea'),outstanding?'#332710':'#173326');
 const receiptRows=paid.map(f=>'<tr><td>'+esc(datum(f.occurred_on))+'</td><td>'+esc(f.reason)+'</td><td>'+euro(f.amount)+'</td><td>'+esc(datum(f.paid_at))+'</td></tr>').join('');
 const receipt='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zahlungsübersicht</title><style>body{font:14px Arial;background:#fff;color:#222;margin:20px}table{width:100%;table-layout:fixed;border-collapse:collapse}td,th{padding:8px 4px;border-bottom:1px solid #ccc;overflow-wrap:anywhere;text-align:left}th{background:#eee;color:#222}</style></head><body><h1>Zahlungsübersicht</h1><p>Lott mar komme · '+esc(member.name)+' · '+esc(datum(new Date()))+'</p><table><tr><th>Strafe vom</th><th>Grund</th><th>Betrag</th><th>Bezahlt am</th></tr>'+receiptRows+'</table><p>Bereits bezahlt: '+sum(paid)+'</p><p>Übersicht der in der App als bezahlt erfassten Strafen; keine unabhängig geprüfte Quittung.</p></body></html>';
 return {subject:outstanding?'Offen: '+sum(open)+' – deine Wochenübersicht':'Alles bezahlt – deine Wochenübersicht',text:'Hallo '+member.name+', offen: '+sum(open)+'. Bereits bezahlt: '+sum(paid)+'. Die Zahlungsübersicht liegt bei.',
 html:frame(greeting+banner+(open.length?textBlock('Offene Strafen · '+open.length,22)+table(open,false):'')+textBlock('Bereits bezahlt · '+sum(paid),22)+(paid.length?table(paid,true):textBlock('Noch keine bezahlten Strafen erfasst.',15,'#c4beb4'))+textBlock('Deine druckbare Zahlungsübersicht findest du im Anhang.',14,'#c4beb4')),
 attachment:Utilities.newBlob(receipt,'text/html','Zahlungsuebersicht.html')};
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
function protocolRpc(name,payload){
 const p=PropertiesService.getScriptProperties();
 const r=UrlFetchApp.fetch(p.getProperty('SUPABASE_URL')+'/rest/v1/rpc/'+name,{
  method:'post',contentType:'application/json',headers:{apikey:p.getProperty('SUPABASE_PUBLISHABLE_KEY')},
  payload:JSON.stringify(Object.assign({p_job_token:p.getProperty('MAIL_JOB_TOKEN')},payload||{})),muteHttpExceptions:true
 });
 if(r.getResponseCode()!==200)throw Error('Protokoll-Mail fehlgeschlagen: HTTP '+r.getResponseCode()+' · '+r.getContentText());
 return JSON.parse(r.getContentText());
}
function buildProtocolMail(member,protocol){
 const decisions=(protocol.decisions||[]).map(x=>'<li style="margin:0 0 8px;color:#f7f3ea;">'+esc(x)+'</li>').join('');
 const tasks=(protocol.action_items||[]).map(x=>'<li style="margin:0 0 8px;color:#f7f3ea;">'+esc(x.task)+(x.owner?' · '+esc(x.owner):'')+(x.due_date?' · bis '+esc(x.due_date):'')+'</li>').join('');
 const dateText=protocol.starts_at?Utilities.formatDate(new Date(protocol.starts_at),'Europe/Berlin','dd.MM.yyyy HH:mm')+' Uhr':'';
 const body=textBlock('Hallo '+member.name+',',20)
  +panel(textBlock('PROTOKOLL-ZUSAMMENFASSUNG',12,'#ffd166')+textBlock(protocol.title,27)+textBlock(dateText,15,'#c4beb4'),'#1c1c1c')
  +textBlock('Das Wichtigste',22)+panel(textBlock(protocol.summary||'Keine Zusammenfassung vorhanden.'))
  +(decisions?textBlock('Beschlüsse',22)+panel('<ul style="margin:0;padding-left:20px;">'+decisions+'</ul>'):'')
  +(tasks?textBlock('Aufgaben',22)+panel('<ul style="margin:0;padding-left:20px;">'+tasks+'</ul>'):'')
  +textBlock('Die Zusammenfassung wurde automatisch aus dem hochgeladenen Protokoll erstellt. Prüfe bei wichtigen Entscheidungen zusätzlich das Originalprotokoll.',13,'#c4beb4');
 return {
  subject:'Protokoll: '+protocol.title+' – Zusammenfassung',
  text:'Hallo '+member.name+',\n\n'+(protocol.summary||'Keine Zusammenfassung vorhanden.'),
  html:frame(body)
 };
}
function runProtocolEmails(preview){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const protocols=protocolRpc('protocol_mail_v1');
  protocols.forEach(protocol=>{
   (protocol.recipients||[]).forEach(member=>{
    const mail=buildProtocolMail(member,protocol);
    const options={htmlBody:mail.html,name:'Lott mar komme'};
    if(preview)GmailApp.createDraft(member.email,mail.subject,mail.text,options);
    else{
     if(MailApp.getRemainingDailyQuota()<1)throw Error('E-Mail-Kontingent ausgeschöpft.');
     GmailApp.sendEmail(member.email,mail.subject,mail.text,options);
     protocolRpc('mark_protocol_mailed_v1',{p_protocol_id:protocol.id,p_profile_id:member.id});
    }
   });
   if(!preview)protocolRpc('mark_protocol_mailed_v1',{p_protocol_id:protocol.id,p_profile_id:null});
  });
 }finally{lock.releaseLock();}
}
function sendWeeklyFineEmails(){runWeekly('fine',false);}
function sendWeeklyMeetingEmails(){runWeekly('meeting',false);}
function previewWeeklyEmails(){runWeekly('fine',true);runWeekly('meeting',true);}
function sendPendingProtocolEmails(){runProtocolEmails(false);}
function previewProtocolEmails(){runProtocolEmails(true);}
function createWeeklyTrigger(){
 ScriptApp.getProjectTriggers().forEach(t=>{if(['sendWeeklyFineEmails','sendWeeklyMeetingEmails','sendPendingProtocolEmails'].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);});
 ['sendWeeklyFineEmails','sendWeeklyMeetingEmails'].forEach(fn=>ScriptApp.newTrigger(fn).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone('Europe/Berlin').create());
 ScriptApp.newTrigger('sendPendingProtocolEmails').timeBased().everyMinutes(15).create();
}
