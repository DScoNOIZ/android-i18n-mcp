# Android i18n MCP Server

<div align="right">
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README.md">English</a> | 
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-ZH.md">中文</a> |
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-RU.md">Русский</a>
</div>

MCP (Model Context Protocol) сервер для автоматического перевода строковых ресурсов Android-приложений на множество языков. Обнаруживает изменения в файлах `strings.xml` с помощью Git diff.

📖 [Статья с введением в проект](https://juejin.cn/post/7549032025673662514) (на китайском)

## Скриншоты

<div align="center">
  <img src="imgs/9548ffd0aeeebf8617bd116f6e82c3a7.png" alt="Пакетная генерация файлов языков" width="100%"/>
  <p><em>Создание нескольких языковых файлов одним действием, масштабируемый пакетный перевод для повышения эффективности</em></p>
</div>

<div align="center">
  <img src="imgs/f8c5cc563a3df28ecfaeda97011d0dbe.png" alt="Выполнение MCP инструмента" width="100%"/>
  <p><em>MCP инструмент автоматически обнаруживает и переводит отсутствующие языки</em></p>
</div>

## Возможности

- Автоматически обнаруживает новые или измененные строки в файлах `strings.xml` с помощью Git diff
- Переводит на 28 языков (настраивается через переменные окружения)
- Сохраняет форматирование Android-строк (подстановки %s, %d, %1$s и т.д.)
- Поддерживает несколько модулей Android
- Пакетный перевод для повышения производительности
- Переводит только измененные строки для экономии API-запросов
- Настраиваемый выбор языков для оптимизации использования API

## Поддерживаемые языки

Сервер поддерживает перевод на 28 языков. Вы можете настроить целевые языки с помощью переменной окружения `TRANSLATION_LANGUAGES`.

### Все поддерживаемые языки:

- `zh-CN` - Упрощенный китайский (values-zh-rCN)
- `zh-TW` - Традиционный китайский (Тайвань) (values-zh-rTW)
- `zh-SG` - Традиционный китайский (Сингапур) (values-zh-rSG)
- `zh-HK` - Традиционный китайский (Гонконг) (values-zh-rHK)
- `zh-MO` - Традиционный китайский (Макао) (values-zh-rMO)
- `en` - Английский (values-en)
- `es` - Испанский (values-es)
- `hi` - Хинди (values-hi)
- `fr` - Французский (values-fr)
- `ar` - Арабский (values-ar)
- `bn` - Бенгальский (values-bn)
- `pt` - Португальский (values-pt)
- `ru` - Русский (values-ru)
- `ur` - Урду (values-ur)
- `id` - Индонезийский (values-id)
- `de` - Немецкий (values-de)
- `ja` - Японский (values-ja)
- `sw` - Суахили (values-sw)
- `mr` - Маратхи (values-mr)
- `te` - Телугу (values-te)
- `tr` - Турецкий (values-tr)
- `ko` - Корейский (values-ko)
- `ta` - Тамильский (values-ta)
- `vi` - Вьетнамский (values-vi)
- `az` - Азербайджанский (values-az)
- `be` - Белорусский (values-be)
- `it` - Итальянский (values-it)
- `uk` - Украинский (values-uk)

## Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd android-i18n-mcp
```

2. Установите зависимости:
```bash
npm install
```

3. Соберите проект:
```bash
npm run build
```

4. Настройте переменные окружения:
```bash
cp .env.example .env
```

Отредактируйте файл `.env`:
```env
ANDROID_PROJECT_ROOT=/путь/к/вашему/android/project
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=ваш_api_ключ
# Опционально:
TRANSLATION_API_BASE_URL=https://api.openai.com/v1
TRANSLATION_MODEL=gpt-4o-mini
# Список языков через запятую (опционально, по умолчанию все 28 языков)
TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
# Язык исходного кода (опционально, по умолчанию 'en'. Если ваш strings.xml использует другой язык, например китайский, установите 'zh-CN')
TRANSLATOR_SOURCE_LANGUAGE=en
```

## Настройка MCP

### Добавьте этот сервер в конфигурацию вашего MCP-клиента (например, Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "android-i18n": {
      "command": "node",
      "args": ["/путь/к/android-i18n-mcp/build/index.js"],
      "env": {
        "ANDROID_PROJECT_ROOT": "/путь/к/вашему/android/project",
        "TRANSLATION_PROVIDER": "openai",
        "TRANSLATION_API_BASE_URL": "https://api.deepseek.com/v1",
        "TRANSLATION_API_KEY": "ваш_api_ключ",
        "TRANSLATION_LANGUAGES": "zh-CN,es,fr,de",  // Опционально: конкретные языки
        "TRANSLATOR_SOURCE_LANGUAGE": "en"  // Опционально: исходный язык (по умолчанию: en)
      }
    }
  }
}
```

### Пример конфигурации Codx

Добавьте следующее в ваш `codx.toml`:

```toml
[mcp_servers.android-i18n]
command = "node"
args = ["/путь/к/android-i18n-mcp/build/index.js"]

[mcp_servers.android-i18n.env]
ANDROID_PROJECT_ROOT = "/путь/к/project"
TRANSLATION_PROVIDER = "deepseek"
TRANSLATION_API_BASE_URL = "https://api.deepseek.com/v1"
TRANSLATION_API_KEY = "sk-xxxxxx"
TRANSLATION_MODEL = "deepseek-chat"
TRANSLATION_LANGUAGES = "zh-CN,es,fr,de,ja,ko"  # Опционально: конкретные языки
TRANSLATOR_SOURCE_LANGUAGE = "en"  # Опционально: исходный язык (по умолчанию: en)
```

## Инструкция для агента

Вы можете настроить AGENTS.md или CLAUDE.md, чтобы агент автоматически вызывал MCP при изменении файлов strings.xml:

```markdown
## Рекомендации по обновлению ресурсов
- При каждом изменении файла strings.xml запускайте android-i18n mcp для проверки и обновления переводов.
```

## Система конфигурации

### Приоритет конфигурации (ВЫСОКИЙ → НИЗКИЙ)

```
1. Параметры вызова MCP (параметр languages)     ← ВЫСШИЙ ПРИОРИТЕТ
2. Переменные окружения mcp_settings.json        ← MCP сервер читает их
3. Файл .env                                     ← Только если mcp_settings.json не задан
4. Внутренние значения по умолчанию (все 28 языков) ← НИЗШИЙ ПРИОРИТЕТ
```

### Как это работает

Когда вы вызываете MCP-инструмент с `languages: ["es", "fr"]`, эти языки переопределяют любые настройки `.env`. Если параметр `languages` не предоставлен, инструмент использует `TRANSLATION_LANGUAGES` из окружения (либо из mcp_settings.json, либо из файла .env).

```typescript
// Логика MCP инструмента (src/index.ts)
const languages = args.languages?.length ? args.languages : TRANSLATION_LANGUAGES;
//              ↑ если предоставлен параметр languages → используем его
//                           ↑ иначе → используем переменную окружения (из .env или mcp_settings.json)
```

### Источники конфигурации

| Источник | Расположение | Как работает | Приоритет |
|----------|--------------|--------------|-----------|
| **MCP Settings** | `~/.config/Code/User/globalStorage/.../mcp_settings.json` | Блок JSON `env` передается в процесс сервера | 1-й (высший) |
| **Файл .env** | `.env` в корне проекта | Читается через `dotenv.config()` при запуске сервера | 2-й |
| **Параметр вызова MCP** | `languages: ["es", "fr"]` в вызове инструмента | Передается напрямую в обработчик инструмента | Переопределение (высший) |

### Диаграмма потока конфигурации

```
Запуск MCP сервера
       ↓
┌──────────────────────────────────────┐
│ 1. Загрузка переменных из mcp_settings.json │  ← Первый: JSON MCP Settings
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ 2. Загрузка файла .env (dotenv.config()) │  ← Второй: файл .env
│    (только если еще не установлено)          │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ 3. Проверка NODE_ENV === 'test'          │  ← Специальная обработка для тестов
│    - Если test: используем .env напрямую   │
│    - Иначе: показываем "env (.env or mcp_settings)"
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│ 4. Во время вызова MCP инструмента:       │
│    if (предоставлен параметр languages)    │
│       → использовать переданные языки       │
│    else if (TRANSLATION_LANGUAGES в env)   │
│       → использовать значение env           │
│    else                                    │
│       → использовать все 28 поддерживаемых языков
└──────────────────────────────────────┘
```

### Отладка конфигурации

При запуске сервер записывает источник конфигурации:
```
Config loaded from: env (.env or mcp_settings)  ← Нормальный MCP режим
Config loaded from: env                         ← Тестовый режим (NODE_ENV=test)
Config loaded from: defaults                    ← TRANSLATION_LANGUAGES не установлен
```

Проверка вашей конфигурации:
```bash
# Проверить mcp_settings.json
cat ~/.config/Code/User/globalStorage/.../mcp_settings.json | grep -A5 '"i18n"'

# Проверить .env
cat .env | grep TRANSLATION_LANGUAGES
```

## Доступные инструменты

### 1. `translate_all_modules`
Обнаруживает изменения во всех файлах `strings.xml` по умолчанию во всех модулях и переводит их на все поддерживаемые языки.

**Параметры:**
- `projectRoot` (опционально): Корневая директория Android-проекта. Использует переменную `ANDROID_PROJECT_ROOT`, если не предоставлена.
- `languages` (опционально): Список языков для перевода. Переопределяет `TRANSLATION_LANGUAGES`.
- `fileFilter` (опционально): Glob-шаблон для фильтрации файлов.

**Пример:**
```json
{
  "tool": "translate_all_modules",
  "arguments": {
    "projectRoot": "/путь/к/android/project",
    "languages": ["es", "fr", "de"]
  }
}
```

### 2. `translate_module`
Обнаруживает изменения в файле `strings.xml` по умолчанию конкретного модуля и переводит на все языки.

**Параметры:**
- `modulePath` (обязательный): Путь к директории модуля Android
- `languages` (опционально): Список языков для перевода
- `fileFilter` (опционально): Glob-шаблон для фильтрации файлов

**Пример:**
```json
{
  "tool": "translate_module",
  "arguments": {
    "modulePath": "app/src/main/res",
    "projectRoot": "/путь/к/android/project"
  }
}
```

### 3. `check_missing_languages`
Проверяет, каких языковых директорий не хватает по сравнению с настроенной переменной `TRANSLATION_LANGUAGES`.

**Параметры:**
- `projectRoot` (опционально): Корневая директория Android-проекта
- `fileFilter` (опционально): Glob-шаблон для фильтрации файлов

**Пример:**
```json
{
  "tool": "check_missing_languages",
  "arguments": {
    "projectRoot": "/путь/к/android/project"
  }
}
```

### 4. `create_and_translate_missing_languages`
Создает отсутствующие файлы языков и переводит их.

**Параметры:**
- `projectRoot` (опционально): Корневая директория Android-проекта
- `languages` (опционально): Список языков для создания и перевода
- `fileFilter` (опционально): Glob-шаблон для фильтрации файлов

**Пример:**
```json
{
  "tool": "create_and_translate_missing_languages",
  "arguments": {
    "projectRoot": "/путь/к/android/project",
    "languages": ["en", "de", "es"]
  }
}
```

### 5. `check_changes`
Проверяет изменения в файлах `strings.xml` по сравнению с переведенными версиями.

**Параметры:**
- `projectRoot` (опционально): Корневая директория Android-проекта
- `fileFilter` (опционально): Glob-шаблон для фильтрации файлов

**Пример:**
```json
{
  "tool": "check_changes",
  "arguments": {
    "projectRoot": "/путь/к/android/project"
  }
}
```

## Примеры конфигурации провайдеров перевода

### OpenAI (по умолчанию)
```env
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=sk-...
TRANSLATION_MODEL=gpt-4o-mini
```

### DeepSeek
```env
TRANSLATION_PROVIDER=deepseek
TRANSLATION_API_KEY=sk-...
TRANSLATION_API_BASE_URL=https://api.deepseek.com/v1
TRANSLATION_MODEL=deepseek-chat
# Опционально: конкретные языки для перевода (по умолчанию все 28)
TRANSLATION_LANGUAGES=zh-CN,en,es,fr,de,ja,ko
# Опционально: исходный язык (по умолчанию 'en')
TRANSLATOR_SOURCE_LANGUAGE=en
```

### Anthropic (Claude) — Planned
```env
TRANSLATION_PROVIDER=anthropic
TRANSLATION_API_KEY=sk-ant-...
TRANSLATION_MODEL=claude-3-5-sonnet-20241022
```

### Google (через совместимый API) — Planned
```env
TRANSLATION_PROVIDER=google
TRANSLATION_API_KEY=your_google_api_key
TRANSLATION_API_BASE_URL=https://generativelanguage.googleapis.com/v1
```

## Настройка исходного языка

По умолчанию сервер предполагает, что ваш файл `strings.xml` написан на английском (`en`). Если ваш исходный файл использует другой язык, настройте `TRANSLATOR_SOURCE_LANGUAGE`:


- **Перевод на все 28 поддерживаемых языков (по умолчанию):**
  ```env
  # Не устанавливайте TRANSLATION_LANGUAGES или оставьте его пустым
  ```

- **Перевод только на конкретные языки:**
  ```env
  TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
  ```

- **Один язык:**
  ```env
  TRANSLATION_LANGUAGES=zh-CN
  ```

**Сценарий 1: Файл strings.xml по умолчанию использует английский (настройка не требуется)**
```env
# Не устанавливайте TRANSLATOR_SOURCE_LANGUAGE, по умолчанию 'en'
```

**Сценарий 2: Файл strings.xml по умолчанию использует китайский**
```env
TRANSLATOR_SOURCE_LANGUAGE=zh-CN
```

**Сценарий 3: Использование других языков по умолчанию**
```env
# Любой поддерживаемый код языка
TRANSLATOR_SOURCE_LANGUAGE=ja  # для японского
```

**Важные замечания:**
- Правильная настройка исходного языка обеспечивает качество и точность перевода
- Неправильная настройка исходного языка может привести к сбоям перевода или некорректным результатам
- Когда целевой язык совпадает с исходным, текст будет скопирован напрямую без перевода

## Структура проекта

```
android-i18n-mcp/
├── src/
│   ├── index.ts              # Точка входа MCP сервера
│   ├── translationManager.ts # Основная логика перевода
│   ├── translator.ts         # Интеграция с API перевода
│   ├── xmlParser.ts          # Парсинг Android XML
│   ├── gitDiff.ts            # Обнаружение изменений через Git
│   └── *.test.ts             # Модульные тесты
├── build/                    # Скомпилированный JavaScript
├── __mocks__/                # Моки для тестирования
├── .env.example              # Пример конфигурации
├── tsconfig.json
└── README.md
```

## Тестирование

Запуск модульных тестов:
```bash
npm test
```

Запуск тестов с покрытием:
```bash
npm run test:coverage
```

Ожидаемые пороги покрытия:
- `translationManager.ts`: 85% branches, 90% functions, 95% lines
- `translator.ts`: 90% branches, 100% functions, 99% lines
- `xmlParser.ts`: 90% branches, 100% functions, 100% lines

## Реальные интеграционные тесты

В проекте есть **реальные интеграционные тесты** (без моков), которые тестируют фактические операции с файловой системой:

### Расположение
- `tests/integration/*.real.test.ts` — Реальные интеграционные тесты файловой системы

### Что они тестируют
- Реальный парсинг и генерацию XML
- Операции с файловой системой (создание/чтение/обновление `strings.xml`)
- Сквозные сценарии перевода с реальными файлами
- Обнаружение модулей в реальных структурах Android-проектов

### Запуск интеграционных тестов
```bash
# Запуск всех интеграционных тестов (требует реальную структуру Android-проекта)
npm run test:integration

# Запуск конкретного интеграционного теста
npx jest tests/integration/translateModule.real.test.ts
```

### Режим мок-перевода
Для модульных тестов доступен режим мок-перевода:
```bash
# Включение мок-перевода (устанавливается в jest.setup.js)
TRANSLATION_MOCK=true
```

Это позволяет тестировать логику перевода без вызовов API.

## История исправлений ошибок

### BUG-001: Обработка отсутствующих файлов в translateModule() ✅ ИСПРАВЛЕНО
**Проблема:** `translateModule()` завершался с ошибкой, когда целевой файл перевода не существовал.

**Решение:** Теперь проверяет, существует ли целевой файл, и загружает ВСЕ строки, если файл отсутствует (вместо только измененных строк через Git diff).

**Влияние:** Позволяет переводить во вновь созданные языковые директории.

---

### BUG-002: Обработка ошибок в translateLanguage() ✅ ИСПРАВЛЕНО
**Проблема:** `translateLanguage()` напрямую выбрасывал ошибки, что приводило к аварийному завершению MCP-инструмента.

**Решение:** Теперер возвращает ошибки в массиве `result.errors` вместо выброса исключений.

**Влияние:** Улучшенная отчетность об ошибках и корректная обработка сбоев.

---

### BUG-003: Регулярное выражение validateFileFilter() ✅ ИСПРАВЛЕНО
**Проблема:** Регулярное выражение `validateFileFilter()` некорректно обрабатывало папки вида `values-ru`.

**Решение:** Обновлен паттерн регулярного выражения для правильного соответствия конвенциям именования ресурсов Android.

**Влияние:** Корректная фильтрация файлов для всех языковых вариантов.

---

## E2E тесты

Сквозные тесты (`tests/e2e/run_tests.py`) теперь проверяют все 3 исправления ошибок, описанных выше.

## Лицензия

MIT
