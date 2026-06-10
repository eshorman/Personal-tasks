// The agent loop: send conversation + tools to the configured provider,
// execute any tool calls locally against the Store, feed results back,
// repeat until the model answers in plain text.

const Assistant = (() => {
  const MAX_TOOL_ROUNDS = 8;

  // history (persisted) only keeps user/assistant text for display + context.
  // Tool call exchanges happen within a single send() and are kept in the
  // working copy so the model sees them during the loop.

  async function send(userText, onStatus) {
    const settings = Store.getSettings();
    const provider = Providers.get(settings.provider);
    const cfg = (settings.providers || {})[provider.id] || {};
    if (!cfg.apiKey) {
      throw new Error('No API key configured. Open Settings and add one (Gemini keys are free).');
    }

    const display = Store.getChat(); // [{role:'user'|'assistant', text}]
    const working = display.map(m => ({ role: m.role, text: m.text }));
    working.push({ role: 'user', text: userText });

    display.push({ role: 'user', text: userText });
    Store.saveChat(display);

    const system = AgentTools.systemPrompt();
    let actions = [];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      onStatus?.(round === 0 ? 'Thinking…' : 'Working…');
      const { text, toolCalls } = await provider.chat({
        system,
        history: working,
        tools: AgentTools.defs,
        settings: { apiKey: cfg.apiKey, model: cfg.model },
      });

      if (!toolCalls.length) {
        const finalText = text || '(no response)';
        display.push({ role: 'assistant', text: finalText, actions });
        Store.saveChat(display);
        return { text: finalText, actions };
      }

      working.push({ role: 'assistant', text, toolCalls });
      const results = toolCalls.map(c => {
        onStatus?.(`Running ${c.name}…`);
        const result = AgentTools.execute(c.name, c.args);
        actions.push(describeAction(c));
        return { id: c.id, name: c.name, result };
      });
      working.push({ role: 'tool', results });
    }

    const fallback = 'I hit the tool-call limit for one message — the actions above were applied.';
    display.push({ role: 'assistant', text: fallback, actions });
    Store.saveChat(display);
    return { text: fallback, actions };
  }

  function describeAction(call) {
    const a = call.args || {};
    switch (call.name) {
      case 'add_task': return `Added task: ${a.title}`;
      case 'complete_task': return a.done === false ? 'Reopened a task' : 'Completed a task';
      case 'update_task': return 'Updated a task';
      case 'delete_task': return 'Deleted a task';
      case 'add_event': return `Scheduled: ${a.title} (${a.date}${a.start ? ' ' + a.start : ''})`;
      case 'delete_event': return 'Removed an event';
      case 'add_note': return 'Saved a note';
      case 'add_habit': return `New habit: ${a.name}`;
      case 'log_habit': return 'Logged a habit';
      default: return null; // read-only tools aren't worth surfacing
    }
  }

  return { send };
})();
