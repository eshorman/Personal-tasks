# Day Pilot

A single-user personal assistant app for your day — tasks, schedule, notes, habits, and a built-in AI assistant that can manage all of it for you. Built as a PWA (Progressive Web App) so it installs on a Pixel straight from the browser: no Play Store, no APK, no build step, no server.

All data lives in your phone's local storage. Nothing is sent anywhere except your chat messages to the AI provider you configure.

## Install on your phone (one-time, ~3 minutes)

1. **Turn on hosting** (one click): in this repo on GitHub go to **Settings → Pages → Source: GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) deploys the app automatically on every push.
2. Wait for the "Deploy to GitHub Pages" action to finish, then open the URL it prints (it'll look like `https://<your-username>.github.io/Personal-tasks/`) in Chrome on your Pixel.
3. Chrome will offer **"Add to Home screen" / "Install app"** (also in the ⋮ menu). Tap it. The app now opens full-screen from your home screen like a native app, and works offline.

## Hook up the AI (free)

The assistant tab needs an LLM API key. The recommended free option:

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a key — **Google's Gemini free tier costs nothing** and the default model (`gemini-2.5-flash`) supports the tool calling this app uses.
2. In the app, tap **⚙︎ → AI provider: Google Gemini → paste key → Save**.
3. Try: *"plan my afternoon"*, *"add buy milk to my tasks, due Friday"*, *"how am I doing on my habits?"*

The assistant has full tool access to the app: it can add/complete/reschedule tasks, block time on your plan, save notes, and log habits.

### Other providers

| Provider | Cost | Notes |
|---|---|---|
| **Google Gemini** (default) | Free tier | Best free option, generous limits |
| **OpenRouter** | Free models available | Key from openrouter.ai; pick any model ending in `:free` |
| **Anthropic Claude** | Paid | Uses `claude-opus-4-8`; key from platform.claude.com |

Keys are stored only in your phone's local storage and sent only to the provider you chose.

## Architecture (for future me / future agents)

```
index.html        app shell, 5 screens + settings sheet
css/style.css     dark mobile-first styling
js/store.js       localStorage data layer (tasks/events/notes/habits/settings/chat)
js/tools.js       the LLM hook: tool schemas + executors over the store
js/providers.js   provider adapters (Gemini / OpenRouter / Anthropic), one chat() interface
js/assistant.js   the agent loop: model -> tool calls -> execute -> feed back -> repeat
js/app.js         UI wiring
sw.js             offline cache (app shell)
```

Adding a new LLM provider = one new adapter object in `js/providers.js` implementing `chat({system, history, tools, settings})`. Adding a new assistant capability = one entry in `js/tools.js` (`defs` + `execute`).

## Data backup

Settings → Export downloads a JSON backup; Import restores it. Useful if you switch phones, since everything is device-local.
