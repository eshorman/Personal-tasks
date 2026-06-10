// Local-first data layer. Everything lives in localStorage on the device.
// Single user, no backend, no sync.

const Store = (() => {
  const DATA_KEY = 'pa_data_v1';
  const SETTINGS_KEY = 'pa_settings_v1';
  const CHAT_KEY = 'pa_chat_v1';

  const blank = () => ({
    tasks: [],   // {id, title, due, done, createdAt, doneAt}
    events: [],  // {id, title, date(YYYY-MM-DD), start(HH:MM), end(HH:MM), notes}
    notes: [],   // {id, text, createdAt}
    habits: [],  // {id, name, log: {'YYYY-MM-DD': true}}
  });

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      return raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
    } catch {
      return blank();
    }
  }

  function save() {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent('store:changed'));
  }

  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ---- Tasks ----
  function addTask(title, due = null) {
    const t = { id: uid(), title: title.trim(), due, done: false, createdAt: Date.now(), doneAt: null };
    data.tasks.push(t);
    save();
    return t;
  }
  function updateTask(id, patch) {
    const t = data.tasks.find(t => t.id === id);
    if (!t) return null;
    if (patch.title !== undefined) t.title = patch.title;
    if (patch.due !== undefined) t.due = patch.due;
    if (patch.done !== undefined) {
      t.done = !!patch.done;
      t.doneAt = t.done ? Date.now() : null;
    }
    save();
    return t;
  }
  function deleteTask(id) {
    data.tasks = data.tasks.filter(t => t.id !== id);
    save();
  }
  function listTasks(filter = 'open') {
    let ts = [...data.tasks];
    if (filter === 'open') ts = ts.filter(t => !t.done);
    if (filter === 'done') ts = ts.filter(t => t.done);
    if (filter === 'today') ts = ts.filter(t => !t.done && (!t.due || t.due <= todayStr()));
    return ts.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
  }

  // ---- Events ----
  function addEvent(title, date, start = null, end = null, notes = '') {
    const e = { id: uid(), title: title.trim(), date, start, end, notes };
    data.events.push(e);
    save();
    return e;
  }
  function deleteEvent(id) {
    data.events = data.events.filter(e => e.id !== id);
    save();
  }
  function listEvents(date = null) {
    let es = [...data.events];
    if (date) es = es.filter(e => e.date === date);
    return es.sort((a, b) => `${a.date} ${a.start || ''}` < `${b.date} ${b.start || ''}` ? -1 : 1);
  }

  // ---- Notes ----
  function addNote(text) {
    const n = { id: uid(), text: text.trim(), createdAt: Date.now() };
    data.notes.unshift(n);
    save();
    return n;
  }
  function deleteNote(id) {
    data.notes = data.notes.filter(n => n.id !== id);
    save();
  }
  function listNotes() { return [...data.notes]; }

  // ---- Habits ----
  function addHabit(name) {
    const h = { id: uid(), name: name.trim(), log: {} };
    data.habits.push(h);
    save();
    return h;
  }
  function deleteHabit(id) {
    data.habits = data.habits.filter(h => h.id !== id);
    save();
  }
  function logHabit(id, date = todayStr(), done = true) {
    const h = data.habits.find(h => h.id === id);
    if (!h) return null;
    if (done) h.log[date] = true; else delete h.log[date];
    save();
    return h;
  }
  function listHabits() { return [...data.habits]; }
  function habitStreak(h) {
    let streak = 0;
    const d = new Date();
    for (;;) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (h.log[key]) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // ---- Settings ----
  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // ---- Chat history ----
  function getChat() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; }
    catch { return []; }
  }
  function saveChat(history) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-60)));
  }
  function clearChat() { localStorage.removeItem(CHAT_KEY); }

  function exportAll() {
    return JSON.stringify({ data, settings: getSettings(), chat: getChat() }, null, 2);
  }
  function importAll(json) {
    const obj = JSON.parse(json);
    if (obj.data) { data = Object.assign(blank(), obj.data); save(); }
    if (obj.settings) saveSettings(obj.settings);
    if (obj.chat) saveChat(obj.chat);
  }

  return {
    todayStr,
    addTask, updateTask, deleteTask, listTasks,
    addEvent, deleteEvent, listEvents,
    addNote, deleteNote, listNotes,
    addHabit, deleteHabit, logHabit, listHabits, habitStreak,
    getSettings, saveSettings,
    getChat, saveChat, clearChat,
    exportAll, importAll,
  };
})();
