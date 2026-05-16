# Android i18n MCP 服务器

<div align="right">
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README.md">English</a> |
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-ZH.md">中文</a> |
  <a href="https://github.com/realskyrin/android-i18n-mcp/blob/main/README-RU.md">Русский</a>
</div>

一个 MCP (Model Context Protocol) 服务器，通过使用 Git diff 检测默认 `strings.xml` 文件的变化，自动将 Android 应用字符串资源翻译成多种语言。

📖 [项目介绍文章](https://juejin.cn/post/7549032025673662514)

## 截图

<div align="center">
  <img src="imgs/9548ffd0aeeebf8617bd116f6e82c3a7.png" alt="批量生成多语言文件" width="100%"/>
  <p><em>一次性生成多种语言文件，大规模批量翻译，显著提高效率</em></p>
</div>

<div align="center">
  <img src="imgs/f8c5cc563a3df28ecfaeda97011d0dbe.png" alt="MCP 工具执行" width="100%"/>
  <p><em>MCP 工具自动检测并翻译缺失的语言</em></p>
</div>

## 功能特性

- 使用 Git diff 自动检测默认 `strings.xml` 文件中新增或修改的字符串
- 支持翻译至多达 28 种语言（可通过环境变量配置）
- 保留 Android 字符串格式化占位符（%s、%d、%1$s 等）
- 支持多个 Android 模块
- 批量翻译以提高性能
- 仅翻译更改的字符串以节省 API 成本
- 可配置语言选择以优化 API 使用

## 支持的语言

服务器支持翻译至 28 种语言。您可以使用 `TRANSLATION_LANGUAGES` 环境变量配置要翻译的语言。

### 所有支持的语言：

- `zh-CN` - 简体中文 (values-zh-rCN)
- `zh-TW` - 繁体中文台湾 (values-zh-rTW)
- `zh-SG` - 繁体中文新加坡 (values-zh-rSG)
- `zh-HK` - 繁体中文香港 (values-zh-rHK)
- `zh-MO` - 繁体中文澳门 (values-zh-rMO)
- `en` - 英语 (values-en)
- `es` - 西班牙语 (values-es)
- `hi` - 印地语 (values-hi)
- `fr` - 法语 (values-fr)
- `ar` - 阿拉伯语 (values-ar)
- `bn` - 孟加拉语 (values-bn)
- `pt` - 葡萄牙语 (values-pt)
- `ru` - 俄语 (values-ru)
- `ur` - 乌尔都语 (values-ur)
- `id` - 印尼语 (values-id)
- `de` - 德语 (values-de)
- `ja` - 日语 (values-ja)
- `sw` - 斯瓦希里语 (values-sw)
- `mr` - 马拉地语 (values-mr)
- `te` - 泰卢固语 (values-te)
- `tr` - 土耳其语 (values-tr)
- `ko` - 韩语 (values-ko)
- `ta` - 泰米尔语 (values-ta)
- `vi` - 越南语 (values-vi)
- `az` - 阿塞拜疆语 (values-az)
- `be` - 白俄罗斯语 (values-be)
- `it` - 意大利语 (values-it)
- `uk` - 乌克兰语 (values-uk)

## 安装

1. 克隆仓库：
```bash
git clone <repository-url>
cd android-i18n-mcp
```

2. 安装依赖：
```bash
npm install
```

3. 构建项目：
```bash
npm run build
```

4. 配置环境变量：
```bash
cp .env.example .env
```

编辑 `.env` 文件配置：
```env
ANDROID_PROJECT_ROOT=/path/to/your/android/project
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=your_api_key_here
# 可选：
TRANSLATION_API_BASE_URL=https://api.openai.com/v1
TRANSLATION_MODEL=gpt-4o-mini
# 逗号分隔的语言列表（可选，默认为所有 28 种语言）
TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
# 源语言设置（可选，默认为 'en'。如果您的默认 strings.xml 使用其他语言，如中文，请设置为 'zh-CN'）
TRANSLATOR_SOURCE_LANGUAGE=en
```

## MCP 配置

### 将此服务器添加到您的 MCP 客户端配置（例如 Cursor 或 Claude Desktop）：

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
        "TRANSLATION_LANGUAGES": "zh-CN,es,fr,de",  // 可选：指定语言
        "TRANSLATOR_SOURCE_LANGUAGE": "en"  // 可选：指定源语言（默认: en）
      }
    }
  }
}
```

### Codx 配置示例

在您的 `codx.toml` 中添加以下配置：

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
TRANSLATION_LANGUAGES = "zh-CN,es,fr,de,ja,ko"  # 可选：指定语言，如果项目中不存在则会自动新增并翻译
TRANSLATOR_SOURCE_LANGUAGE = "en"  # 可选：指定源语言（默认: en）
```

## 配置系统

### 配置优先级（高 → 低）

