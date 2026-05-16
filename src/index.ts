#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z, ZodRawShape } from 'zod';
import { TranslationManager } from './translationManager.js';
import { TranslatorConfig } from './translator.js';
import { ValidationError, PathTraversalError, InvalidLanguageError } from './errors.js';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync, appendFileSync, statSync } from 'node:fs';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'node:crypto';

dotenv.config();

// Get the directory where the current script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use logs/ directory for log files (relative to project root)
const LOG_DIR = path.join(path.resolve(__dirname, '..'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mcp-errors.log');

// File logging state - can be changed dynamically via set_logging tool
let LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';

// Getter and setter for logging state
export function isFileLoggingEnabled(): boolean {
  return LOG_TO_FILE;
}

export function setFileLogging(enabled: boolean): void {
  LOG_TO_FILE = enabled;
}

// Initialize log file and handle rotation (if older than 3 days)
async function initLogFile() {
  if (!LOG_TO_FILE) return; // Skip file operations if disabled
  
  try {
    // Ensure logs directory exists
    if (!existsSync(LOG_DIR)) {
      await fs.mkdir(LOG_DIR, { recursive: true });
    }
    
    if (existsSync(LOG_FILE)) {
      const stats = statSync(LOG_FILE);
      const now = new Date().getTime();
      const endTime = new Date(stats.mtime).getTime() + (3 * 24 * 60 * 60 * 1000);
      if (now > endTime) {
        await fs.writeFile(LOG_FILE, `--- Log rotated at ${new Date().toISOString()} ---\n`);
      }
    } else {
      await fs.writeFile(LOG_FILE, `--- Log initialized at ${new Date().toISOString()} ---\n`);
    }
  } catch (e) {
    console.error('Failed to initialize log file:', e);
  }
}

function logToFile(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  const errorDetails = error ? (error.stack || error.message || JSON.stringify(error)) : '';
  const logEntry = `[${timestamp}] ${message}\n${errorDetails ? errorDetails + '\n' : ''}`;
  
  // Always output to stderr for immediate visibility
  console.error(logEntry);
  
  // Only write to file if LOG_TO_FILE is enabled
  if (LOG_TO_FILE) {
    try {
      appendFileSync(LOG_FILE, logEntry);
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }
}

/**
 * Validates that a path is within the projectRoot directory (prevents path traversal attacks)
 * @param targetPath - The path to validate
 * @param projectRoot - The project root directory
 * @throws PathTraversalError if path traversal is detected
 */
function validatePathTraversal(targetPath: string, projectRoot: string): void {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedProjectRoot = path.resolve(projectRoot);
  
  if (!resolvedTarget.startsWith(resolvedProjectRoot)) {
    throw new PathTraversalError(targetPath);
  }
}

/**
 * Supported language codes for translation
 */
const SUPPORTED_LANGUAGES = [
  'zh-CN', 'zh-TW', 'zh-SG', 'zh-HK', 'zh-MO',
  'en', 'es', 'hi', 'fr', 'ar', 'bn', 'pt', 'ru',
  'ur', 'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr',
  'ko', 'ta', 'vi', 'az', 'be', 'it', 'uk'
];

/**
 * Validates language codes against the list of supported languages
 * @param languages - Array of language codes to validate
 * @throws InvalidLanguageError if unsupported language codes are provided
 */
function validateLanguages(languages: string[]): void {
  const unsupportedLanguages = languages.filter(lang => !SUPPORTED_LANGUAGES.includes(lang));
  
  if (unsupportedLanguages.length > 0) {
    throw new InvalidLanguageError(unsupportedLanguages, SUPPORTED_LANGUAGES);
  }
}

/**
 * Deduplicates an array of language codes while preserving order
 * @param languages - Array of language codes to deduplicate
 * @returns Deduplicated array of language codes
 */
function deduplicateLanguages(languages: string[]): string[] {
  return [...new Set(languages)];
}

/**
 * Escapes HTML special characters to prevent XSS in error messages
 * @param text - Text to escape
 * @returns Escaped text safe for HTML output
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#x27;');
}

const DEFAULT_PROJECT_ROOT = process.env.ANDROID_PROJECT_ROOT || process.cwd();
const TRANSLATION_PROVIDER = process.env.TRANSLATION_PROVIDER || 'openai';
const API_KEY = process.env.TRANSLATION_API_KEY || '';
const API_BASE_URL = process.env.TRANSLATION_API_BASE_URL;
const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL;
const TRANSLATION_LANGUAGES = process.env.TRANSLATION_LANGUAGES
  ? process.env.TRANSLATION_LANGUAGES.split(',').map(lang => lang.trim())
  : undefined;
const SOURCE_LANGUAGE = process.env.TRANSLATOR_SOURCE_LANGUAGE || 'en';

if (!API_KEY) {
  console.error('Error: TRANSLATION_API_KEY environment variable is required');
  process.exit(1);
}

// ============ Job Tracking System ============

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';

export interface Job {
  id: string;
  tool: string;
  status: JobStatus;
  startedAt: Date;
  completedAt?: Date;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
  result?: string;
  error?: string;
  languages?: string[]; // Languages that were translated in this job
}

// Persistent job storage using JSON file (survives server restarts)
const JOBS_FILE = path.join(process.cwd(), '.jobs.json');
const jobs = new Map<string, Job>();

// Load jobs from file on startup
function loadJobs(): void {
  try {
    if (existsSync(JOBS_FILE)) {
      const data = fsSync.readFileSync(JOBS_FILE, 'utf-8');
      const arr = JSON.parse(data) as [string, Job][];
      arr.forEach(([k, v]) => {
        // Restore Date objects
        v.startedAt = new Date(v.startedAt);
        if (v.completedAt) v.completedAt = new Date(v.completedAt);
        jobs.set(k, v);
      });
      logToFile(`Loaded ${jobs.size} jobs from persistent storage`);
    }
  } catch (e) {
    logToFile('Failed to load jobs from file', e);
  }
}

// Save jobs to file
function saveJobs(): void {
  try {
    const arr = [...jobs.entries()];
    fsSync.writeFileSync(JOBS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) {
    logToFile('Failed to save jobs to file', e);
  }
}

// Load jobs on module initialization
loadJobs();

/**
 * Creates a new job and returns its ID
 * @param tool - The tool name (e.g., 'translate_all_modules')
 * @param languages - Optional array of language codes being translated
 */
export function createJob(tool: string, languages?: string[]): string {
  const id = randomUUID();
  const job: Job = {
    id,
    tool,
    status: 'pending',
    startedAt: new Date(),
    languages,
  };
  jobs.set(id, job);
  saveJobs();
  logToFile(`[Job ${id}] Created: ${tool}${languages ? ` (languages: ${languages.join(', ')})` : ''}`);
  return id;
}

/**
 * Updates job status to running
 */
export function startJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = 'running';
    saveJobs();
    logToFile(`[Job ${jobId}] Started`);
  }
}

/**
 * Updates job progress
 */
export function updateJobProgress(jobId: string, current: number, total: number, message: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.progress = { current, total, message };
    saveJobs();
    logToFile(`[Job ${jobId}] Progress: ${current}/${total} - ${message}`);
  }
}

