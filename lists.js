window.LMK_LISTS = (() => {
  const lists = new Map();
  function update(id, options = {}) {
    const root = document.getElementById(id);
    let state = lists.get(id);
    if (!state) {
      const controls = document.createElement('div');
      controls.className = 'list-controls';
      const search = document.createElement('input');
      search.type = 'search'; search.placeholder = 'Suchen …'; search.setAttribute('aria-label', 'Liste durchsuchen');
      const filter = document.createElement('select');
      filter.setAttribute('aria-label', 'Liste filtern');
      const choices = options.events ? [['future','Bevorstehend'],['past','Vergangen'],['all','Alle Termine'],['meeting','Nur Treffen'],['event','Nur Events']] : [['all','Alle Zahlungen'],['open','Nur offen'],['paid','Nur bezahlt']];
      choices.forEach(([value,text]) => { const o = document.createElement('option'); o.value=value; o.textContent=text; filter.append(o); });
      const toggle = document.createElement('button'); toggle.type='button'; toggle.className='button neutral'; toggle.setAttribute('aria-controls',id);
      const count = document.createElement('p'); count.setAttribute('role','status');
      const more = document.createElement('button'); more.type='button'; more.className='button neutral'; more.textContent='Weitere 5 anzeigen';
      controls.append(search,filter,toggle); root.before(controls,count); root.after(more);
      state={search,filter,toggle,count,more,limit:5,collapsed:false,options}; lists.set(id,state);
      search.oninput=filter.onchange=()=>{state.limit=5; apply();};
      toggle.onclick=()=>{state.collapsed=!state.collapsed;apply();};
      more.onclick=()=>{state.limit+=5;apply();};
    }
    function apply() {
      const q=state.search.value.toLocaleLowerCase('de-DE').trim(), f=state.filter.value;
      const cards=Array.from(root.children), now=Date.now();
      const matches=cards.filter(c=>{
        if(!c.dataset.startsAt && !c.dataset.status)return false;
        const future=Date.parse(c.dataset.startsAt)>=now;
        const status=state.options.events ? f==='all'||f==='future'&&future||f==='past'&&!future||f==='meeting'&&future&&c.dataset.kind==='termine'||f==='event'&&future&&c.dataset.kind==='zug_events' : f==='all'||c.dataset.status===f;
        return status && c.textContent.toLocaleLowerCase('de-DE').includes(q);
      });
      cards.forEach(c=>{c.hidden=true;});
      if(!state.collapsed)matches.slice(0,state.limit).forEach(c=>{c.hidden=false;});
      state.count.textContent=matches.length ? `${state.collapsed?0:Math.min(state.limit,matches.length)} von ${matches.length} Einträgen` : 'Keine passenden Einträge.';
      state.toggle.textContent=state.collapsed?'Liste ausklappen':'Liste einklappen';
      state.toggle.setAttribute('aria-expanded',String(!state.collapsed));
      state.more.hidden=state.collapsed||matches.length<=state.limit;
    }
    apply();
  }
  return {update};
})();