```
1. MCP 调用参数（languages 参数）     ← 最高优先级
2. mcp_settings.json 环境变量         ← MCP 服务器读取
3. .env 文件                          ← 仅在 mcp_settings.json 未设置时使用
4. 内部默认值（全部 28 种语言）        ← 最低优先级
```

### 工作原理

当您使用 `languages: ["es", "fr"]` 调用 MCP 工具时，这些语言会覆盖任何 `.env` 设置。如果未提供 `languages` 参数，工具将使用环境中的 `TRANSLATION_LANGUAGES`（来自 mcp_settings.json 或 .env 文件）。

```typescript
// MCP 工具逻辑 (src/index.ts)
const languages = args.languages?.length ? args.languages : TRANSLATION_LANGUAGES;
//              ↑ 如果提供了 languages 参数 → 使用它
//                           ↑ 否则 → 使用环境变量（来自 .env 或 mcp_settings.json）
```

### 配置源详解

| 来源 | 位置 | 如何工作 | 优先级 |
|------|------|----------|--------|
| **MCP 设置** | `~/.config/Code/User/globalStorage/.../mcp_settings.json` | JSON `env` 块传递给服务器进程 | 1st（最高） |
| **.env 文件** | 项目根目录 `.env` | 服务器启动时通过 `dotenv.config()` 读取 | 2nd |
| **MCP 调用参数** | 工具调用中的 `languages: ["es", "fr"]` | 直接传递给工具处理器 | 覆盖（最高） |

### 调试配置

服务器启动时会记录配置源：
```
Config loaded from: env (.env or mcp_settings)  ← 正常 MCP 模式
Config loaded from: env                         ← 测试模式（NODE_ENV=test）
Config loaded from: defaults                    ← 未设置 TRANSLATION_LANGUAGES
```

验证配置：
```bash
# 检查 mcp_settings.json
cat ~/.config/Code/User/globalStorage/.../mcp_settings.json | grep -A5 '"i18n"'

# 检查 .env
cat .env | grep TRANSLATION_LANGUAGES
```

## Agent Instruction

您可以配置 AGENTS.md 或 CLAUDE.md 来让 Agent 在修改了 strings.xml 文件时自动调用 MCP：

```markdown
## Copy res update Guidelines
- Whenever a strings.xml file is modified, run android-i18n mcp to check and update copy.
```

## 可用工具

### 1. `translate_all_modules`
检测所有模块中默认 strings.xml 文件的变化，并将其翻译成所有支持的语言。

**参数：**
- `projectRoot`（可选）：Android 项目根目录。如未提供，使用 `ANDROID_PROJECT_ROOT` 环境变量。