/**
 * Marks job as completed with result
 */
export function completeJob(jobId: string, result: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.progress = { current: job.progress?.total || 1, total: job.progress?.total || 1, message: 'Translation complete' };
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;
    saveJobs();
    logToFile(`[Job ${jobId}] Completed successfully with progress 100%`);
  }
}

/**
 * Marks job as failed with error
 */
export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = 'failed';
    job.completedAt = new Date();
    job.error = error;
    saveJobs();
    logToFile(`[Job ${jobId}] Failed: ${error}`);
  }
}

/**
 * Gets job status by ID
 */
export function getJobStatus(jobId: string): Job | null {
  return jobs.get(jobId) || null;
}

/**
 * Lists all jobs (for debugging)
 */
export function listJobs(): Job[] {
  return Array.from(jobs.values());
}

// Log configuration source for debugging
const configSource = process.env.TRANSLATION_LANGUAGES ?
  (process.env.NODE_ENV === 'test' ? 'env' : 'env (.env or mcp_settings)') :
  'defaults';
console.error(`Config loaded from: ${configSource}`);

const translatorConfig: TranslatorConfig = {
  provider: TRANSLATION_PROVIDER as 'openai' | 'deepseek' | 'anthropic' | 'google',
  apiKey: API_KEY,
  baseUrl: API_BASE_URL,
  model: TRANSLATION_MODEL,
  translationLanguages: TRANSLATION_LANGUAGES,
  sourceLanguage: SOURCE_LANGUAGE,
};

const server = new McpServer({
  name: 'android-i18n-mcp',
  version: '1.0.0',
});

// Fire-and-Forget helper with job timeout
const JOB_TIMEOUT_MS = 60000; // 60 seconds

function runInBackground(fn: () => Promise<void>, jobId?: string) {
  // Use void operator with IIFE for reliable fire-and-forget execution
  void (async () => {
    try {
      // Set up timeout for job
      if (jobId) {
        setTimeout(() => {
          const job = jobs.get(jobId);
          if (job && (job.status === 'pending' || job.status === 'running')) {
            job.status = 'timeout';
            job.completedAt = new Date();
            job.error = 'Job timeout after 60 seconds';
            job.result = undefined;
            saveJobs();
            logToFile(`[Job ${jobId}] Timeout - exceeded 60 seconds`);
          }
        }, JOB_TIMEOUT_MS);
      }
      
      await fn();
    } catch (error) {
      logToFile('Unhandled Background task error:', error);
    }
  })();
}

// Common parameters schema with detailed descriptions for AI agents
const commonSchema = {
  projectRoot: z.string().optional().describe('Path to Android project root directory. If not provided, uses ANDROID_PROJECT_ROOT env var or current directory. Example: "./AndroidProject" or "/path/to/project"'),
  languages: z.array(z.string()).optional().describe('List of target language codes for translation. If not provided, uses TRANSLATION_LANGUAGES from .env. Supported: zh-CN,zh-TW,zh-SG,zh-HK,zh-MO,en,es,hi,fr,ar,bn,pt,ru,ur,id,de,ja,sw,mr,te,tr,ko,ta,vi,az,be,it,uk'),
  fileFilter: z.string().optional().describe('Glob pattern to filter files (e.g., "**/strings.xml", "values-es/strings.xml"). Only processes matching files.'),
};

