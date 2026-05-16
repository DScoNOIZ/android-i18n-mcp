# 🚀 Android i18n MCP Server — AI-Enhanced Edition

> ⚠️ **AI-ENHANCED CODE — REQUIRES EXPERT REVIEW BEFORE PRODUCTION USE**
> 
> This fork was substantially improved by AI (Roo Code / LLM assistant). All changes must be reviewed by human specialists.

---

## 🎯 What's Different from Original [realskyrin/android-i18n-mcp](https://github.com/realskyrin/android-i18n-mcp)?

This is **not just a fork** — it's a **complete transformation** from a basic MCP server to a **production-ready enterprise solution**.

### ⚡ Quick Comparison

| Feature | Original | This Fork |
|---------|----------|-----------|
| **MCP Tools** | 1 basic tool | **7 tools** with Zod validation |
| **AI Providers** | 1 (OpenAI) | **4** (OpenAI, DeepSeek, Anthropic, Google) |
| **Languages** | Hardcoded | **28** with validation |
| **Tests** | None / Broken | **150+ tests**, **99.7% coverage** |
| **Bug Fixes** | 23+ known bugs | **All 23+ fixed** |
| **Security** | Basic | **Path traversal + XSS + Input validation** |
| **Progress** | 0% → 100% instant | **Smooth real-time 1-100%** |
| **Job Management** | Lost on restart | **Persistent with timeout** |
| **Documentation** | English only | **EN + RU + ZH** |
| **XML Validation** | None | **Full validation + Corruption detection** |
| **Source Language** | Hardcoded `en` | **Configurable** |

---

## 🏆 Major Improvements at a Glance

### 🔧 23+ Critical Bug Fixes
- Incorrect file paths in translations
- XML crash handling
- Progress tracking (now smooth 1-100%)
- Job persistence across restarts
- And many more...

### 🔒 Security Hardening
- Path traversal attack prevention
- XSS protection in error messages
- Input validation with Zod schemas
- File filter sanitization

### 🆕 7 New MCP Tools
1. **translate_all_modules** — Translate all strings.xml in project
2. **translate_module** — Translate specific module
3. **check_changes** — Detect uncommitted changes
4. **check_missing_languages** — Find missing language directories
5. **create_and_translate_missing_languages** — Create + translate in one operation
6. **get_job_status** — Check background job progress
7. **configure_logging** — Enable/disable file logging

### 🧪 150+ Tests (99.7% Coverage)
- Unit tests for all modules
- Integration tests with real file operations
- E2E tests (12 scenarios)
- Regression tests for all 23 bugs
- Benchmark tests for performance

### 📊 New Features
- **Real-time progress tracking** — See translation progress as it happens
- **Job persistence** — Jobs survive server restarts
- **Connectivity check** — Verify API before translation
- **Force update mode** — Re-translate existing translations
- **Multi-module support** — Process multiple Android modules
- **Configurable source language** — Not just English

---

## 📖 Full Documentation

- [CONTRIBUTIONS.md](CONTRIBUTIONS.md) — Detailed improvements (English)
- [CONTRIBUTIONS-RU.md](CONTRIBUTIONS-RU.md) — Detailed improvements (Russian)

---

## 📈 Statistics

| Metric | Value |
|--------|-------|
| Commits | 72+ |
| Files Changed | 96 |
| Lines Added | +16,108 |
| Lines Removed | -1,549 |
| Tests Added | 150+ |
| Coverage | 99.7%+ |

---

## 🚀 Quick Start

```bash
# Clone this enhanced fork
git clone https://github.com/DScoNOIZ/android-i18n-mcp.git
cd android-i18n-mcp

npm install && npm run build
cp .env.example .env
# Edit .env with your API key
```

---

## ⚠️ Disclaimer

This code was substantially enhanced by AI. **Please review carefully before production deployment.**

See [CONTRIBUTIONS.md](CONTRIBUTIONS.md) for full details.

---

