// LLM provider adapters. Each one speaks its provider's wire format but
// presents the same interface to the app:
//
//   chat({system, history, tools, settings}) -> {text, toolCalls: [{id, name, args}]}
//
// Neutral history entries:
//   {role:'user', text}
//   {role:'assistant', text, toolCalls:[{id,name,args}]}
//   {role:'tool', results:[{id,name,result}]}   // result is any JSON value
//
// All three providers support CORS from the browser, so the app needs no server.

const Providers = (() => {

  async function postJSON(url, headers, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch { detail = await res.text(); }
      throw new Error(`${res.status} ${res.statusText}: ${detail.slice(0, 400)}`);
    }
    return res.json();
  }

  // ---------------- Google Gemini (free tier via AI Studio key) ----------------
  const gemini = {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    defaultModel: 'gemini-2.5-flash',
    keyHint: 'AI Studio API key — free at aistudio.google.com/apikey',

    async chat({ system, history, tools, settings }) {
      const contents = history.map(m => {
        if (m.role === 'user') return { role: 'user', parts: [{ text: m.text }] };
        if (m.role === 'assistant') {
          const parts = [];
          if (m.text) parts.push({ text: m.text });
          (m.toolCalls || []).forEach(c => parts.push({ functionCall: { name: c.name, args: c.args } }));
          return { role: 'model', parts };
        }
        // tool results
        return {
          role: 'user',
          parts: m.results.map(r => ({
            functionResponse: { name: r.name, response: { result: r.result } },
          })),
        };
      });

      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{
          functionDeclarations: tools.map(t => ({
            name: t.name, description: t.description, parameters: t.parameters,
          })),
        }],
      };

      const model = settings.model || this.defaultModel;
      const data = await postJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { 'x-goog-api-key': settings.apiKey },
        body,
      );

      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => p.text).map(p => p.text).join('');
      const toolCalls = parts.filter(p => p.functionCall).map((p, i) => ({
        id: `call_${i}`, name: p.functionCall.name, args: p.functionCall.args || {},
      }));
      return { text, toolCalls };
    },
  };

  // ---------------- OpenRouter (free community models) ----------------
  const openrouter = {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    keyHint: 'Key from openrouter.ai/keys — pick any model ending in ":free"',

    async chat({ system, history, tools, settings }) {
      const messages = [{ role: 'system', content: system }];
      history.forEach(m => {
        if (m.role === 'user') messages.push({ role: 'user', content: m.text });
        else if (m.role === 'assistant') {
          const msg = { role: 'assistant', content: m.text || null };
          if (m.toolCalls?.length) {
            msg.tool_calls = m.toolCalls.map(c => ({
              id: c.id, type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            }));
          }
          messages.push(msg);
        } else {
          m.results.forEach(r => messages.push({
            role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.result),
          }));
        }
      });

      const data = await postJSON('https://openrouter.ai/api/v1/chat/completions', {
        authorization: `Bearer ${settings.apiKey}`,
        'x-title': 'Personal Assistant PWA',
      }, {
        model: settings.model || this.defaultModel,
        messages,
        tools: tools.map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      });

      const msg = data.choices?.[0]?.message || {};
      const toolCalls = (msg.tool_calls || []).map(c => ({
        id: c.id,
        name: c.function.name,
        args: safeParse(c.function.arguments),
      }));
      return { text: msg.content || '', toolCalls };
    },
  };

  // ---------------- Anthropic Claude (paid API key) ----------------
  const anthropic = {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-opus-4-8',
    keyHint: 'API key from platform.claude.com (paid)',

    async chat({ system, history, tools, settings }) {
      const messages = history.map(m => {
        if (m.role === 'user') return { role: 'user', content: m.text };
        if (m.role === 'assistant') {
          const content = [];
          if (m.text) content.push({ type: 'text', text: m.text });
          (m.toolCalls || []).forEach(c => content.push({
            type: 'tool_use', id: c.id, name: c.name, input: c.args,
          }));
          return { role: 'assistant', content };
        }
        return {
          role: 'user',
          content: m.results.map(r => ({
            type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result),
          })),
        };
      });

      const data = await postJSON('https://api.anthropic.com/v1/messages', {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for browser-direct calls; fine for a single-user app where
        // the key lives only on this device.
        'anthropic-dangerous-direct-browser-access': 'true',
      }, {
        model: settings.model || this.defaultModel,
        max_tokens: 8192,
        system,
        messages,
        tools: tools.map(t => ({
          name: t.name, description: t.description, input_schema: t.parameters,
        })),
      });

      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const toolCalls = data.content.filter(b => b.type === 'tool_use').map(b => ({
        id: b.id, name: b.name, args: b.input || {},
      }));
      return { text, toolCalls };
    },
  };

  function safeParse(s) {
    try { return JSON.parse(s || '{}'); } catch { return {}; }
  }

  const all = { gemini, openrouter, anthropic };
  return { all, get: id => all[id] || gemini };
})();