// Tool: Translate All Modules
server.registerTool(
  'translate_all_modules',
  {
    title: 'Translate All Modules',
    description: 'Automatically finds ALL strings.xml files in the Android project and translates them. Creates missing language files only (skips existing). Perfect for initial translation of entire project. Runs asynchronously - check logs for progress.',
    inputSchema: commonSchema as ZodRawShape,
  },
  async (args: any) => {
    try {
      const projectRoot = args.projectRoot || DEFAULT_PROJECT_ROOT;
      
      // Validate projectRoot exists
      if (!existsSync(projectRoot)) {
        return {
          content: [{ type: 'text', text: `Error: Project root not found: ${projectRoot}` }],
          isError: true
        };
      }
      
      // BUG-14: languages parameter is required - no silent fallback to .env
      if (!args.languages || args.languages.length === 0) {
        if (!TRANSLATION_LANGUAGES || TRANSLATION_LANGUAGES.length === 0) {
          return {
            content: [{ type: 'text', text: `languages parameter is required. Use TRANSLATION_LANGUAGES env var or pass languages array explicitly.` }],
            isError: true
          };
        }
        // Only use TRANSLATION_LANGUAGES from env if explicitly configured and not empty
      }
      
      const languages = args.languages?.length ? args.languages : TRANSLATION_LANGUAGES;
      
      // Validate languages if specified
      if (languages) {
        validateLanguages(languages);
      }
      
      const fileFilter = args.fileFilter;
      
      logToFile(`[translate_all_modules] projectRoot=${projectRoot}, languages=${JSON.stringify(languages)}, fileFilter=${fileFilter}`);
      const manager = new TranslationManager(projectRoot, translatorConfig);
      
      // Validate fileFilter before searching
      if (fileFilter) {
        const filterFiles = await manager.findDefaultStringsFiles(fileFilter);
        if (filterFiles.length === 0) {
          throw new Error(`No strings.xml files found matching filter: '${fileFilter}'. Please verify the path pattern is correct.`);
        }
      }
      
      const files = await manager.findDefaultStringsFiles(fileFilter);
      if (files.length === 0) {
        const filterInfo = fileFilter ? ` with filter "${fileFilter}"` : '';
        return {
          content: [{
            type: 'text' as const,
            text: `No strings.xml files found in ${projectRoot}${filterInfo}. ` +
                  `Try specifying full path like "values/strings.xml" or pattern "**/values/strings.xml".`
          }],
          isError: true
        };
      }
      
      // Perform a quick connectivity check before starting background task
      await manager.checkConnectivity();

      const jobId = createJob('translate_all_modules', languages);
      const moduleCount = files.length;
      
      runInBackground(async () => {
        startJob(jobId);
        updateJobProgress(jobId, 0, moduleCount, `Starting translation of ${moduleCount} modules...`);
        try {
          logToFile(`[Job ${jobId}] Starting translate_all_modules for ${projectRoot}`);
          const result = await manager.translateAllModules({
            languages,
            fileFilter,
            onProgress: (current, total, message) => {
              updateJobProgress(jobId, current, total, message);
            }
          });
          
          const summary = result.map(r => {
            const totalTranslated = r.languages.reduce((sum, lang) => sum + lang.translatedCount, 0);
            const allErrors = r.languages.flatMap(l => l.errors);
            // Use modulePath for display (shows source module path, not translation output)
            const relativeModulePath = path.relative(projectRoot, r.modulePath);
            const statusLine = r.moduleError ? `  Error: ${r.moduleError}\n` : `  Translated: ${totalTranslated} strings\n`;
            return `Module: ${relativeModulePath}\n` +
                   statusLine +
                   `  Languages: ${r.languages.map(l => l.language).join(', ')}\n` +
                   `  Errors: ${allErrors.length > 0 ? allErrors.join('; ') : 'none'}`;
          }).join('\n\n');
          
          logToFile(`[Job ${jobId}] Translation complete:\n${summary}`);
          completeJob(jobId, summary);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logToFile(`[Job ${jobId}] Translation error:`, error);
          failJob(jobId, errorMsg);
        }
      });
      
      const logStatus = LOG_TO_FILE ? `Logs will be written to: ${LOG_FILE}` : 'File logging is disabled - logs only go to stderr';
      return {
        content: [{
          type: 'text' as const,
          text: `Translation started in background.\nJob ID: ${jobId}\nModules: ${moduleCount}\nCheck status with: get_job_status tool`
        }]
      };
    } catch (error) {
      const errorInfo = error instanceof InvalidLanguageError
        ? { code: error.code, message: error.message, suggest: error.suggest }
        : { code: 'UNKNOWN_ERROR', message: String(error), suggest: [] };
      
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to start translation: ${errorInfo.message}${errorInfo.suggest.length > 0 ? `\n\nAvailable languages: ${errorInfo.suggest.join(', ')}` : ''}`
        }],
        isError: true,
        errorCode: errorInfo.code,
        suggest: errorInfo.suggest
      };
    }
  }
);

// Tool: Translate Specific Module
server.registerTool(
  'translate_module',
  {
    title: 'Translate Module',
    description: 'Translates a SPECIFIC Android module strings.xml to target languages. Automatically detects project structure (supports: app/src/values/, app/src/main/res/values/, app/res/values/). Creates missing language files only. Best for translating one module at a time.',
    inputSchema: {
      ...commonSchema,
      modulePath: z.string().describe('Path to Android module (e.g., "app", "app/src", "AndroidProject/app"). Auto-detects common Android project structures. Can be: module name, relative path, or path to values/ directory.'),
    } as ZodRawShape,
  },
  async (args: any) => {
    try {
      const projectRoot = args.projectRoot || DEFAULT_PROJECT_ROOT;
      
      if (!existsSync(projectRoot)) {
        return {
          content: [{ type: 'text', text: `Error: Project root not found: ${projectRoot}` }],
          isError: true
        };
      }
      
      // BUG-14: languages parameter is required - no silent fallback to .env
      if (!args.languages || args.languages.length === 0) {
        if (!TRANSLATION_LANGUAGES || TRANSLATION_LANGUAGES.length === 0) {
          return {
            content: [{ type: 'text', text: `languages parameter is required. Use TRANSLATION_LANGUAGES env var or pass languages array explicitly.` }],
            isError: true
          };
        }
      }
      
      // BUG-3 fix: Deduplicate languages before processing
      const languages = args.languages?.length ? deduplicateLanguages(args.languages) : TRANSLATION_LANGUAGES;
      
      // Validate languages if provided
      if (languages) {
        validateLanguages(languages);
      }
      
      const fileFilter = args.fileFilter;
      const modulePath = args.modulePath;
      
      // BUG-6 fix: Validate path traversal on resolved path (not raw modulePath)
      // modulePath is relative to projectRoot, so we must resolve it first
      if (modulePath) {
        const resolvedPath = path.join(projectRoot, modulePath);
        validatePathTraversal(resolvedPath, projectRoot);
      }
      
      logToFile(`[translate_module] projectRoot=${projectRoot}, modulePath=${modulePath}, languages=${JSON.stringify(languages)}, fileFilter=${fileFilter}`);
      // BUG-17 fix: Log languages being used for debugging
      logToFile(`[translate_module] Using languages: ${languages?.join(', ') || 'from env'}`);
      const manager = new TranslationManager(projectRoot, translatorConfig);
      
      // BUG-2 fix: Check if modulePath points to an already-translated file (values-{lang}/strings.xml)
      // and if the target language matches that locale
      const valuesLocaleMatch = modulePath.match(/values-([a-z]{2}(?:-[A-Z]{2})?)(?:\/|\\)strings\.xml$/i);
      if (valuesLocaleMatch && languages) {
        const fileLocale = valuesLocaleMatch[1];
        // Check if any target language matches this locale
        const matchingLang = languages.find(lang =>
          lang === fileLocale ||
          lang.toLowerCase() === fileLocale.toLowerCase()
        );
        if (matchingLang) {
          logToFile(`[translate_module] File is already translation for language '${matchingLang}'. Skipping to avoid redundant translation.`);
          return {
            content: [{
              type: 'text' as const,
              text: `File '${modulePath}' is already a translation file for language '${matchingLang}'. ` +
                    `No action needed. Use forceUpdate=true to retranslate.`
            }],
            isError: true
          };
        }
      }
      
      // First try modulePath as-is with common Android project structures
      const possiblePaths = [
        // Standard Android structure: modulePath/src/values/strings.xml
        path.join(projectRoot, modulePath, 'src', 'values', 'strings.xml'),
        // Android Studio structure: modulePath/src/main/res/values/strings.xml
        path.join(projectRoot, modulePath, 'src', 'main', 'res', 'values', 'strings.xml'),
        // Simple structure: modulePath/res/values/strings.xml
        path.join(projectRoot, modulePath, 'res', 'values', 'strings.xml'),
        // Legacy structure: modulePath/values/strings.xml
        path.join(projectRoot, modulePath, 'values', 'strings.xml'),
        // If modulePath is already a full path to values/strings.xml
        path.join(projectRoot, modulePath),
        // Direct strings.xml path
        path.join(modulePath, 'strings.xml')
      ];
      
      let defaultFile = '';
      let foundAtPath = '';
      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          defaultFile = p;
          foundAtPath = p;
          break;
        } catch { continue; }
      }
      
      // If not found with common patterns, try to find using glob (auto-detect structure)
      if (!defaultFile) {
        logToFile(`[translate_module] Standard paths not found, trying glob search...`);
        const files = await manager.findDefaultStringsFiles();
        
        // Filter files that match the modulePath pattern
        const moduleFiles = files.filter(f =>
          f.includes(modulePath) || f.includes(path.basename(modulePath))
        );
        
        if (moduleFiles.length > 0) {
          defaultFile = moduleFiles[0];
          foundAtPath = defaultFile;
        }
      }
      
      if (!defaultFile) {
        logToFile(`[translate_module] Module not found: modulePath="${modulePath}", searched=${possiblePaths.length} paths`);
        // Provide helpful error with suggestions
        const suggestions = [
          `Make sure the project structure has a values/strings.xml file`,
          `Try specifying full path: modulePath="app/src/values" with projectRoot="."`,
          `For standard Android project, use: projectRoot="./AndroidProject", modulePath="app/src"`,
          `Common Android project structures supported:`,
          `  1. app/src/values/strings.xml (Android Studio)`,
          `  2. app/src/main/res/values/strings.xml (Android Gradle)`,
          `  3. app/res/values/strings.xml (Eclipse)`,
          `  4. app/values/strings.xml (Simple)`
        ].join('\n');
        
        return {
          content: [{
            type: 'text' as const,
            text: `Module strings file not found at any expected location.\n\n` +
                  `Searched paths:\n${possiblePaths.map(p => `  - ${escapeHtml(p)}`).join('\n')}\n\n` +
                  `Your input: projectRoot="${escapeHtml(projectRoot)}", modulePath="${escapeHtml(modulePath)}"\n\n` +
                  `${suggestions}`
          }],
          isError: true
        };
      }

      // Perform a quick connectivity check before starting background task
      await manager.checkConnectivity();

      const jobId = createJob('translate_module', languages);
      
      runInBackground(async () => {
        startJob(jobId);
        const languageCount = languages?.length || TRANSLATION_LANGUAGES?.length || 0;
        updateJobProgress(jobId, 0, languageCount, `Starting translation of ${languageCount} languages...`);
        try {
          logToFile(`[Job ${jobId}] Starting translate_module for ${defaultFile} in ${projectRoot}`);
          const result = await manager.translateModule(defaultFile, {
            languages,
            fileFilter,
            projectRoot,
            onProgress: (current, total, message) => {
              updateJobProgress(jobId, current, total, message);
            }
          });
          
          // Calculate totals including skipped languages' existing translations
          const totalTranslated = result.languages.reduce((sum, lang) => sum + lang.translatedCount, 0);
          const totalSkipped = result.languages.filter(l => l.skipped).length;
          const allErrors = result.languages.flatMap(l => l.errors);
          const allWarnings = result.warnings || [];
          const skippedMessage = totalSkipped > 0 ? ` (${totalSkipped} already translated, skipped)` : '';
          const relativeModulePath = path.relative(projectRoot, result.modulePath);
          const warningsText = allWarnings.length > 0 ? `\n  Warnings: ${allWarnings.join('; ')}` : '';
          const summary =
            `Module: ${relativeModulePath}\n` +
            `  Translated: ${totalTranslated} strings${skippedMessage}\n` +
            `  Languages: ${result.languages.map(l => l.language).join(', ')}\n` +
            `  Errors: ${allErrors.length > 0 ? allErrors.join('; ') : 'none'}${warningsText}`;
          
          logToFile(`[Job ${jobId}] Translation complete:\n${summary}`);
          completeJob(jobId, summary);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logToFile(`[Job ${jobId}] Translation error:`, error);
          failJob(jobId, errorMsg);
        }
      });
      
      const logStatus = LOG_TO_FILE ? `Logs will be written to: ${LOG_FILE}` : 'File logging is disabled - logs only go to stderr';
      return {
        content: [{
          type: 'text' as const,
          text: `Translation started in background.\nJob ID: ${jobId}\nModule: ${path.relative(projectRoot, defaultFile)}\nCheck status with: get_job_status tool`
        }]
      };
    } catch (error) {
      const errorInfo = error instanceof InvalidLanguageError
        ? { code: error.code, message: error.message, suggest: error.suggest }
        : { code: 'UNKNOWN_ERROR', message: String(error), suggest: [] };
      
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to start module translation: ${errorInfo.message}${errorInfo.suggest.length > 0 ? `\n\nAvailable languages: ${errorInfo.suggest.join(', ')}` : ''}`
        }],
        isError: true,
        errorCode: errorInfo.code,
        suggest: errorInfo.suggest
      };
    }
  }
);