*Enhanced by [@DScoNOIZ](https://github.com/DScoNOIZ) | Original by [@realskyrin](https://github.com/realskyrin)*

---

<div align="right">
  <a href="README.md">Full English Documentation</a> |
  <a href="README-RU.md">Русская документация</a> |
  <a href="README-ZH.md">中文文档</a>
</div>

---

<details>
<summary>📋 Original README (click to expand)</summary>

# Android i18n MCP Server

<div align="right">
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README.md">English</a> |
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-ZH.md">中文</a> |
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-RU.md">Русский</a>
</div>

An MCP (Model Context Protocol) server that automatically translates Android app string resources to multiple languages by detecting changes in the default `strings.xml` files using Git diff.

📖 [Project Introduction Article](https://juejin.cn/post/7549032025673662514) (Chinese)

## Screenshots

<div align="center">
  <img src="imgs/9548ffd0aeeebf8617bd116f6e82c3a7.png" alt="Batch Generation of Multi-language Files" width="100%"/>
  <p><em>Generate multiple language files in one go, batch translation at scale for improved efficiency</em></p>
</div>

<div align="center">
  <img src="imgs/f8c5cc563a3df28ecfaeda97011d0dbe.png" alt="MCP Tool Execution" width="100%"/>
  <p><em>MCP tool automatically detecting and translating missing languages</em></p>
</div>

## Features

- Automatically detects new or modified strings in default `strings.xml` files using Git diff
- Translates to up to 28 languages (configurable via environment variable)
- Preserves Android string formatting placeholders (%s, %d, %1$s, etc.)
- Supports multiple Android modules
- Batch translation for better performance
- Only translates changed strings to save API costs
- Configurable language selection to optimize API usage

## Supported Languages

The server supports translation to 28 languages. You can configure which languages to translate to using the `TRANSLATION_LANGUAGES` environment variable.

> **Note on Chinese locale format:** Chinese locales use Android's region suffix format with `r` prefix (e.g., `zh-CN` → `values-zh-rCN`). This is required by Android for region-specific resources.

### All Supported Languages:

- `zh-CN` - Simplified Chinese (values-zh-rCN)
- `zh-TW` - Traditional Chinese Taiwan (values-zh-rTW)
- `zh-SG` - Traditional Chinese Singapore (values-zh-rSG)
- `zh-HK` - Traditional Chinese Hong Kong (values-zh-rHK)
- `zh-MO` - Traditional Chinese Macau (values-zh-rMO)
- `en` - English (values-en)
- `es` - Spanish (values-es)
- `hi` - Hindi (values-hi)
- `fr` - French (values-fr)
- `ar` - Arabic (values-ar)
- `bn` - Bengali (values-bn)
- `pt` - Portuguese (values-pt)
- `ru` - Russian (values-ru)
- `ur` - Urdu (values-ur)
- `id` - Indonesian (values-id)
- `de` - German (values-de)
- `ja` - Japanese (values-ja)
- `sw` - Swahili (values-sw)
- `mr` - Marathi (values-mr)
- `te` - Telugu (values-te)
- `tr` - Turkish (values-tr)
- `ko` - Korean (values-ko)
- `ta` - Tamil (values-ta)
- `vi` - Vietnamese (values-vi)
- `az` - Azerbaijani (values-az)
- `be` - Belarusian (values-be)
- `it` - Italian (values-it)
- `uk` - Ukrainian (values-uk)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd android-i18n-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```env
ANDROID_PROJECT_ROOT=/path/to/your/android/project
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=your_api_key_here
# Optional:
TRANSLATION_API_BASE_URL=https://api.openai.com/v1
TRANSLATION_MODEL=gpt-4o-mini
# Comma-separated list of languages to translate (optional, defaults to all 28 languages)
TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
# Source language setting (optional, defaults to 'en'. If your default strings.xml uses another language like Chinese, set it to 'zh-CN')
TRANSLATOR_SOURCE_LANGUAGE=en
```

## MCP Configuration

### Add this server to your MCP client configuration (e.g., Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "android-i18n": {
      "command": "node",
      "args": ["/path/to/android-i18n-mcp/build/index.js"],
      "env": {
        "ANDROID_PROJECT_ROOT": "/path/to/your/android/project",
        "TRANSLATION_PROVIDER": "openai",
        "TRANSLATION_API_BASE_URL": "https://api.deepseek.com/v1",
        "TRANSLATION_API_KEY": "your_api_key_here",
        "TRANSLATION_LANGUAGES": "zh-CN,es,fr,de",  // Optional: specific languages
        "TRANSLATOR_SOURCE_LANGUAGE": "en"  // Optional: source language (default: en)
      }
    }
  }
}
```

### Codx Configuration Example

Add the following to your `codx.toml`:

```toml
[mcp_servers.android-i18n]
command = "node"
args = ["/path/to/android-i18n-mcp/build/index.js"]

