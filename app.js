(() => {
  'use strict';

  const cfg = window.LMK_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') &&
    cfg.supabasePublishableKey && !cfg.supabasePublishableKey.startsWith('DEIN_');
  const client = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey)
    : null;
  let dataClient = null;

  const state = { mode: 'login', authBusy: false, session: null, user: null, profile: null, profiles: [], fines: [], catalog: [], meeting: null, attendance: [] };
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const dateTime = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

  function message(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    window.setTimeout(() => $('toast').classList.remove('show'), 3500);
  }

  function showError(target, error) {
    target.textContent = error?.message || String(error || 'Unbekannter Fehler');
    target.classList.remove('hidden');
  }

  function setAuthMode(mode) {
    state.mode = mode;
    const registering = mode === 'register';
    $('login-tab').classList.toggle('active', !registering);
    $('register-tab').classList.toggle('active', registering);
    $('invite-group').classList.toggle('hidden', !registering);
    $('invite-code').required = registering;
    $('password').autocomplete = registering ? 'new-password' : 'current-password';
    $('auth-submit').textContent = registering ? 'Konto erstellen' : 'Anmelden';
    $('auth-error').classList.add('hidden');
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!client) return showError($('auth-error'), 'Trage zuerst URL und Publishable Key in config.js ein.');
    const button = $('auth-submit');
    button.disabled = true;
    state.authBusy = true;
    $('auth-error').classList.add('hidden');
    try {
      const email = $('email').value.trim();
      const password = $('password').value;
      if (state.mode === 'login') {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error('Supabase hat keine gültige Sitzung zurückgegeben.');
        await enterApp(data.session);
      } else {
        const inviteCode = $('invite-code').value.trim().toUpperCase();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { invite_code: inviteCode } }
        });
        if (error) {
          if (/database error saving new user/i.test(error.message || '')) {
            throw new Error('Registrierung abgelehnt: Der Einladungscode ist ungültig oder wurde bereits verwendet.');
          }
          throw error;
        }
        if (!data.session) {
          message('Konto erstellt. Bestätige jetzt deine E-Mail-Adresse.');
          setAuthMode('login');
        } else {
          await enterApp(data.session);
          message('Registrierung erfolgreich. Willkommen!');
        }
      }
    } catch (error) {
      showError($('auth-error'), error);
    } finally {
      state.authBusy = false;
      button.disabled = false;
    }
  }

  async function getProfile() {
    const { data, error } = await dataClient.from('profiles').select('id, full_name, role').eq('user_id', state.user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Dieses Konto ist noch keinem Mitglied zugeordnet. Bitte wende dich an den Administrator.');
    state.profile = data;
  }

  async function loadData() {
    const now = new Date().toISOString();
    const [profilesResult, finesResult, catalogResult, meetingResult] = await Promise.all([
      dataClient.from('profiles').select('id, full_name, role').order('full_name'),
      dataClient.from('strafen').select('id, member_id, created_by, catalog_id, reason, amount, is_paid, paid_at, created_at').order('created_at', { ascending: false }),
      dataClient.from('strafenkatalog').select('id, kategorie, paragraph_nr, titel, standard_betrag').order('paragraph_nr'),
      dataClient.from('termine').select('id, title, starts_at, location, description').gte('starts_at', now).order('starts_at').limit(1).maybeSingle()
    ]);
    for (const result of [profilesResult, finesResult, catalogResult, meetingResult]) if (result.error) throw result.error;
    state.profiles = profilesResult.data || [];
    state.fines = finesResult.data || [];
    state.catalog = catalogResult.data || [];
    state.meeting = meetingResult.data || null;
    if (state.meeting) {
      const attendanceResult = await dataClient.from('anwesenheit').select('termin_id, profile_id, status, kommentar, updated_at').eq('termin_id', state.meeting.id);
      if (attendanceResult.error) throw attendanceResult.error;
      state.attendance = attendanceResult.data || [];
    } else state.attendance = [];
  }

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function render() {
    $('user-name').textContent = state.profile.full_name;
    $('user-role').textContent = state.profile.role;
    $('add-fine-button').classList.toggle('hidden', !['spiess', 'vorstand', 'admin'].includes(state.profile.role));

    if (state.meeting) {
      $('meeting-title').textContent = state.meeting.title;
      $('meeting-date').textContent = dateTime.format(new Date(state.meeting.starts_at)) + ' Uhr';
      $('meeting-location').textContent = state.meeting.location;
      const own = state.attendance.find((a) => a.profile_id === state.profile.id);
      const labels = { kann: 'Du hast zugesagt.', kann_nicht: 'Du hast abgesagt.', unsicher: 'Du bist noch unsicher.' };
      $('rsvp-note').textContent = own ? labels[own.status] : 'Noch keine Rückmeldung';
      document.querySelectorAll('[data-rsvp]').forEach((button) => button.classList.toggle('active-rsvp', own?.status === button.dataset.rsvp));
    } else {
      $('meeting-title').textContent = 'Kein kommender Termin eingetragen';
      $('meeting-date').textContent = '';
      $('meeting-location').textContent = '';
    }

    const stats = state.profiles.map((profile) => {
      const fines = state.fines.filter((fine) => fine.member_id === profile.id);
      return {
        ...profile,
        count: fines.length,
        total: fines.reduce((sum, fine) => sum + Number(fine.amount), 0),
        unpaid: fines.filter((fine) => !fine.is_paid).reduce((sum, fine) => sum + Number(fine.amount), 0)
      };
    }).sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name, 'de'));
    const total = state.fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const unpaid = state.fines.filter((fine) => !fine.is_paid).reduce((sum, fine) => sum + Number(fine.amount), 0);
    const mine = state.fines.filter((fine) => fine.member_id === state.profile.id && !fine.is_paid).reduce((sum, fine) => sum + Number(fine.amount), 0);
    $('total-amount').textContent = money.format(total);
    $('unpaid-amount').textContent = money.format(unpaid);
    $('my-amount').textContent = money.format(mine);
    $('zugsau-name').textContent = stats[0]?.total > 0 ? stats[0].full_name : 'Noch offen';

    $('ranking-body').replaceChildren(...stats.map((member) => {
      const row = document.createElement('tr');
      row.append(el('td', member.full_name + (member.id === state.profile.id ? ' (du)' : '')),
        el('td', String(member.count)), el('td', money.format(member.unpaid)), el('td', money.format(member.total)));
      return row;
    }));

    const myFines = state.fines.filter((fine) => fine.member_id === state.profile.id);
    $('my-fines').replaceChildren(...(myFines.length ? myFines.map((fine) => {
      const card = el('article', null, 'fine-card');
      const left = document.createElement('div');
      left.append(el('p', fine.reason), el('small', new Date(fine.created_at).toLocaleDateString('de-DE')));
      const right = document.createElement('div');
      right.append(el('strong', money.format(Number(fine.amount))), el('span', fine.is_paid ? 'Bezahlt' : 'Offen', `pill ${fine.is_paid ? 'paid' : 'open'}`));
      card.append(left, right);
      return card;
    }) : [el('p', 'Du hast noch keine Strafen.', 'muted')]));

    const statusLabel = { kann: 'Dabei', kann_nicht: 'Abgesagt', unsicher: 'Unsicher' };
    $('attendance-list').replaceChildren(...state.profiles.map((profile) => {
      const reply = state.attendance.find((a) => a.profile_id === profile.id);
      const row = el('div', null, 'attendance-row');
      row.append(el('strong', profile.full_name), el('span', reply ? statusLabel[reply.status] : 'Keine Antwort', 'muted'));
      return row;
    }));

    $('fine-member').replaceChildren(...state.profiles.map((profile) => {
      const option = el('option', profile.full_name);
      option.value = profile.id;
      return option;
    }));
    const free = el('option', 'Freier Eintrag'); free.value = '';
    $('fine-catalog').replaceChildren(free, ...state.catalog.map((item) => {
      const amount = item.standard_betrag == null ? 'Betrag festlegen' : money.format(Number(item.standard_betrag));
      const option = el('option', `§${item.paragraph_nr} · ${item.titel} · ${amount}`);
      option.value = item.id;
      return option;
    }));
  }

  async function enterApp(session) {
    if (!session?.access_token || !session?.user) throw new Error('Keine gültige Anmeldung vorhanden.');
    state.session = session;
    state.user = session.user;
    dataClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      accessToken: async () => state.session?.access_token || null,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    try {
      await getProfile();
      await loadData();
      render();
      $('auth-view').classList.add('hidden');
      $('app-view').classList.remove('hidden');
    } catch (error) {
      await client.auth.signOut();
      showError($('auth-error'), error);
    }
  }

  async function saveRsvp(status) {
    if (!state.meeting) return message('Es gibt keinen kommenden Termin.');
    const { error } = await dataClient.from('anwesenheit').upsert({
      termin_id: state.meeting.id,
      profile_id: state.profile.id,
      status,
      updated_at: new Date().toISOString()
    }, { onConflict: 'termin_id,profile_id' });
    if (error) return message('Fehler: ' + error.message);
    await loadData(); render(); message('Rückmeldung gespeichert.');
  }

  async function saveFine(event) {
    event.preventDefault();
    $('fine-error').classList.add('hidden');
    const catalogId = $('fine-catalog').value || null;
    const payload = {
      member_id: $('fine-member').value,
      created_by: state.profile.id,
      catalog_id: catalogId,
      reason: $('fine-reason').value.trim(),
      amount: Number($('fine-amount').value),
      is_paid: false,
      paid_at: null
    };
    const { error } = await dataClient.from('strafen').insert(payload);
    if (error) return showError($('fine-error'), error);
    $('fine-dialog').close(); $('fine-form').reset();
    await loadData(); render(); message('Strafe gespeichert.');
  }

  function applyCatalog() {
    const item = state.catalog.find((entry) => String(entry.id) === $('fine-catalog').value);
    if (!item) return;
    $('fine-reason').value = `§${item.paragraph_nr} ${item.titel}`;
    $('fine-amount').value = item.standard_betrag == null ? '' : Number(item.standard_betrag).toFixed(2);
  }

  async function init() {
    $('login-tab').addEventListener('click', () => setAuthMode('login'));
    $('register-tab').addEventListener('click', () => setAuthMode('register'));
    $('auth-form').addEventListener('submit', submitAuth);
    $('logout-button').addEventListener('click', () => client.auth.signOut());
    $('add-fine-button').addEventListener('click', () => $('fine-dialog').showModal());
    $('close-dialog').addEventListener('click', () => $('fine-dialog').close());
    $('fine-form').addEventListener('submit', saveFine);
    $('fine-catalog').addEventListener('change', applyCatalog);
    document.querySelectorAll('[data-rsvp]').forEach((button) => button.addEventListener('click', () => saveRsvp(button.dataset.rsvp)));

    if (!configured) return showError($('auth-error'), 'Einrichtung unvollständig: Öffne config.js und trage deine Supabase-Daten ein.');
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) state.session = session;
      if (event === 'SIGNED_IN' && session?.user && !state.authBusy && !$('auth-view').classList.contains('hidden')) window.setTimeout(() => enterApp(session), 0);
      if (!session) {
        state.session = null;
        dataClient = null;
        $('app-view').classList.add('hidden');
        $('auth-view').classList.remove('hidden');
      }
    });
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) await enterApp(session);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