// Tool: Check Changes
server.registerTool(
  'check_changes',
  {
    title: 'Check Changes',
    description: 'Compares default English strings.xml against all translated language files (values-XX/). Shows which strings are Added (new), Modified (changed), or Deleted. Perfect for tracking what needs translation after editing the English source. Use before translation to know what changed.',
    inputSchema: {
      projectRoot: z.string().optional().describe('Path to Android project root (e.g., "./AndroidProject"). Auto-detects all modules.'),
      fileFilter: z.string().optional().describe('Glob pattern to check specific files (e.g., "**/values/strings.xml")'),
    } as ZodRawShape,
  },
  async (args: any) => {
    try {
      const projectRoot = args.projectRoot || DEFAULT_PROJECT_ROOT;
      
      if (!existsSync(projectRoot)) {
        return {
          content: [{ type: 'text', text: `Error: Project root not found: ${projectRoot}` }],
          isError: true
        };
      }
      
      const fileFilter = args.fileFilter;
      
      logToFile(`[check_changes] projectRoot=${projectRoot}, fileFilter=${fileFilter}`);
      const manager = new TranslationManager(projectRoot, translatorConfig);
      const modules = await manager.findDefaultStringsFiles(fileFilter);
      
      if (modules.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No modules found with the given filter.' }]
        };
      }

      // Get all modules with changes, including newly discovered untracked modules
      const modulesWithChanges = await manager.getAllModulesWithChanges(modules);
      
      let summary = '';
      let newModulesCount = 0;
      let hasSourceChanges = false;
      
      for (const moduleInfo of modulesWithChanges) {
        const changes = moduleInfo.changes;
        const relativePath = path.relative(projectRoot, moduleInfo.modulePath);
        
        // BUG-22: Check for XML parsing errors
        const xmlErrorKey = '__XML_PARSE_ERROR__';
        let xmlErrorMsg = '';
        if (changes.added.has(xmlErrorKey)) {
          xmlErrorMsg = '\n  ⚠️ XML PARSE ERROR: ' + changes.added.get(xmlErrorKey);
          summary += `Module: ${relativePath}${xmlErrorMsg}\n  Status: SKIPPED (corrupted XML needs fixing)\n\n`;
        } else if (changes.added.size > 0 || changes.modified.size > 0 || changes.deleted.size > 0) {
          hasSourceChanges = true;
          const newTag = moduleInfo.isNew ? ' (NEW FILE)' : '';
          summary += `Module: ${relativePath}${newTag}\n` +
                     `  Added: ${changes.added.size}\n` +
                     `  Modified: ${changes.modified.size}\n` +
                     `  Deleted: ${changes.deleted.size}\n\n`;
          
          if (moduleInfo.isNew) {
            newModulesCount++;
          }
        }
      }
      
      if (newModulesCount > 0) {
        summary += `\n⚠️ ${newModulesCount} new untracked module(s) detected via filesystem scan\n`;
      }
      
      // Also check for incomplete translations (BUG #1 fix)
      let incompleteTranslations = '';
      let incompleteCount = 0;
      
      for (const defaultFile of modules) {
        const relativePath = path.relative(projectRoot, defaultFile);
        const translationStatus = await manager.getModuleTranslationStatus(defaultFile);
        
        // BUG-19 fix: Add table format for better language visibility
        const languageDetails: string[] = [];
        for (const [lang, status] of translationStatus) {
          const statusIcon = status.missingCount === 0 ? '✅' : status.completenessPercent >= 50 ? '⚠️' : '❌';
          languageDetails.push(`  ${statusIcon} ${lang}: ${status.missingCount}/${status.totalKeys} missing (${status.completenessPercent}%)`);
        }
        if (languageDetails.length > 0) {
          incompleteCount++;
          incompleteTranslations += `Module: ${relativePath}\nLanguages:\n${languageDetails.join('\n')}\n\n`;
        }
      }
      
      if (incompleteTranslations) {
        summary += `\n📝 Incomplete Translations (need translation of missing keys):\n${incompleteTranslations}`;
      }
      
      if (!summary) {
        // Even if no source changes, check if translations are complete
        const allStatus = await Promise.all(
          modules.map(f => manager.getModuleTranslationStatus(f))
        );
        const hasAnyIncomplete = allStatus.some(statusMap =>
          Array.from(statusMap.values()).some(s => s.missingCount > 0)
        );
        
        if (hasAnyIncomplete) {
          // Re-generate incomplete translations report
          incompleteTranslations = '';
          for (let i = 0; i < modules.length; i++) {
            const defaultFile = modules[i];
            const relativePath = path.relative(projectRoot, defaultFile);
            const translationStatus = allStatus[i];
            
            // BUG-19 fix: Same table format for second iteration
            const languageDetails: string[] = [];
            for (const [lang, status] of translationStatus) {
              const statusIcon = status.missingCount === 0 ? '✅' : status.completenessPercent >= 50 ? '⚠️' : '❌';
              languageDetails.push(`  ${statusIcon} ${lang}: ${status.missingCount}/${status.totalKeys} missing (${status.completenessPercent}%)`);
            }
            if (languageDetails.length > 0) {
              incompleteTranslations += `Module: ${relativePath}\nLanguages:\n${languageDetails.join('\n')}\n\n`;
            }
          }
          summary = `\n📝 Translation Status:\n${incompleteTranslations}`;
        }
      }
      
      if (!summary && !hasSourceChanges) {
        return {
          content: [{ type: 'text' as const, text: 'No changes detected in any modules.' }]
        };
      }
      
      return {
        content: [{ type: 'text' as const, text: `Changes detected:\n\n${summary}` }]
      };
    } catch (error) {
      const errorInfo = error instanceof InvalidLanguageError
        ? { code: error.code, message: error.message, suggest: error.suggest }
        : { code: 'UNKNOWN_ERROR', message: String(error), suggest: [] };
      
      return {
        content: [{
          type: 'text' as const,
          text: `Error checking changes: ${errorInfo.message}${errorInfo.suggest.length > 0 ? `\n\nAvailable languages: ${errorInfo.suggest.join(', ')}` : ''}`
        }],
        isError: true,
        errorCode: errorInfo.code,
        suggest: errorInfo.suggest
      };
    }
  }
);