**示例：**
```json
{
  "tool": "translate_all_modules",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 2. `translate_module`
检测特定模块默认 strings.xml 的变化并翻译成所有语言。

**参数：**
- `modulePath`（必需）：Android 模块目录路径

**示例：**
```json
{
  "tool": "translate_module",
  "arguments": {
    "modulePath": "/path/to/android/project/app"
  }
}
```

### 3. `check_changes`
检查默认 strings.xml 文件中未提交的更改，而不执行翻译。

**参数：**
- `projectRoot`（可选）：Android 项目根目录

**示例：**
```json
{
  "tool": "check_changes",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 4. `check_missing_languages`
检查与配置的 TRANSLATION_LANGUAGES 环境变量相比缺少哪些语言目录。

**参数：**
- `projectRoot`（可选）：Android 项目根目录

**示例：**
```json
{
  "tool": "check_missing_languages",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

### 5. `create_and_translate_missing_languages`
为所有配置的语言创建缺失的语言目录，并将默认的 strings.xml 翻译到这些目录中。

**参数：**
- `projectRoot`（可选）：Android 项目根目录

**示例：**
```json
{
  "tool": "create_and_translate_missing_languages",
  "arguments": {
    "projectRoot": "/path/to/android/project"
  }
}
```

## 工作原理

1. **变化检测**：服务器使用 Git diff 检测自上次提交以来默认 `values/strings.xml` 文件中添加或修改了哪些字符串。

2. **批量翻译**：使用配置的 AI 翻译 API 将更改的字符串批量翻译成目标语言。

3. **XML 合并**：翻译后的字符串合并到现有的特定语言 `strings.xml` 文件中，保留现有翻译，仅更新更改的部分。

4. **模块支持**：服务器可以在单个操作中处理多个 Android 模块，检测所有匹配模式 `**/src/main/res/values/strings.xml` 的文件。

## 翻译提供商

当前支持：
- **OpenAI**（包括 OpenAI 兼容的 API）
- **DeepSeek**（自动使用 api.deepseek.com 端点）

计划支持：
- Anthropic Claude
- Google Translate

### DeepSeek 配置示例：
```env
TRANSLATION_PROVIDER=deepseek
TRANSLATION_API_KEY=your_deepseek_api_key
# 可选：默认为 deepseek-chat
TRANSLATION_MODEL=deepseek-chat
# 可选：要翻译的特定语言（默认为所有 28 种）
TRANSLATION_LANGUAGES=zh-CN,en,es,fr,de,ja,ko
# 可选：指定源语言（默认为 'en'）
TRANSLATOR_SOURCE_LANGUAGE=en
```

## 配置选项

### 语言选择

您可以使用 `TRANSLATION_LANGUAGES` 环境变量配置要翻译的语言：

- **翻译成所有 28 种支持的语言（默认）：**
  ```env
  # 不设置 TRANSLATION_LANGUAGES 或留空
  ```

- **仅翻译成特定语言：**
  ```env
  TRANSLATION_LANGUAGES=zh-CN,es,fr,de,ja,ko
  ```

- **单一语言：**
  ```env
  TRANSLATION_LANGUAGES=zh-CN
  ```

**注意：** 如果您指定了不支持的语言，服务器将：
1. 显示警告，列出不支持的语言
2. 显示所有支持的语言供参考
3. 仅使用配置中的有效语言继续运行

### 源语言配置

默认情况下，服务器假设您的默认 `values/strings.xml` 文件使用英语（`en`）。如果您的项目使用其他语言作为默认语言（例如中文），您需要配置源语言：

**场景 1：默认 strings.xml 使用英语（无需配置）**
```env
# 不设置 TRANSLATOR_SOURCE_LANGUAGE，默认为 'en'
```

**场景 2：默认 strings.xml 使用中文**
```env
TRANSLATOR_SOURCE_LANGUAGE=zh-CN
```

**场景 3：使用其他语言作为默认**
```env
# 支持的任何语言代码
TRANSLATOR_SOURCE_LANGUAGE=es  # 西班牙语
TRANSLATOR_SOURCE_LANGUAGE=fr  # 法语
TRANSLATOR_SOURCE_LANGUAGE=ja  # 日语
# 等等...
```

**重要提示：**
- 正确配置源语言可以确保翻译质量和准确性
- 如果源语言配置错误，可能导致翻译失败或翻译结果不正确
- 当目标语言与源语言相同时，将直接复制文本而不进行翻译
- 翻译验证逻辑会根据源语言自动调整，避免误报未翻译的警告

## 开发

使用热重载运行开发模式：
```bash
npm run dev
```

构建项目：
```bash
npm run build
```

## 项目结构

```
android-i18n-mcp/
├── src/
│   ├── index.ts           # MCP 服务器入口点
│   ├── xmlParser.ts       # Android strings.xml 解析
│   ├── gitDiff.ts         # Git diff 分析
│   ├── translator.ts      # 翻译 API 集成
│   └── translationManager.ts # 翻译编排
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 注意事项

- 服务器仅翻译 `translatable` 属性未设置为 `false` 的字符串
- 删除的字符串会自动从翻译文件中移除
- 翻译保留 Android 格式化占位符
- 所有文件操作都是原子的 - 如果任何语言的翻译失败，则不会修改任何文件

## 真实集成测试

项目包含**真实集成测试**（无模拟），用于测试实际的文件系统操作：

### 位置
- `tests/integration/*.real.test.ts` - 真实文件系统集成测试

### 测试内容
- 实际的 XML 解析和生成
- 真实文件系统操作（创建/读取/更新 `strings.xml`）
- 使用实际文件的端到端翻译工作流
- 真实 Android 项目结构中的模块检测

### 运行集成测试
```bash
# 运行所有集成测试（需要真实的 Android 项目结构）
npm run test:integration

# 运行特定的集成测试
npx jest tests/integration/translateModule.real.test.ts
```

### 模拟翻译模式
对于单元测试，提供模拟翻译模式：
```bash
# 启用模拟翻译（在 jest.setup.js 中设置）
TRANSLATION_MOCK=true
```

这允许在没有 API 调用的情况下测试翻译逻辑。

## Bug 修复历史

### BUG-001: translateModule() 缺失文件处理 ✅ 已修复
**问题：** 当目标翻译文件不存在时，`translateModule()` 失败。

**解决方案：** 现在检查目标文件是否存在，如果缺失则加载所有字符串（而不是仅通过 Git diff 加载更改的字符串）。

**影响：** 支持新创建的语言目录的翻译。

---

### BUG-002: translateLanguage() 错误处理 ✅ 已修复
**问题：** `translateLanguage()` 直接抛出错误，导致 MCP 工具崩溃。

**解决方案：** 现在在 `result.errors` 数组中返回错误，而不是抛出异常。

**影响：** 更好的错误报告和优雅的失败处理。

---

### BUG-003: validateFileFilter() 正则表达式模式 ✅ 已修复
**问题：** `validateFileFilter()` 正则表达式无法正确匹配 `values-ru` 样式的文件夹。

**解决方案：** 更新了正则表达式模式，以正确匹配 Android 资源文件夹命名约定。

**影响：** 所有语言变体的正确文件过滤。

---

## E2E 测试

端到端测试（`tests/e2e/run_tests.py`）现在验证上述所有 3 个错误修复。

## 许可证

MIT