[mcp_servers.android-i18n.env]
ANDROID_PROJECT_ROOT = "/path/to/android/project"
TRANSLATION_PROVIDER = "deepseek"
TRANSLATION_API_BASE_URL = "https://api.deepseek.com/v1"
TRANSLATION_API_KEY = "sk-xxxxxx"
TRANSLATION_MODEL = "deepseek-chat"
TRANSLATION_LANGUAGES = "zh-CN,es,fr,de,ja,ko"  # Optional: specific languages
TRANSLATOR_SOURCE_LANGUAGE = "en"  # Optional: source language (default: en)
```

## Configuration System

### Configuration Priority (HIGH → LOW)

```
1. MCP call parameters (languages param)     ← HIGHEST PRIORITY
2. mcp_settings.json env variables           ← MCP Server reads these
3. .env file                                  ← Only if mcp_settings.json not set
4. Internal defaults (all 28 languages)       ← LOWEST PRIORITY
```

### How It Works

When you call an MCP tool with `languages: ["es", "fr"]`, those languages override any `.env` settings. If no `languages` param is provided, the tool uses `TRANSLATION_LANGUAGES` from the environment (either from mcp_settings.json or .env file).

```typescript
// MCP tool logic (src/index.ts)
const languages = args.languages?.length ? args.languages : TRANSLATION_LANGUAGES;
//              ↑ if languages param provided → use it
//                           ↑ otherwise → use env variable (from .env or mcp_settings.json)
```

### Configuration Sources Explained

| Source | Location | How It Works | Priority |
|--------|----------|--------------|----------|
| **MCP Settings** | `~/.config/Code/User/globalStorage/.../mcp_settings.json` | JSON `env` block passed to server process | 1st (highest) |
| **.env file** | Project root `.env` | Read by `dotenv.config()` at server startup | 2nd |
| **MCP call param** | `languages: ["es", "fr"]` in tool call | Passed directly to tool handler | Override (highest) |

### Debugging Configuration

When the server starts, it logs the configuration source:
```
Config loaded from: env (.env or mcp_settings)  ← Normal MCP mode
Config loaded from: env                         ← Test mode (NODE_ENV=test)
Config loaded from: defaults                    ← No TRANSLATION_LANGUAGES set
```

To verify your configuration:
```bash
# Check mcp_settings.json
cat ~/.config/Code/User/globalStorage/.../mcp_settings.json | grep -A5 '"i18n"'