// Tool: Check Missing Languages
server.registerTool(
  'check_missing_languages',
  {
    title: 'Check Missing Languages',
    description: 'Scans Android project to see which language translations are MISSING. Compares target languages (from .env or parameter) against existing values-XX/ folders. Shows exactly which languages need to be created for each module. Run this first to know what to translate.',
    inputSchema: {
      projectRoot: z.string().optional().describe('Path to Android project root (e.g., "./AndroidProject")'),
      languages: z.array(z.string()).optional().describe('List of language codes to check (e.g., ["es", "fr", "de"]). Defaults to TRANSLATION_LANGUAGES from .env'),
      fileFilter: z.string().optional().describe('Filter to check specific modules (e.g., "**/values/strings.xml")'),
    } as ZodRawShape,
  },
  async (args: any) => {
    try {
      // BUG-5 fix: Check args.projectRoot BEFORE applying fallback
      // Empty string is falsy, so "" || DEFAULT_PROJECT_ROOT would skip empty check
      if (args.projectRoot !== undefined && (typeof args.projectRoot !== 'string' || args.projectRoot.trim() === '')) {
        return {
          content: [{ type: 'text', text: 'Error: projectRoot parameter is required and cannot be empty.' }],
          isError: true
        };
      }
      const projectRoot = args.projectRoot || DEFAULT_PROJECT_ROOT;
      
      if (!existsSync(projectRoot)) {
        return {
          content: [{ type: 'text', text: `Error: Project root not found: ${projectRoot}` }],
          isError: true
        };
      }
      
      const languages = args.languages;
      
      // Validate languages if provided
      if (languages && languages.length > 0) {
        validateLanguages(languages);
      }
      
      const fileFilter = args.fileFilter;
      
      logToFile(`[check_missing_languages] projectRoot=${projectRoot}, languages=${JSON.stringify(languages)}, fileFilter=${fileFilter}`);
      const manager = new TranslationManager(projectRoot, translatorConfig);
      
      // BUG-1 fix: Check if fileFilter returns any files before proceeding
      if (fileFilter) {
        const filterFiles = await manager.findDefaultStringsFiles(fileFilter);
        if (filterFiles.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: No strings.xml files found matching filter: '${fileFilter}'. Please verify the path pattern is correct.`
            }],
            isError: true
          };
        }
      }
      
      const missing = await manager.checkMissingLanguages({ projectRoot, languages, fileFilter });
      
      if (missing.totalMissingCount === 0) {
        return {
          content: [{ type: 'text' as const, text: 'All languages are fully translated!' }]
        };
      }
      
      // Check for XML parse warnings
      const allWarnings = missing.modules
        .filter(m => m.parseWarnings && m.parseWarnings.length > 0)
        .map(m => `⚠️ ${m.module}: ${m.parseWarnings?.join('; ')}`);
      
      const warningsSection = allWarnings.length > 0
        ? `\n\n⚠️ XML Parse Warnings (corrupted files treated as missing):\n${allWarnings.join('\n')}`
        : '';
      
      const summary = missing.modules.map(m => {
        const warnings = m.parseWarnings?.length ? ` ⚠️` : '';
        return `Module: ${m.module}\n` +
          `  Missing languages: ${m.missingLanguages.join(', ') || 'none'}${warnings}`;
      }).join('\n\n');
      
      return {
        content: [{ type: 'text' as const, text: `Missing translations found:\n\n${summary}${warningsSection}` }]
      };
    } catch (error) {
      const errorInfo = error instanceof InvalidLanguageError
        ? { code: error.code, message: error.message, suggest: error.suggest }
        : { code: 'UNKNOWN_ERROR', message: String(error), suggest: [] };
      
      return {
        content: [{
          type: 'text' as const,
          text: `Error checking missing languages: ${errorInfo.message}${errorInfo.suggest.length > 0 ? `\n\nAvailable languages: ${errorInfo.suggest.join(', ')}` : ''}`
        }],
        isError: true,
        errorCode: errorInfo.code,
        suggest: errorInfo.suggest
      };
    }
  }
);

// Tool: Create and Translate Missing Languages
server.registerTool(
  'create_and_translate_missing_languages',
  {
    title: 'Create and Translate Missing Languages',
    description: 'ONE-CLICK solution: Creates missing language folders (values-ru/, values-es/, etc.) AND translates all strings in one operation. Perfect for initial project translation. Uses target languages from .env or parameter. Runs asynchronously.',
    inputSchema: {
      projectRoot: z.string().optional().describe('Path to Android project root (e.g., "./AndroidProject")'),
      languages: z.array(z.string()).optional().describe('List of language codes to create and translate (e.g., ["es", "fr", "de", "ru"]). Defaults to TRANSLATION_LANGUAGES from .env'),
      fileFilter: z.string().optional().describe('Filter to process specific modules only (e.g., "**/values/strings.xml")'),
    } as ZodRawShape,
  },
  async (args: any) => {
    try {
      const projectRoot = args.projectRoot || DEFAULT_PROJECT_ROOT;
      
      if (!existsSync(projectRoot)) {
        return {
          content: [{ type: 'text', text: `Error: Project root not found: ${projectRoot}` }],
          isError: true
        };
      }
      
      const languages = args.languages;
      
      // Validate languages if provided
      if (languages && languages.length > 0) {
        validateLanguages(languages);
      }
      
      const fileFilter = args.fileFilter;
      
      logToFile(`[create_and_translate_missing_languages] projectRoot=${projectRoot}, languages=${JSON.stringify(languages)}, fileFilter=${fileFilter}`);
      const manager = new TranslationManager(projectRoot, translatorConfig);
      const files = await manager.findDefaultStringsFiles(fileFilter);
      
      if (files.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No strings.xml files found in ${projectRoot}.` }],
          isError: true
        };
      }

      // Perform a quick connectivity check before starting background task
      await manager.checkConnectivity();

      const jobId = createJob('create_and_translate_missing_languages', languages);
      const moduleCount = files.length;
      
      runInBackground(async () => {
        startJob(jobId);
        updateJobProgress(jobId, 0, moduleCount, `Starting creation and translation of missing languages...`);
        try {
          logToFile(`[Job ${jobId}] Starting create_and_translate_missing_languages for ${projectRoot}`);
          const result = await manager.createAndTranslateMissingLanguages({
            projectRoot,
            languages,
            fileFilter,
            onProgress: (current, total, message) => {
              updateJobProgress(jobId, current, total, message);
            }
          });
          
          const summary = result.created.map(r =>
            `Module: ${r.module}\n` +
            `  Language: ${r.language}\n` +
            `  Translated: ${r.translatedCount} strings\n` +
            `  Path: ${r.path}`
          ).join('\n\n');
          
          logToFile(`[Job ${jobId}] Missing languages created and translated:\n${summary}`);
          completeJob(jobId, summary);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logToFile(`[Job ${jobId}] Error:`, error);
          failJob(jobId, errorMsg);
        }
      });
      
      const logStatus = LOG_TO_FILE ? `Logs will be written to: ${LOG_FILE}` : 'File logging is disabled - logs only go to stderr';
      return {
        content: [{
          type: 'text' as const,
          text: `Creation and translation started in background.\nJob ID: ${jobId}\nModules: ${files.length}\nCheck status with: get_job_status tool`
        }]
      };
    } catch (error) {
      const errorInfo = error instanceof InvalidLanguageError
        ? { code: error.code, message: error.message, suggest: error.suggest }
        : { code: 'UNKNOWN_ERROR', message: String(error), suggest: [] };
      
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to start missing language processing: ${errorInfo.message}${errorInfo.suggest.length > 0 ? `\n\nAvailable languages: ${errorInfo.suggest.join(', ')}` : ''}`
        }],
        isError: true,
        errorCode: errorInfo.code,
        suggest: errorInfo.suggest
      };
    }
  }
);

// Tool: Configure Logging (unified set/get)
server.registerTool(
  'configure_logging',
  {
    title: 'Configure Logging',
    description: `Enable/disable file logging or check current status. ` +
                 `When enabled, writes logs to: ${LOG_FILE}. ` +
                 `When disabled, logs only go to stderr. ` +
                 `Omit the enabled parameter to check current status without making changes.`,
    inputSchema: {
      enabled: z.boolean().optional().describe('Enable (true) or disable (false) file logging. Omit to check status.'),
    } as ZodRawShape,
  },
  async (args: any) => {
    const response: { enabled: boolean; logFile: string; message?: string } = {
      enabled: LOG_TO_FILE,
      logFile: LOG_FILE
    };
    
    if (args.enabled !== undefined) {
      const previousState = LOG_TO_FILE;
      LOG_TO_FILE = args.enabled;
      response.enabled = LOG_TO_FILE;
      response.message = `File logging ${LOG_TO_FILE ? 'enabled' : 'disabled'}`;
      logToFile(`Logging mode changed: ${previousState ? 'enabled' : 'disabled'} → ${args.enabled ? 'enabled' : 'disabled'}`);
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: `File logging: ${response.enabled ? 'enabled' : 'disabled'}\n` +
              `Log file: ${response.logFile}` +
              (response.message ? `\n${response.message}` : '')
      }]
    };
  }
);

// Tool: Get Job Status
server.registerTool(
  'get_job_status',
  {
    title: 'Get Job Status',
    description: 'Gets the status of a translation job by its ID. Use the job ID returned when starting a translation to check its progress and result.',
    inputSchema: {
      jobId: z.string().describe('The job ID to check (returned when starting a translation).'),
    } as ZodRawShape,
  },
  async (args: any) => {
    // Validate that jobId is not empty
    if (!args.jobId || args.jobId.trim() === '') {
      return {
        content: [{
          type: 'text' as const,
          text: 'jobId parameter is required and cannot be empty.\n\nValid job IDs are returned when starting async translation operations (translate_all_modules, translate_module, create_and_translate_missing_languages).'
        }],
        isError: true
      };
    }
    
    const job = getJobStatus(args.jobId);
    
    if (!job) {
      return {
        content: [{
          type: 'text' as const,
          text: `Job not found: ${args.jobId}\n\nValid job IDs are returned when starting async translation operations.`
        }],
        isError: true
      };
    }
    
    const statusIcon = job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : job.status === 'running' ? '🔄' : '⏳';
    const duration = job.completedAt
      ? `Duration: ${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
      : `Running for: ${Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000)}s`;
    
    let progressInfo = '';
    if (job.progress) {
      const pct = Math.round((job.progress.current / job.progress.total) * 100);
      progressInfo = `\nProgress: ${pct}% (${job.progress.current}/${job.progress.total})\n${job.progress.message}`;
    }
    
    let resultInfo = '';
    if (job.result) {
      resultInfo = `\n\nResult:\n${job.result}`;
    }
    
    let errorInfo = '';
    if (job.error) {
      errorInfo = `\n\nError: ${job.error}`;
    }
    
    // Build languages info - show from job data or fallback to configured languages
    let languagesInfo = '';
    if (job.languages && job.languages.length > 0) {
      languagesInfo = `\nLanguages: ${job.languages.join(', ')}`;
    } else if (TRANSLATION_LANGUAGES && TRANSLATION_LANGUAGES.length > 0) {
      languagesInfo = `\nLanguages: ${TRANSLATION_LANGUAGES.join(', ')} (from config)`;
    }
    
    return {
      content: [{
        type: 'text' as const,
        text: `${statusIcon} Job ${args.jobId}\nTool: ${job.tool}\nStatus: ${job.status}${languagesInfo}\n${duration}${progressInfo}${resultInfo}${errorInfo}`
      }]
    };
  }
);

export async function main() {
  try {
    await initLogFile();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logToFile('Android i18n MCP Server started (refactored with McpServer + Zod)');
    if (TRANSLATION_LANGUAGES) {
      logToFile(`Configured to translate to: ${TRANSLATION_LANGUAGES.join(', ')}`);
    } else {
      logToFile('No specific languages configured - will translate to all 28 supported languages');
    }
  } catch (error) {
    logToFile('Server error during main():', error);
    process.exit(1);
  }
}

// Run the server if this file is executed directly (ESM compatible)
if (process.argv[1] && __filename === process.argv[1]) {
  main();
}
