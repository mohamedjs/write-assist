# WriteAssist

> **Free, privacy-friendly AI writing, grammar, rewrite, and translation assistant.**  
> Available as a native desktop application for **Linux, macOS, and Windows**, and as a **browser extension** for Chrome, Edge, Brave, and other Chromium browsers.

🌐 **Landing Page & Downloads:** [https://mohamedjs.github.io/write-assist/](https://mohamedjs.github.io/write-assist/)

---

## ⚡ Key Capabilities

| Feature | How | Cost |
|---|---|---|
| **Real-time Grammar & Spellcheck** | LanguageTool public API (or custom self-hosted server) with click-to-fix suggestions and one-click *Accept All* | Free, no key needed |
| **AI Rewrite** | Professional, Casual/Friendly, Formal, Concise, Confident, or Expand tones | Free Gemini API key or OpenRouter |
| **Fix by Sentence** | Checks and corrects individual sentences at the cursor | Free / OpenRouter |
| **Smart Reply Generator** | 3 contextual response alternatives for emails and chats | Free / OpenRouter |
| **Bilingual Translation** | Seamless Arabic ↔ English translation plus multilingual support | Free Google Translate API |
| **Personal Dictionary** | Never mark your technical terms, names, or brand words as typos | Stored locally |
| **100% Privacy-First** | No telemetry, no selling text, customizable endpoints | Free & Open Source |

---

## 📦 Multi-OS Releases

Every release builds automated installers for all platforms:

- **Windows:** `WriteAssist-Setup-1.0.0.exe` (per-user, no admin prompt) and portable `.zip`
- **macOS:** `WriteAssist-1.0.0-macos-arm64.zip` (Apple Silicon M1–M4) and `WriteAssist-1.0.0-macos-x86_64.zip` (Intel)
- **Linux:** `writeassist_1.0.0_amd64.deb` (Debian/Ubuntu with user service and desktop icon) and portable `.tar.gz`
- **Browser Extension:** `writeassist-1.0.0-extension.zip` for Chrome, Edge, Brave, and Chromium browsers

---

## 🖥️ Desktop Application (Linux, macOS, Windows)

The desktop application operates under the **Daemon + Native Window** pattern:

```bash
# Start background daemon (and open dashboard window)
writeassist run

# Run silently in background (systemd / autostart login)
writeassist run --no-window

# Open the desktop dashboard workspace
writeassist dashboard

# Run system diagnostic checks
writeassist doctor

# Check version
writeassist --version
```

### Installation

#### Linux (Debian / Ubuntu)
```bash
sudo apt install ./writeassist_1.0.0_amd64.deb
```

#### macOS (Homebrew)
```bash
brew install --cask mohamedjs/tap/writeassist
```

#### Windows
Run `WriteAssist-Setup-1.0.0.exe` and follow the modern setup wizard.

---

## 🧩 Browser Extension

Works on all websites: Gmail, Outlook, Slack, WhatsApp Web, Telegram Web, LinkedIn, forms, and editors.

### Developer Mode Installation:
1. Open `chrome://extensions` in Chrome, Edge, or Brave.
2. Enable **Developer mode** (top right switch).
3. Click **Load unpacked** and select the `extension/` directory.
4. Pin the **W** icon to your toolbar!

---

## 🏛️ Modular Monolith Architecture

The codebase strictly adheres to the **Layered Modular Monolith DDD Architecture**:

```text
src/writeassist/
├── __init__.py                      # Package metadata (__version__ = "1.0.0")
├── __main__.py                      # Entrypoint for python -m writeassist
├── app.py                           # CLI router (run, dashboard, window, doctor)
├── bootstrap.py                     # Single Composition Root wiring all modules
├── selftest.py                      # Diagnostic doctor checks
├── shared/                          # Shared kernel (zero dependency on modules)
│   ├── paths.py                     # Per-OS config/data/log directories
│   ├── events.py                    # Typed synchronous in-process EventBus
│   ├── errors.py                    # Structured application errors
│   ├── desktop.py                   # OS autostart & desktop entry registration
│   ├── platform.py                  # Platform flags (Windows, Mac, Linux)
│   └── i18n/                        # Bilingual translations (en.json, ar.json)
└── modules/
    ├── settings/                    # Domain, application service, JSON store adapter
    ├── dictionary/                  # Domain, application service, file store adapter
    ├── assistant/                   # Pure domain, LanguageTool, Gemini, OpenRouter, Translator
    ├── server/                      # HTTP REST API dispatcher & loopback server
    └── dashboard/                   # Web dashboard assets & chromeless native window
```

### Architectural Boundary Guarantees:
1. **Public Boundary Only:** Modules are imported strictly via `writeassist.modules.<name>`, never reaching into internal `.infrastructure` or `.application`.
2. **Strict Inward Dependency:** `infrastructure` → `application` → `domain` (Domain has ZERO I/O).
3. **Single Composition Root:** All wiring occurs solely inside `bootstrap.py`.
4. **Automated Verification:** Verified by AST inspection in `tests/test_architecture.py`.

---

## 🧪 Testing

```bash
# Run all test suites
PYTHONPATH=src:tests python3 tests/run_all.py

# Run architecture boundary tests
PYTHONPATH=src python3 tests/test_architecture.py
```

---

## 📄 License

MIT License. Open source and free for everyone.
