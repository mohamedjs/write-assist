# WriteAssist – free Grammarly-style Chrome extension

Works in any text box on any site: Gmail, Outlook, WhatsApp Web, Slack, Telegram Web, LinkedIn, Discord, Messenger, plain forms…

## What it does

| Feature | How | Cost |
|---|---|---|
| Red/orange/blue underlines for spelling, grammar and style, with a click-to-fix card | LanguageTool public API | Free, no key (about 20 checks/min) |
| Badge in the corner of the text box that shows the issue count, plus **Accept all** | — | — |
| ✨ **AI fix** (rewrites the whole message correctly) | Chrome built-in Gemini Nano → OpenRouter (your key + any model) → free Gemini API key | Free / your OpenRouter credits |
| **Fix by sentence**: AI checks each sentence and shows before → after, with Fix / Accept all. Also **✨ Fix sentence** on every underline card | Same AI | Free |
| **Rewrite**: clearer, professional, formal, friendly, shorter, confident, expand | Same AI | Free |
| **Reply suggestions**: 3 options for emails and chats; it reads the last message on Gmail, WhatsApp, Slack and Telegram | Same AI | Free |
| **Translate**: write in Arabic, translate to English, then Replace | Chrome Translator API → Google Translate free endpoint | Free |
| Selection toolbar on any page: Translate, Fix, Rewrite, Reply | — | — |
| Right-click menu, personal dictionary, turn off per site | — | — |

Shortcuts: `Alt+Shift+G` opens the panel. `Alt+Shift+F` runs an AI fix on the whole text box. `Alt+Shift+S` fixes only the sentence your cursor is in. You can change them at `chrome://extensions/shortcuts`.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `write-assist` folder.
4. Pin the **W** icon. Open the popup and either:
   - click **Download on-device AI model** (Chrome 138+ on a capable Mac/PC; one-time download of a few GB), or
   - paste a **free Gemini API key** from https://aistudio.google.com/apikey (works on any machine).
5. Reload any tabs that were already open.

The grammar check works right away with nothing to set up.

### Use OpenRouter

1. Create a key at https://openrouter.ai/settings/keys.
2. In the popup → **AI**, paste it in **OpenRouter → API key**.
3. Click the **Model** box and pick any model (tick **Show free models only** for `:free` models), or type a model id like `anthropic/claude-sonnet-4.5`.
4. Set **Engine** to **OpenRouter only**, or leave **Auto** (on-device → OpenRouter → Gemini).
5. Press **Test AI** in Diagnostics to check it.

## If on-device AI shows "not available"

- Update Chrome (138 or newer).
- Check `chrome://on-device-internals` to see whether your hardware is supported (it needs about 22 GB of free disk space and a GPU with more than 4 GB VRAM, or 16 GB RAM).
- Or use the Gemini key. The free tier is plenty for personal use.

## Privacy

- Text you type is sent to LanguageTool (api.languagetool.org) for grammar checking. You can point it at your own LanguageTool server in **Advanced**.
- On-device AI never leaves your computer. The Gemini API and Google Translate send the text to Google.
- To skip sensitive sites, turn them off with the site switch in the popup. Password fields are never touched.

## Files

```
manifest.json
src/background.js        service worker: LanguageTool, Gemini API, Google Translate, routing
src/offscreen.*          runs Chrome built-in AI (Prompt / Translator / LanguageDetector APIs)
src/content/textmap.js   text ↔ DOM mapping for textarea / contenteditable, safe text replacement
src/content/content.js   underlines, suggestion card, panel, selection toolbar
popup/                   settings popup (also the options page)
```
