// UI wiring. No framework — small enough not to need one.

(() => {
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- navigation ----------
  const titles = { today: 'Today', tasks: 'Tasks', plan: 'Plan', notes: 'Notes', chat: 'Assistant' };
  document.querySelectorAll('#tabbar button').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.screen === name));
    $('#screen-title').textContent = titles[name];
    renderAll();
  }

  // ---------- today ----------
  function renderToday() {
    const today = Store.todayStr();
    $('#today-date').textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });

    renderList($('#today-events'), Store.listEvents(today), e => `
      <div class="grow">
        <div class="title">${esc(e.title)}</div>
        <div class="sub">${e.start ? esc(e.start) + (e.end ? '–' + esc(e.end) : '') : 'all day'}</div>
      </div>`, 'Nothing scheduled');

    renderList($('#today-tasks'), Store.listTasks('today'), t => `
      <button class="check" data-act="task-toggle" data-id="${t.id}">✓</button>
      <div class="grow"><div class="title">${esc(t.title)}</div>
      ${t.due ? `<div class="sub">due ${esc(t.due)}</div>` : ''}</div>`, 'No tasks for today 🎉');

    renderList($('#today-habits'), Store.listHabits(), h => {
      const done = !!h.log[today];
      const streak = Store.habitStreak(h);
      return `
        <button class="check ${done ? 'on' : ''}" data-act="habit-toggle" data-id="${h.id}">✓</button>
        <div class="grow"><div class="title">${esc(h.name)}</div>
        <div class="sub">${streak > 0 ? `🔥 ${streak} day streak` : 'not yet today'}</div></div>`;
    }, 'No habits yet — add them in Settings');
  }

  // ---------- tasks ----------
  let taskFilter = 'open';
  $('#task-filter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    taskFilter = b.dataset.f;
    document.querySelectorAll('#task-filter button').forEach(x => x.classList.toggle('on', x === b));
    renderTasks();
  });
  $('#task-form').addEventListener('submit', e => {
    e.preventDefault();
    Store.addTask($('#task-title').value, $('#task-due').value || null);
    e.target.reset();
  });
  function renderTasks() {
    renderList($('#task-list'), Store.listTasks(taskFilter), t => `
      <button class="check ${t.done ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}">✓</button>
      <div class="grow ${t.done ? 'done' : ''}"><div class="title">${esc(t.title)}</div>
      ${t.due ? `<div class="sub">due ${esc(t.due)}</div>` : ''}</div>
      <button class="del" data-act="task-del" data-id="${t.id}">✕</button>`,
      'Nothing here', t => t.done ? 'done' : '');
  }

  // ---------- plan ----------
  $('#event-date').value = Store.todayStr();
  $('#event-form').addEventListener('submit', e => {
    e.preventDefault();
    Store.addEvent($('#event-title').value, $('#event-date').value,
      $('#event-start').value || null, $('#event-end').value || null);
    $('#event-title').value = '';
  });
  function renderPlan() {
    const today = Store.todayStr();
    renderList($('#event-list'), Store.listEvents().filter(e => e.date >= today), e => `
      <div class="grow">
        <div class="title">${esc(e.title)}</div>
        <div class="sub">${esc(e.date)}${e.start ? ' · ' + esc(e.start) + (e.end ? '–' + esc(e.end) : '') : ''}</div>
      </div>
      <button class="del" data-act="event-del" data-id="${e.id}">✕</button>`, 'Nothing planned');
  }

  // ---------- notes ----------
  $('#note-form').addEventListener('submit', e => {
    e.preventDefault();
    Store.addNote($('#note-text').value);
    e.target.reset();
  });
  function renderNotes() {
    renderList($('#note-list'), Store.listNotes(), n => `
      <div class="grow"><div class="title">${esc(n.text)}</div>
      <div class="sub">${new Date(n.createdAt).toLocaleDateString()}</div></div>
      <button class="del" data-act="note-del" data-id="${n.id}">✕</button>`, 'No notes yet');
  }

  // ---------- shared list rendering + delegated actions ----------
  function renderList(ul, items, tpl, emptyMsg, liClass) {
    if (!items.length) {
      ul.innerHTML = `<li class="empty">${emptyMsg}</li>`;
      return;
    }
    ul.innerHTML = items.map(it => `<li class="${liClass ? liClass(it) : ''}">${tpl(it)}</li>`).join('');
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'task-toggle': {
        const t = Store.listTasks('all').find(t => t.id === id);
        if (t) Store.updateTask(id, { done: !t.done });
        break;
      }
      case 'task-del': Store.deleteTask(id); break;
      case 'event-del': Store.deleteEvent(id); break;
      case 'note-del': Store.deleteNote(id); break;
      case 'habit-toggle': {
        const h = Store.listHabits().find(h => h.id === id);
        if (h) Store.logHabit(id, Store.todayStr(), !h.log[Store.todayStr()]);
        break;
      }
      case 'habit-del': Store.deleteHabit(id); break;
    }
  });

  // ---------- chat ----------
  function renderChat() {
    const log = $('#chat-log');
    const history = Store.getChat();
    if (!history.length) {
      log.innerHTML = `<div class="bubble assistant">Hi! I'm your assistant. I can manage your tasks, schedule, notes and habits — try "plan my afternoon" or "add milk to my tasks".\n\nAdd an API key in Settings first (a free Gemini key works great).</div>`;
      return;
    }
    log.innerHTML = history.map(m => {
      const chips = (m.actions || []).filter(Boolean).map(a => `<span class="chip">${esc(a)}</span>`).join('');
      return `<div class="bubble ${m.role}">${esc(m.text)}${chips ? `<div class="chips">${chips}</div>` : ''}</div>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }

  $('#chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const status = $('#chat-status');
    try {
      renderChatPending(text);
      await Assistant.send(text, s => { status.textContent = s; });
    } catch (err) {
      const history = Store.getChat();
      history.push({ role: 'assistant', text: `⚠️ ${err.message}` });
      Store.saveChat(history);
    } finally {
      status.textContent = '';
      renderAll();
    }
  });

  function renderChatPending(userText) {
    const log = $('#chat-log');
    log.insertAdjacentHTML('beforeend', `<div class="bubble user">${esc(userText)}</div>`);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- settings ----------
  const sheet = $('#settings-sheet');
  $('#btn-settings').addEventListener('click', () => { loadSettingsUI(); sheet.classList.remove('hidden'); });
  $('#btn-close-settings').addEventListener('click', () => sheet.classList.add('hidden'));
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.add('hidden'); });

  const provSel = $('#set-provider');
  provSel.innerHTML = Object.values(Providers.all)
    .map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  provSel.addEventListener('change', () => fillProviderFields(provSel.value));

  function loadSettingsUI() {
    const s = Store.getSettings();
    provSel.value = s.provider || 'gemini';
    fillProviderFields(provSel.value);
    renderHabitsSettings();
  }
  function fillProviderFields(id) {
    const s = Store.getSettings();
    const p = Providers.get(id);
    const cfg = (s.providers || {})[id] || {};
    $('#set-apikey').value = cfg.apiKey || '';
    $('#set-model').value = cfg.model || '';
    $('#set-model').placeholder = p.defaultModel;
    $('#provider-hint').textContent = p.keyHint;
  }
  $('#btn-save-settings').addEventListener('click', () => {
    const s = Store.getSettings();
    s.provider = provSel.value;
    s.providers = s.providers || {};
    s.providers[s.provider] = {
      apiKey: $('#set-apikey').value.trim(),
      model: $('#set-model').value.trim() || undefined,
    };
    Store.saveSettings(s);
    sheet.classList.add('hidden');
  });

  $('#habit-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#habit-name').value.trim();
    if (name) Store.addHabit(name);
    e.target.reset();
    renderHabitsSettings();
  });
  function renderHabitsSettings() {
    renderList($('#habit-list'), Store.listHabits(), h => `
      <div class="grow"><div class="title">${esc(h.name)}</div></div>
      <button class="del" data-act="habit-del" data-id="${h.id}">✕</button>`, 'No habits yet');
  }

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([Store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `day-pilot-backup-${Store.todayStr()}.json`;
    a.click();
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { Store.importAll(await f.text()); alert('Imported.'); }
    catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  });
  $('#btn-clear-chat').addEventListener('click', () => { Store.clearChat(); renderChat(); });

  // ---------- render ----------
  function renderAll() {
    renderToday();
    renderTasks();
    renderPlan();
    renderNotes();
    renderChat();
    if (!sheet.classList.contains('hidden')) renderHabitsSettings();
  }
  document.addEventListener('store:changed', renderAll);
  renderAll();
})();