# Check .env
cat .env | grep TRANSLATION_LANGUAGES
```

## Agent Instruction

You can configure AGENTS.md or CLAUDE.md to have the Agent automatically call MCP when strings.xml files are modified:

```markdown
## Copy res update Guidelines
- Whenever a strings.xml file is modified, run android-i18n mcp to check and update copy.
```

## Available Tools

### 1. `translate_all_modules`
Detects changes in all default strings.xml files across all modules and translates them to all supported languages.

**Parameters:**
- `projectRoot` (optional): Android project root directory. Uses `ANDROID_PROJECT_ROOT` env var if not provided.
- `languages` (optional): Array of target language codes. Overrides `TRANSLATION_LANGUAGES` env var.
- `fileFilter` (optional): Glob pattern to filter files (e.g., `**/values/strings.xml`).

**Example:**
```json
{
  "tool": "translate_all_modules",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 2. `translate_module`
Detects changes in a specific module's default strings.xml and translates to all languages.

**Parameters:**
- `modulePath` (required): Path to the Android module directory
- `languages` (optional): Array of target language codes. Overrides `TRANSLATION_LANGUAGES` env var.
- `fileFilter` (optional): Glob pattern to filter files.
- `projectRoot` (optional): Android project root directory.

**Example:**
```json
{
  "tool": "translate_module",
  "arguments": {
    "modulePath": "/path/to/android/project/app"
  }
}
```

### 3. `check_changes`
Checks for uncommitted changes in default strings.xml files without performing translation.

**Parameters:**
- `projectRoot` (optional): Android project root directory.
- `fileFilter` (optional): Glob pattern to filter files.

**Example:**
```json
{
  "tool": "check_changes",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 4. `check_missing_languages`
Checks which language directories are missing compared to the configured TRANSLATION_LANGUAGES environment variable.

**Parameters:**
- `projectRoot` (optional): Android project root directory.
- `languages` (optional): Array of language codes to check. Defaults to `TRANSLATION_LANGUAGES` env var.
- `fileFilter` (optional): Glob pattern to filter files.

**Example:**
```json
{
  "tool": "check_missing_languages",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 5. `create_and_translate_missing_languages`
Creates missing language directories and translates the default strings.xml into them for all configured languages.

**Parameters:**
- `projectRoot` (optional): Android project root directory.
- `languages` (optional): Array of language codes to create and translate. Defaults to `TRANSLATION_LANGUAGES` env var.
- `fileFilter` (optional): Glob pattern to filter files.

**Example:**
```json
{
  "tool": "create_and_translate_missing_languages",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

## How It Works

1. **Change Detection**: The server uses Git diff to detect which strings have been added or modified in the default `values/strings.xml` files since the last commit.

2. **Batch Translation**: Changed strings are translated in batches to the target language using the configured AI translation API.

3. **XML Merging**: Translated strings are merged into the existing language-specific `strings.xml` files, preserving existing translations and only updating changed ones.

4. **Module Support**: The server can process multiple Android modules in a single operation, detecting all `strings.xml` files matching the pattern `**/src/main/res/values/strings.xml`.

## Translation Providers

Currently supported:
- **OpenAI** (including OpenAI-compatible APIs)
- **DeepSeek** (automatically uses api.deepseek.com endpoint)


### DeepSeek Configuration Example:
```env
TRANSLATION_PROVIDER=deepseek
TRANSLATION_API_KEY=your_deepseek_api_key
# Optional: defaults to deepseek-chat
TRANSLATION_MODEL=deepseek-chat
# Optional: specific languages to translate (defaults to all 28)
TRANSLATION_LANGUAGES=zh-CN,en,es,fr,de,ja,ko
# Optional: source language (defaults to 'en')
TRANSLATOR_SOURCE_LANGUAGE=en
```

## Configuration Options

### Language Selection

You can configure which languages to translate to using the `TRANSLATION_LANGUAGES` environment variable:

- **Translate to all 28 supported languages (default):**
  ```env
  # Don't set TRANSLATION_LANGUAGES or leave it empty
  ```

- **Translate to specific languages only:**
  ```env
  TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
  ```

- **Single language:**
  ```env
  TRANSLATION_LANGUAGES=zh-CN
  ```

**Note:** If you specify languages that are not supported, the server will:
1. Show a warning listing the unsupported languages
2. Display all supported languages for reference
3. Continue with only the valid languages from your configuration

### Source Language Configuration

By default, the server assumes your default `values/strings.xml` file uses English (`en`). If your project uses a different language as the default (e.g., Chinese), you need to configure the source language:

**Scenario 1: Default strings.xml uses English (no configuration needed)**
```env
# Don't set TRANSLATOR_SOURCE_LANGUAGE, defaults to 'en'
```

**Scenario 2: Default strings.xml uses Chinese**
```env
TRANSLATOR_SOURCE_LANGUAGE=zh-CN
```

**Scenario 3: Using other languages as default**
```env
# Any supported language code
TRANSLATOR_SOURCE_LANGUAGE=es  # Spanish
TRANSLATOR_SOURCE_LANGUAGE=fr  # French
TRANSLATOR_SOURCE_LANGUAGE=ja  # Japanese
# etc...
```

**Important Notes:**
- Correct source language configuration ensures translation quality and accuracy
- Incorrect source language configuration may lead to translation failures or incorrect results
- When the target language matches the source language, text will be copied directly without translation
- Translation validation logic automatically adjusts based on the source language to avoid false untranslated warnings

## Development

Run in development mode with hot reload:

```bash
npm run dev
```

Build the project:

```bash
npm run build
```

Run tests:

```bash
npm test
npm run test:coverage
```

## Project Structure

```
android-i18n-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── xmlParser.ts       # Android strings.xml parsing
│   ├── gitDiff.ts         # Git diff analysis
│   ├── translator.ts      # Translation API integration
│   └── translationManager.ts # Translation orchestration
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Notes

- The server only translates strings that have `translatable` attribute not set to `false`
- Deleted strings are automatically removed from translated files
- Translation preserves Android formatting placeholders
- All file operations are atomic - if translation fails for any language, no files are modified

## Real Integration Tests

The project includes **real integration tests** (no mocks) that test actual file system operations:

### Location
- `tests/integration/*.real.test.ts` - Real file system integration tests

### What They Test
- Actual XML parsing and generation
- Real file system operations (create/read/update `strings.xml`)
- End-to-end translation workflows with actual files
- Module detection in real Android project structures

### Running Integration Tests
```bash
# Run all integration tests (requires real Android project structure)
npm run test:integration

# Run specific integration test
npx jest tests/integration/translateModule.real.test.ts
```

### Mock Translation Mode
For unit tests, a mock translation mode is available:
```bash
# Enable mock translation (set in jest.setup.js)
TRANSLATION_MOCK=true
```

This allows testing translation logic without API calls.

## Bug Fixes History

### BUG-001: translateModule() Missing File Handling ✅ FIXED
**Problem:** `translateModule()` failed when target translation file didn't exist.

**Solution:** Now checks if target file exists, loads ALL strings if missing (instead of only changed strings via Git diff).

**Impact:** Enables translation of newly created language directories.

---

### BUG-002: translateLanguage() Error Handling ✅ FIXED
**Problem:** `translateLanguage()` threw errors directly, causing MCP tool to crash.

**Solution:** Now returns errors in `result.errors` array instead of throwing exceptions.

**Impact:** Better error reporting and graceful failure handling.

---

### BUG-003: validateFileFilter() Regex Pattern ✅ FIXED
**Problem:** `validateFileFilter()` regex didn't match `values-ru` style folders correctly.

**Solution:** Updated regex pattern to properly match Android resource folder naming conventions.

**Impact:** Correct file filtering for all language variants.

---

## E2E Tests

End-to-end tests (`tests/e2e/run_tests.py`) now validate all 3 bug fixes above.

## License

MIT

</details>
