// The tool surface exposed to the LLM / agent. This is the "hook":
// any model with function calling can drive the whole app through these.
// Schemas use plain JSON Schema; provider adapters translate as needed.

const AgentTools = (() => {

  const defs = [
    {
      name: 'get_overview',
      description: 'Get a snapshot of today: date, open tasks, today\'s schedule, habits and their status. Call this first when the user asks about their day.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'add_task',
      description: 'Add a to-do task. Use a short imperative title.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          due: { type: 'string', description: 'Optional due date, YYYY-MM-DD' },
        },
        required: ['title'],
      },
    },
    {
      name: 'list_tasks',
      description: 'List tasks. filter: "open" (default), "done", "today", or "all".',
      parameters: {
        type: 'object',
        properties: { filter: { type: 'string', description: 'open | done | today | all' } },
        required: [],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark a task done (or not done) by its id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id from list_tasks/get_overview' },
          done: { type: 'boolean', description: 'true to complete, false to reopen. Default true.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_task',
      description: 'Rename a task or change its due date.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          due: { type: 'string', description: 'YYYY-MM-DD, or empty string to clear' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_task',
      description: 'Delete a task permanently.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'add_event',
      description: 'Add an event / time block to the schedule.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          start: { type: 'string', description: 'HH:MM 24h, optional' },
          end: { type: 'string', description: 'HH:MM 24h, optional' },
        },
        required: ['title', 'date'],
      },
    },
    {
      name: 'list_events',
      description: 'List schedule events, optionally for one date.',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'YYYY-MM-DD; omit for all' } },
        required: [],
      },
    },
    {
      name: 'delete_event',
      description: 'Delete an event by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'add_note',
      description: 'Save a free-form note for the user.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    {
      name: 'list_notes',
      description: 'List saved notes (newest first).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'add_habit',
      description: 'Create a daily habit to track.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
    {
      name: 'log_habit',
      description: 'Mark a habit done (or undone) for a date.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Habit id from get_overview' },
          date: { type: 'string', description: 'YYYY-MM-DD, default today' },
          done: { type: 'boolean', description: 'default true' },
        },
        required: ['id'],
      },
    },
  ];

  function overview() {
    const today = Store.todayStr();
    return {
      date: today,
      weekday: new Date().toLocaleDateString(undefined, { weekday: 'long' }),
      time: new Date().toTimeString().slice(0, 5),
      open_tasks: Store.listTasks('open').map(t => ({ id: t.id, title: t.title, due: t.due })),
      todays_events: Store.listEvents(today).map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end })),
      habits: Store.listHabits().map(h => ({
        id: h.id, name: h.name,
        done_today: !!h.log[today],
        streak: Store.habitStreak(h),
      })),
    };
  }

  // Execute a tool call coming back from the model. Always returns a JSON-able value.
  function execute(name, args = {}) {
    try {
      switch (name) {
        case 'get_overview': return overview();
        case 'add_task': return Store.addTask(args.title, args.due || null);
        case 'list_tasks': return Store.listTasks(args.filter || 'open');
        case 'complete_task': return Store.updateTask(args.id, { done: args.done !== false }) || { error: 'task not found' };
        case 'update_task': {
          const patch = {};
          if (args.title !== undefined) patch.title = args.title;
          if (args.due !== undefined) patch.due = args.due || null;
          return Store.updateTask(args.id, patch) || { error: 'task not found' };
        }
        case 'delete_task': Store.deleteTask(args.id); return { ok: true };
        case 'add_event': return Store.addEvent(args.title, args.date, args.start || null, args.end || null);
        case 'list_events': return Store.listEvents(args.date || null);
        case 'delete_event': Store.deleteEvent(args.id); return { ok: true };
        case 'add_note': return Store.addNote(args.text);
        case 'list_notes': return Store.listNotes().map(n => ({ id: n.id, text: n.text }));
        case 'add_habit': return Store.addHabit(args.name);
        case 'log_habit': return Store.logHabit(args.id, args.date || Store.todayStr(), args.done !== false) || { error: 'habit not found' };
        default: return { error: `unknown tool: ${name}` };
      }
    } catch (err) {
      return { error: String(err) };
    }
  }

  function systemPrompt() {
    const o = overview();
    return [
      'You are the user\'s personal assistant inside their day-planner app.',
      'You manage their tasks, schedule, notes and habits via the provided tools.',
      'Be brief and practical. When the user asks you to do something, do it with tools, then confirm in one or two sentences.',
      'When referring to tasks/events/habits, use their titles, not their ids.',
      `Current snapshot: ${JSON.stringify(o)}`,
    ].join('\n');
  }

  return { defs, execute, systemPrompt };
})();
