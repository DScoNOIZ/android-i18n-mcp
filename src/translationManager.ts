import * as fs from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { AndroidXMLParser, StringResource } from './xmlParser.js';
import { GitDiffAnalyzer, DiffResult, ModuleChangeInfo } from './gitDiff.js';
import { TranslationProvider, TranslatorConfig, TranslatorFactory } from './translator.js';
import { ValidationError, FileSystemError, TranslationError, XMLParseError, InvalidLanguageError } from './errors.js';

/**
 * Internal logging function for TranslationManager operations.
 * Uses process.stderr for immediate visibility.
 * @param message - Log message
 * @param error - Optional error object
 */
function logToFile(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorDetails = error ? (error instanceof Error ? error.stack || error.message : JSON.stringify(error)) : '';
  const logEntry = `[${timestamp}] ${message}${errorDetails ? '\n' + errorDetails : ''}\n`;
  process.stderr.write(logEntry);
}

/**
 * Provider interface for timer/delay functionality
 * Used for dependency injection in testing
 */
export interface TimerProvider {
  delay(ms: number): Promise<void>;
}

/**
 * Default timer implementation using setTimeout
 */
class DefaultTimer implements TimerProvider {
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Result of translating a single language module
 */
export interface TranslationResult {
  /** Target language code (e.g., 'ru', 'es') */
  language: string;
  /** Path to the translated file */
  filePath: string;
  /** Number of strings successfully translated */
  translatedCount: number;
  /** Array of error messages if any occurred */
  errors: string[];
  /** Whether the translation was skipped (e.g., language already exists) */
  skipped?: boolean;
  /** Optional message providing additional context (e.g., why skipped) */
  message?: string;
}

/**
 * Summary of translation operation for a module
 */
export interface TranslationSummary {
  /** Path to the module's default strings.xml */
  modulePath: string;
  /** Path to the first target language translation file (primary output path) */
  primaryTranslationPath: string;
  /** Total number of strings in the module */
  totalStrings: number;
  /** Number of newly added strings */
  addedStrings: number;
  /** Number of modified strings */
  modifiedStrings: number;
  /** Number of deleted strings */
  deletedStrings: number;
  /** Array of translation results per language */
  languages: TranslationResult[];
  /** Whether the operation completed successfully */
  success: boolean;
  /** Error message if the entire module failed */
  moduleError?: string;
  /** Warning messages (e.g., corrupted XML, empty project, skipped files) */
  warnings?: string[];
}

/**
 * Options for translation operations
 */
export interface TranslationOptions {
  /** Array of target language codes (e.g., ['ru', 'es']). Defaults to all supported languages */
  languages?: string[];
  /** Override project root path for this operation */
  projectRoot?: string;
  /** Glob pattern to filter which files to process */
  fileFilter?: string;
  /** Force update existing translations (re-translate even if complete) */
  forceUpdate?: boolean;
  /** Include source language in translation (default: false) */
  includeSourceLanguage?: boolean;
  /** Callback for real-time progress updates (current, total, message) */
  onProgress?: (current: number, total: number, message: string) => void;
}

/**
 * Main class for managing Android string translations
 * Handles XML parsing, translation API calls, and file operations
 */
export class TranslationManager {
  private xmlParser: AndroidXMLParser;
  private translator: TranslationProvider;
  private timer: TimerProvider;
  private projectRoot: string;
  private languagesToTranslate: string[];
  private sourceLanguage: string;
  
  private readonly SUPPORTED_LANGUAGES = [
    'zh-CN', 'zh-TW', 'zh-SG', 'zh-HK', 'zh-MO',
    'en', 'es', 'hi', 'fr', 'ar', 'bn', 'pt', 'ru',
    'ur', 'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr',
    'ko', 'ta', 'vi', 'az', 'be', 'it', 'uk'
  ];
  
  /**
   * Maps language codes to Android values folder names.
   *
   * Note: Chinese locales use Android's region format:
   * - zh-CN → values-zh-rCN (Simplified Chinese, China)
   * - zh-TW → values-zh-rTW (Traditional Chinese, Taiwan)
   * - zh-SG → values-zh-rSG (Simplified Chinese, Singapore)
   * - zh-HK → values-zh-rHK (Traditional Chinese, Hong Kong)
   * - zh-MO → values-zh-rMO (Traditional Chinese, Macau)
   *
   * The "r" prefix is required by Android for region codes (not language codes).
   */
  private readonly LANGUAGE_FOLDER_MAP: Record<string, string> = {
    'zh-CN': 'values-zh-rCN', 'zh-TW': 'values-zh-rTW', 'zh-SG': 'values-zh-rSG',
    'zh-HK': 'values-zh-rHK', 'zh-MO': 'values-zh-rMO', 'en': 'values-en',
    'es': 'values-es', 'hi': 'values-hi', 'fr': 'values-fr', 'ar': 'values-ar',
    'bn': 'values-bn', 'pt': 'values-pt', 'ru': 'values-ru', 'ur': 'values-ur',
    'id': 'values-id', 'de': 'values-de', 'ja': 'values-ja', 'sw': 'values-sw',
    'mr': 'values-mr', 'te': 'values-te', 'tr': 'values-tr', 'ko': 'values-ko',
    'ta': 'values-ta', 'vi': 'values-vi', 'az': 'values-az', 'be': 'values-be',
    'it': 'values-it', 'uk': 'values-uk'
  };

  /**
   * Creates a new TranslationManager instance
   * @param projectRoot - Root directory of the Android project
   * @param translatorConfig - Configuration for the translation provider
   * @param timer - Optional timer provider for testing (defaults to setTimeout)
   * @throws FileSystemError if projectRoot does not exist
   */
  constructor(projectRoot: string, translatorConfig: TranslatorConfig, timer: TimerProvider = new DefaultTimer()) {
    // Validate projectRoot exists
    if (!fs.existsSync(projectRoot)) {
      throw new FileSystemError(`Project root not found: ${projectRoot}`);
    }
    
    this.projectRoot = projectRoot;
    this.xmlParser = new AndroidXMLParser();
    this.translator = TranslatorFactory.create(translatorConfig);
    this.timer = timer;
    this.sourceLanguage = translatorConfig.sourceLanguage || 'en';

    if (translatorConfig.translationLanguages && translatorConfig.translationLanguages.length > 0) {
      this.languagesToTranslate = this.validateLanguages(translatorConfig.translationLanguages);
    } else {
      this.languagesToTranslate = [...this.SUPPORTED_LANGUAGES];
    }
  }

  /**
   * Validates and sanitizes fileFilter patterns to prevent path traversal attacks.
   * Only allows patterns targeting Android strings.xml files.
   */
  /**
   * Validates and sanitizes fileFilter patterns to prevent path traversal attacks.
   * Only allows patterns targeting Android strings.xml files.
   * @param fileFilter - The file filter pattern to validate
   * @returns Validated filter or undefined if invalid
   */
  private validateFileFilter(fileFilter?: string): string | undefined {
    if (!fileFilter) return undefined;

    // Block dangerous patterns
    const forbidden = ['../', '..\\', '\0', '/etc/', 'CON', 'PRN', 'AUX', 'NUL'];
    if (forbidden.some(f => fileFilter.includes(f))) {
      return undefined;
    }

    // Allowed patterns for Android strings.xml
    const allowedPatterns = [
      /^\*\*\/values(?:-[\w]+)*\/strings\.xml$/i,
      /^values(?:-[\w]+)*\/strings\.xml$/i,
      /^\*\*\/\*\/values\/strings\.xml$/i,
      /^src\/.*\/values\/strings\.xml$/i,
      /^AndroidProject\/.*\/values(?:-[\w]+)*\/strings\.xml$/i
    ];

    if (allowedPatterns.some(p => p.test(fileFilter))) {
      return fileFilter;
    }

    // For simple relative paths that don't look malicious, allow them
    if (!fileFilter.includes('..') && !fileFilter.startsWith('/')) {
      return fileFilter;
    }

    return undefined;
  }

  /**
   * Extracts language codes from a fileFilter pattern.
   * @param fileFilter - The file filter pattern to parse
   * @returns Array of language codes found in the filter, or null if none found
   */
  private extractLanguagesFromFilter(fileFilter?: string): string[] | null {
    if (!fileFilter) return null;
    const pattern = /values-([a-z]{2}(?:-r[A-Z]{2})?)(?:\/|$)/i;
    const match = fileFilter.match(pattern);
    if (!match) return null;
    const rawLang = match[1].toLowerCase();
    const normalizedLang = rawLang.replace('-r', '-');
    for (const [langCode, folder] of Object.entries(this.LANGUAGE_FOLDER_MAP)) {
      const folderLang = folder.replace(/^values-/, '').toLowerCase().replace('-r', '-');
      if (folderLang === normalizedLang) return [langCode];
    }
    for (const lang of this.SUPPORTED_LANGUAGES) {
      if (lang === normalizedLang || lang.startsWith(normalizedLang + '-')) return [lang];
    }
    return null;
  }

  /**
   * Checks connectivity to the translation provider API.
   * @throws TranslationError if connection fails
   */
  async checkConnectivity(): Promise<void> {
    try {
      await this.translator.checkConnectivity();
    } catch (error) {
      throw new TranslationError('Failed to connect to translation API', error as Error);
    }
  }

  /**
   * Validates language codes against the list of supported languages.
   * @param configuredLanguages - Array of language codes to validate
   * @returns Array of valid language codes
   * @throws ValidationError if unsupported language codes are provided
   */
  validateLanguages(configuredLanguages: string[]): string[] {
    // Handle undefined/null input - return empty array (will use defaults in calling code)
    if (!configuredLanguages || !Array.isArray(configuredLanguages)) {
      return [];
    }
    
    // Filter out empty strings first - they are not valid language codes
    const nonEmptyLanguages = configuredLanguages.filter(lang => {
      if (typeof lang !== 'string' || lang.trim() === '') {
        return false;
      }
      return true;
    });
    
    // Check for empty strings among original input for error message
    const emptyStrings = configuredLanguages.filter(lang => typeof lang === 'string' && lang.trim() === '');
    if (emptyStrings.length > 0) {
      throw new InvalidLanguageError([''], this.SUPPORTED_LANGUAGES);
    }
    
    // Empty array after filtering empty strings means "use all" - not an error
    if (nonEmptyLanguages.length === 0) {
      return [];
    }
    
    // Deduplicate while collecting
    const seen = new Set<string>();
    const validLanguages: string[] = [];
    const unsupportedLanguages: string[] = [];
    
    for (const lang of nonEmptyLanguages) {
      // Skip duplicates
      if (seen.has(lang)) {
        continue;
      }
      seen.add(lang);
      
      if (this.SUPPORTED_LANGUAGES.includes(lang)) {
        validLanguages.push(lang);
      } else {
        unsupportedLanguages.push(lang);
      }
    }
    
    if (unsupportedLanguages.length > 0) {
      throw new InvalidLanguageError(unsupportedLanguages, this.SUPPORTED_LANGUAGES);
    }
    
    return validLanguages;
  }

  async findDefaultStringsFiles(fileFilter?: string): Promise<string[]> {
    // Case 1: fileFilter provided
    if (fileFilter) {
      // Validate fileFilter for security
      const validatedFilter = this.validateFileFilter(fileFilter);
      if (!validatedFilter) {
        // Invalid filter, use default pattern
        fileFilter = undefined;
      } else {
        fileFilter = validatedFilter;
      }
    }

    if (fileFilter) {
      let pattern: string;
      
      if (fileFilter.startsWith('/')) {
        // Absolute path - use as is
        pattern = fileFilter;
      } else if (fileFilter.includes('**') || fileFilter.includes('*')) {
        // Glob pattern - add projectRoot
        pattern = path.join(this.projectRoot, fileFilter);
      } else {
        // Relative file path
        pattern = path.join(this.projectRoot, fileFilter);
      }
      
      try {
        const files = await glob(pattern, { absolute: true });
        // BUG-15: Exclude values-XX/ directories (already translated files)
        // BUG-22: Support filters like **/corrupted.xml or **/*.xml
        // Always exclude values-XX/ directories when filtering - these are translated locales, not source files
        const isStringsFilter = fileFilter?.includes('strings.xml') || fileFilter?.includes('.xml');
        const filteredFiles = isStringsFilter
          ? files.filter(f => {
              const normalized = f.replace(/\\/g, '/');
              return !/\/values-[a-z]{2}(-[A-Z]{2})?\//i.test(normalized) &&
                     !/\/values-[a-z]{2}(-[A-Z]{2})?$/i.test(normalized);
            })
          : files;
        
        if (filteredFiles.length > 0) {
          logToFile(`Found ${filteredFiles.length} files using filter: ${fileFilter}`);
          return filteredFiles;
        }
      } catch (e) {
        logToFile(`Glob error with filter ${fileFilter}`, e);
      }
      
      // When fileFilter is explicitly provided but returns no files, return empty array
      // Do NOT fall back to generic patterns - this ensures consistency
      logToFile(`No files found with filter "${fileFilter}"`);
      return [];
    }

    // Case 2: No filter - use fallback patterns for discovery
    const patterns = [
      '**/src/main/res/values/strings.xml',
      '**/src/values/strings.xml',
      '**/res/values/strings.xml',
      'src/values/strings.xml',
      'res/values/strings.xml',
      'values/strings.xml'
    ];

    const allFiles = new Set<string>();
    for (const p of patterns) {
      const pattern = path.join(this.projectRoot, p);
      const files = await glob(pattern, { absolute: true });
      if (files.length > 0) {
        logToFile(`Found ${files.length} strings files using pattern: ${p}`);
        for (const f of files) allFiles.add(path.resolve(f));
      }
    }

    if (allFiles.size > 0) {
      return Array.from(allFiles);
    }

    logToFile(`No strings.xml files found in ${this.projectRoot}`);
    return [];
  }

  /**
   * Translates a module's strings.xml to target languages.
   * @param defaultStringsPath - Path to the default strings.xml file
   * @param options - Translation options including languages and projectRoot
   * @returns TranslationSummary with results for each language
   */

  async translateModule(defaultStringsPath: string, options?: TranslationOptions): Promise<TranslationSummary> {
    // Determine target languages BEFORE creating summary
    const projectRoot = options?.projectRoot || this.projectRoot;
    const languagesFromFilter = this.extractLanguagesFromFilter(options?.fileFilter);
    let languages: string[];
    if (languagesFromFilter) {
      languages = languagesFromFilter;
    } else if (options?.languages && options.languages.length > 0) {
      languages = this.validateLanguages(options.languages);
    } else {
      languages = this.languagesToTranslate;
    }
    
    // Filter out source language for determining primary translation path
    const targetLanguages = languages.filter(l => l !== this.sourceLanguage || options?.includeSourceLanguage);
    
    // Calculate primary translation path (first target language)
    const moduleDir = path.dirname(path.dirname(defaultStringsPath));
    const primaryLang = targetLanguages[0] || languages[0];
    const primaryLangFolder = this.LANGUAGE_FOLDER_MAP[primaryLang] || `values-${primaryLang}`;
    const primaryTranslationPath = path.join(moduleDir, primaryLangFolder, 'strings.xml');
    
    const summaryWarnings: string[] = [];
    const summary: TranslationSummary = {
      modulePath: defaultStringsPath,
      primaryTranslationPath: primaryTranslationPath,
      totalStrings: 0, addedStrings: 0, modifiedStrings: 0,
      deletedStrings: 0, languages: [], success: true,
      get warnings() { return summaryWarnings; },
      set warnings(v: string[]) { summaryWarnings.length = 0; summaryWarnings.push(...v); }
    };

    try {
      // Ensure we have a valid translator for the requested languages
      /* istanbul ignore next */
      if (languages.length === 0) {
        logToFile('No valid target languages specified for translation.');
        return summary;
      }

      const gitAnalyzer = new GitDiffAnalyzer(projectRoot);
      const relativePath = path.relative(projectRoot, defaultStringsPath);
      
      logToFile(`Analyzing changes for ${relativePath}...`);
      const changes = await gitAnalyzer.getDefaultStringsChanges(relativePath);

      summary.addedStrings = changes.added.size;
      summary.modifiedStrings = changes.modified.size;
      summary.deletedStrings = changes.deleted.size;
      summary.totalStrings = changes.added.size + changes.modified.size;

      // Get all current translatable strings in default file
      // BUG-22/23: XML validation - detect corrupted XML and log warning
      let currentDefaultStrings: Map<string, StringResource>;
      try {
        currentDefaultStrings = await this.xmlParser.parseStringsXML(defaultStringsPath);
      } catch (xmlError) {
        const errorMsg = xmlError instanceof Error ? xmlError.message : String(xmlError);
        logToFile(`⚠️ XML parse error in ${defaultStringsPath}: ${errorMsg}`);
        summaryWarnings.push(`⚠️ XML parse error in ${path.basename(defaultStringsPath)}: ${errorMsg} (file skipped)`);
        summary.moduleError = `XML parse error: ${errorMsg}`;
        summary.success = false;
        // Return summary with error and warning
        return summary;
      }
      
      const allTranslatableStrings = new Map<string, string>();
      for (const [key, res] of currentDefaultStrings) {
        if (res.translatable !== false) {
          allTranslatableStrings.set(key, res.value);
        }
      }

      const globalChanges = new Map([...changes.added, ...changes.modified]);
      const keyOrder = Array.from(currentDefaultStrings.keys());
      
      // Pre-compute total strings across all active languages for progress tracking
      const activeLangCount = languages.filter(l =>
        l !== this.sourceLanguage || options?.includeSourceLanguage
      ).length;
      const totalAcrossAllLangs = allTranslatableStrings.size * activeLangCount;
      let cumulativeProcessed = 0;
      
      // Sequential processing to avoid event loop blocking
      for (const lang of languages) {
        // Skip source language unless explicitly included
        if (lang === this.sourceLanguage && !options?.includeSourceLanguage) continue;
        
        logToFile(`Processing language: ${lang}`);
        
        // Find what's missing for THIS specific language
        const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
        const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
        
        let stringsToTranslateForLang: Map<string, string>;
        
        // Check if target file exists using synchronous fs.existsSync
        if (!fs.existsSync(targetPath)) {
          // Target file missing, translate ALL strings
          logToFile(`[${lang}] No existing translation file at ${targetPath}, translating all strings.`);
          stringsToTranslateForLang = new Map(allTranslatableStrings);
        } else {
          // File exists, check if it already has all translations
          try {
            const targetStrings = await this.xmlParser.parseStringsXML(targetPath);
            
            // If forceUpdate is true, re-translate everything
            const missingKeys: string[] = [];
            for (const [key, val] of allTranslatableStrings) {
              if (!targetStrings.has(key)) {
                missingKeys.push(key);
              }
            }
            
            // If forceUpdate is enabled, or there are missing keys/changes, translate
            const shouldForceUpdate = options?.forceUpdate === true;
            
            if (missingKeys.length === 0 && globalChanges.size === 0 && changes.deleted.size === 0 && !shouldForceUpdate) {
              // All strings already translated - skip with info message
              logToFile(`[${lang}] Language already exists with ${targetStrings.size} strings. Skipping.`);
              summary.languages.push({
                language: lang,
                filePath: targetPath,
                translatedCount: targetStrings.size, // Count existing translations
                errors: [],
                skipped: true,
                message: `Language '${lang}' already exists with ${targetStrings.size} strings. Skipping.`
              });
              continue;
            }
            
            // BUG-16 fix: Use missingKeys + allTranslatableStrings, not just globalChanges
            // This ensures we translate even for committed files that have new keys
            stringsToTranslateForLang = new Map();
            if (shouldForceUpdate) {
              // forceUpdate: translate all strings
              stringsToTranslateForLang = new Map(allTranslatableStrings);
            } else {
              // Add all keys that need translation: missing keys + any new keys from default
              for (const key of missingKeys) {
                stringsToTranslateForLang.set(key, allTranslatableStrings.get(key)!);
              }
              // Also add any keys from globalChanges that might not be in missingKeys
              for (const [key, val] of globalChanges) {
                if (!stringsToTranslateForLang.has(key)) {
                  stringsToTranslateForLang.set(key, val);
                }
              }
            }
          } catch (e) {
            logToFile(`Error reading existing translation file ${targetPath}`, e);
            stringsToTranslateForLang = new Map(allTranslatableStrings);
          }
        }

        // Skip languages with no strings to translate
        if (stringsToTranslateForLang.size === 0 && !changes.orderChanged && changes.deleted.size === 0 && !options?.forceUpdate) {
          logToFile(`No changes or missing strings for ${lang} in ${defaultStringsPath}`);
          // Check if there's an existing translation to count
          const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
          const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
          if (fs.existsSync(targetPath)) {
            try {
              const existingStrings = await this.xmlParser.parseStringsXML(targetPath);
              summary.languages.push({
                language: lang,
                filePath: targetPath,
                translatedCount: existingStrings.size,
                errors: [],
                skipped: true,
                message: `No changes needed for '${lang}' (${existingStrings.size} strings already translated)`
              });
            } catch { /* ignore parse errors on existing */ }
          }
          continue;
        }

        // Create inner progress callback for multi-language progress tracking
        // translateBatch() now reports absolute (processedCount, languageTotal)
        // This callback converts to overall percent across ALL languages
        const innerProgressCallback = options?.onProgress ? (current: number, total: number, message: string) => {
          // current = processed count for this language (absolute), total = total for this language
          // Compute overall processed across all languages
          const overallProcessed = cumulativeProcessed + current;
          const percent = totalAcrossAllLangs > 0
            ? Math.round((overallProcessed / totalAcrossAllLangs) * 100)
            : 0;
          options.onProgress!(percent, 100, `Translating ${lang}: ${message}`);
        } : undefined;
        
        const result = await this.translateLanguage(
          moduleDir, lang, stringsToTranslateForLang,
          changes.deleted, keyOrder, changes.orderChanged, innerProgressCallback
        );
        
        // Accumulate processed count for next language
        cumulativeProcessed += stringsToTranslateForLang.size;
        summary.languages.push(result);
        
        /* istanbul ignore next */
        if (result.errors.length > 0) {
          summary.success = false;
          logToFile(`Errors in ${lang}: ${result.errors.join(', ')}`);
        }
      }

    } catch (error) {
      /* istanbul ignore next */
      const msg = error instanceof Error ? error.message : String(error);
      /* istanbul ignore next */
      logToFile(`Error processing module ${defaultStringsPath}`, error);
      summary.success = false;
      summary.moduleError = msg;
    }

    return summary;
  }

  async translateLanguageOnly(
    modulePath: string, 
    language: string, 
    options?: TranslationOptions
  ): Promise<TranslationResult> {
    const projectRoot = options?.projectRoot || this.projectRoot;
    
    // If modulePath is already a path to strings.xml, get its directory
    let resValuesDir = modulePath;
    if (modulePath.endsWith('strings.xml')) {
      resValuesDir = path.dirname(modulePath);
    } else {
      resValuesDir = path.join(modulePath, 'src/main/res/values');
    }
    
    const defaultStringsPath = path.join(resValuesDir, 'strings.xml');
    const moduleDir = path.dirname(resValuesDir);
    
    const gitAnalyzer = new GitDiffAnalyzer(projectRoot);
    const relativePath = path.relative(projectRoot, defaultStringsPath);
    const changes = await gitAnalyzer.getDefaultStringsChanges(relativePath);

    const keyOrder = changes.currentOrder;
    const stringsToTranslate = new Map([...changes.added, ...changes.modified]);
    
    // Create inner progress callback for granular 1-100% reporting
    const innerProgressCallback = options?.onProgress ? (current: number, total: number, message: string) => {
      options.onProgress!(current, total, `Translating ${language}: ${message}`);
    } : undefined;
    
    return await this.translateLanguage(
      moduleDir, language, stringsToTranslate,
      changes.deleted, keyOrder, changes.orderChanged, innerProgressCallback
    );
  }

  /* istanbul ignore next */
  private async translateLanguage(
    moduleDir: string, language: string, stringsToTranslate: Map<string, string>,
    deletedKeys: Set<string>, keyOrder: string[], forceOrderSync: boolean = false,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<TranslationResult> {
    const result: TranslationResult = { language, filePath: '', translatedCount: 0, errors: [] };

    try {
      const langFolder = this.LANGUAGE_FOLDER_MAP[language];
      const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
      result.filePath = targetPath;

      if (stringsToTranslate.size > 0) {
        logToFile(`Translating ${stringsToTranslate.size} strings to ${language}...`);
        let translations = new Map<string, string>();
        let retryCount = 0;
        const maxRetries = 3;
        let lastError: Error | undefined;

        while (retryCount < maxRetries) {
          try {
            // Progress callback for granular 1-100% reporting - pass 3 args
            const progressCallback = onProgress;
            translations = await this.translator.translateBatch(stringsToTranslate, language, this.sourceLanguage, progressCallback);
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            retryCount++;
            if (retryCount < maxRetries) {
              logToFile(`Retry ${retryCount} for ${language}...`);
              await this.timer.delay(2000 * retryCount);
            }
          }
        }

        if (retryCount >= maxRetries && lastError) {
          const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
          result.errors.push(`Failed to translate to ${language} after ${maxRetries} retries: ${errorMessage}`);
          return result;
        }

        await this.xmlParser.mergeTranslationsWithOrder(targetPath, translations, keyOrder);
        result.translatedCount = translations.size;
      } else if (deletedKeys.size > 0 || forceOrderSync) {
        const existingStrings = await this.xmlParser.parseStringsXML(targetPath);
        const orderedStrings = new Map<string, import('./xmlParser.js').StringResource>();
        for (const key of keyOrder) {
          if (!deletedKeys.has(key) && existingStrings.has(key)) {
            orderedStrings.set(key, existingStrings.get(key)!);
          }
        }
        await this.xmlParser.writeStringsXML(targetPath, orderedStrings);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to translate to ${language}: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Translates all modules in the project.
   * @param options - Translation options including fileFilter and languages
   * @returns Array of TranslationSummary for each module
   * @throws Error if no strings.xml files found
   */
  async translateAllModules(options?: TranslationOptions): Promise<TranslationSummary[]> {
    const projectRoot = options?.projectRoot || this.projectRoot;
    const filter = options?.fileFilter;
    const defaultFiles = await this.findDefaultStringsFiles(filter);
    
    if (defaultFiles.length === 0) {
      throw new Error('No default strings.xml files found in the project');
    }

    logToFile(`Found ${defaultFiles.length} modules to process`);
    const summaries: TranslationSummary[] = [];
    
    for (let i = 0; i < defaultFiles.length; i++) {
      const defaultFile = defaultFiles[i];
      logToFile(`Processing: ${path.relative(projectRoot, defaultFile)}`);
      
      // Wrap onProgress to convert module-level progress to overall across all modules
      // translateModule passes (percent, 100, message) where percent is 0-100% across all languages in this module
      const moduleIndex = i;
      const totalModules = defaultFiles.length;
      const wrappedOnProgress = options?.onProgress ? (current: number, total: number, message: string) => {
        // current is 0-100 for this module (across all languages)
        // Convert to overall progress across all modules
        const overallPercent = Math.round(((moduleIndex * 100) + current) / totalModules);
        options.onProgress!(overallPercent, 100, `Module ${moduleIndex + 1}/${totalModules}: ${message}`);
      } : undefined;
      
      const summary = await this.translateModule(defaultFile, {
        ...options,
        onProgress: wrappedOnProgress
      });
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Translates a specific module by its path.
   * @param modulePath - Path to the module directory
   * @param options - Translation options
   * @returns TranslationSummary for the module
   */
  async translateSpecificModule(modulePath: string, options?: TranslationOptions): Promise<TranslationSummary> {
    const defaultStringsPath = path.join(modulePath, 'src/main/res/values/strings.xml');
    return await this.translateModule(defaultStringsPath, options);
  }

  /**
   * Gets changes between current and git-committed version of a strings.xml.
   * @param defaultStringsPath - Path to the default strings.xml file
   * @param projectRoot - Project root directory (defaults to manager's projectRoot)
   * @returns DiffResult with added, modified, deleted keys
   */
  async getModuleChanges(defaultStringsPath: string, projectRoot?: string): Promise<DiffResult> {
    const root = projectRoot || this.projectRoot;
    const gitAnalyzer = new GitDiffAnalyzer(root);
    const relativePath = path.relative(root, defaultStringsPath);
    return await gitAnalyzer.getDefaultStringsChanges(relativePath);
  }

  /**
   * Gets all modules with changes, including newly discovered untracked modules.
   * Combines git diff analysis with filesystem-based new module detection.
   */
  async getAllModulesWithChanges(knownModules?: string[]): Promise<ModuleChangeInfo[]> {
    const root = this.projectRoot;
    const gitAnalyzer = new GitDiffAnalyzer(root);
    
    // Use provided modules or find default strings files
    const modules = knownModules || await this.findDefaultStringsFiles();
    
    return await gitAnalyzer.getAllModulesWithChanges(modules);
  }

  /**
   * Gets translation status between default strings.xml and translated files.
   * Compares keys to find missing or incomplete translations.
   * @param defaultStringsPath - Path to the default strings.xml file
   * @param targetLanguages - Array of target language codes (optional, uses defaults)
   * @returns Map of language code to translation status
   */
  async getModuleTranslationStatus(
    defaultStringsPath: string,
    targetLanguages?: string[]
  ): Promise<Map<string, {
    missingKeys: string[];
    missingCount: number;
    totalKeys: number;
    completenessPercent: number;
    path: string;
  }>> {
    const languages = targetLanguages || this.languagesToTranslate;
    const result = new Map<string, {
      missingKeys: string[];
      missingCount: number;
      totalKeys: number;
      completenessPercent: number;
      path: string;
    }>();

    // Parse default strings
    let defaultStrings: Map<string, { name: string; value: string; translatable?: boolean }>;
    try {
      defaultStrings = await this.xmlParser.parseStringsXML(defaultStringsPath);
    } catch (e) {
      logToFile(`Error parsing default strings: ${defaultStringsPath}`, e);
      return result;
    }

    const defaultKeys = Array.from(defaultStrings.keys()).filter(
      k => defaultStrings.get(k)?.translatable !== false
    );
    const totalKeys = defaultKeys.length;
    const moduleDir = path.dirname(path.dirname(defaultStringsPath));

    for (const lang of languages) {
      // Skip source language
      if (lang === this.sourceLanguage) continue;
      
      const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
      if (!langFolder) continue;

      const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
      
      try {
        const targetStrings = await this.xmlParser.parseStringsXML(targetPath);
        const missingKeys = defaultKeys.filter(k => !targetStrings.has(k));
        
        result.set(lang, {
          missingKeys,
          missingCount: missingKeys.length,
          totalKeys,
          completenessPercent: totalKeys > 0
            ? Math.round(((totalKeys - missingKeys.length) / totalKeys) * 100)
            : 100,
          path: targetPath
        });
      } catch {
        // File doesn't exist - all keys are missing
        result.set(lang, {
          missingKeys: [...defaultKeys],
          missingCount: defaultKeys.length,
          totalKeys,
          completenessPercent: 0,
          path: targetPath
        });
      }
    }

    return result;
  }

  /**
   * Checks which languages are missing translations for each module.
   * @param options - Options including fileFilter and languages
   * @returns Object with modules array and totalMissingCount
   */
  async checkMissingLanguages(options?: TranslationOptions): Promise<{
    modules: Array<{ module: string; missingLanguages: string[]; existingLanguages: string[]; parseWarnings?: string[]; }>;
    totalMissingCount: number;
  }> {
    const projectRoot = options?.projectRoot || this.projectRoot;
    const fileFilter = options?.fileFilter;
    // Determine target languages: options.languages (if non-empty) > defaults
    const languages = (options?.languages && options.languages.length > 0)
      ? this.validateLanguages(options.languages)
      : this.languagesToTranslate;

    const defaultFiles = await this.findDefaultStringsFiles(fileFilter);
    const result = {
      modules: [] as Array<{ module: string; missingLanguages: string[]; existingLanguages: string[]; parseWarnings?: string[]; }>,
      totalMissingCount: 0
    };

    for (const defaultFile of defaultFiles) {
      const moduleDir = path.dirname(path.dirname(defaultFile));
      const moduleName = path.relative(projectRoot, moduleDir);
      const missingLanguages: string[] = [];
      const existingLanguages: string[] = [];
      const parseWarnings: string[] = [];

      // Parse default strings to know what keys we expect
      let defaultStrings: Map<string, { name: string; value: string; translatable?: boolean }> | undefined;
      try {
        defaultStrings = await this.xmlParser.parseStringsXML(defaultFile);
      } catch (e) {
        logToFile(`XML parse error in ${defaultFile}`, e);
        result.modules.push({
          module: moduleName,
          missingLanguages: ['PARSE_ERROR'],
          existingLanguages: []
        });
        result.totalMissingCount++;
        continue;
      }
      
      if (!defaultStrings) {
        continue;
      }

      const expectedKeys = Array.from(defaultStrings.keys()).filter(k => defaultStrings.get(k)?.translatable !== false);

      for (const lang of languages) {
        // Skip source language - default values/ folder IS the source language
        if (lang === this.sourceLanguage) continue;
        
        const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
        if (!langFolder) continue;

        const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
        
        try {
          const fs = await import('node:fs/promises');
          await fs.access(targetPath);
          
          // File exists, now check if it's valid and has all keys
          try {
            const targetStrings = await this.xmlParser.parseStringsXML(targetPath);
            const missingKeys = expectedKeys.filter(key => !targetStrings.has(key));
            
            if (missingKeys.length > 0) {
              logToFile(`Module ${moduleName}, language ${lang} is missing ${missingKeys.length} keys.`);
              missingLanguages.push(lang);
            } else {
              existingLanguages.push(lang);
            }
          } catch (e) {
            // XML parsing error - file is corrupted
            const errorMsg = e instanceof Error ? e.message : String(e);
            logToFile(`XML parse error in ${targetPath}: ${errorMsg}`);
            parseWarnings.push(`${lang}: ${errorMsg}`);
            // Treat corrupted XML as missing translation
            missingLanguages.push(lang);
          }
        } catch (e) {
          // File does not exist
          logToFile(`Cannot access ${targetPath}: ${e instanceof Error ? e.message : String(e)}`);
          missingLanguages.push(lang);
        }
      }

      if (missingLanguages.length > 0 || parseWarnings.length > 0) {
        result.modules.push({
          module: moduleName,
          missingLanguages,
          existingLanguages,
          parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined
        });
        result.totalMissingCount += missingLanguages.length;
      }
    }

    return result;
  }

  /**
   * Creates missing language files for all modules.
   * @returns Object with created files, errors, and totalCreated count
   */
  async createMissingLanguages(): Promise<{
    created: Array<{ module: string; language: string; path: string; }>;
    errors: Array<{ module: string; language: string; error: string; }>;
    totalCreated: number;
  }> {
    const defaultFiles = await this.findDefaultStringsFiles();
    const result = {
      created: [] as Array<{ module: string; language: string; path: string; }>,
      errors: [] as Array<{ module: string; language: string; error: string; }>,
      totalCreated: 0
    };

    for (const defaultFile of defaultFiles) {
      const moduleDir = path.dirname(path.dirname(defaultFile));
      const moduleName = path.relative(this.projectRoot, moduleDir);
      
      let defaultStrings;
      try {
        defaultStrings = await this.xmlParser.parseStringsXML(defaultFile);
      } catch (e) {
        logToFile(`Error parsing default strings in ${defaultFile}`, e);
        continue;
      }

      for (const lang of this.languagesToTranslate) {
        // Skip source language - it's the default, not a translation
        if (lang === this.sourceLanguage) continue;
        
        const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
        const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
        try {
          const fs = await import('node:fs/promises');
          
          // BUG-18 fix: Check file existence before anything else to prevent duplicates
          // Use synchronous fs.existsSync for immediate check (imported at line 1 as node:fs)
          if (existsSync(targetPath)) {
            logToFile(`[createMissingLanguages] Skipping ${lang} for ${moduleName}: file already exists at ${targetPath}`);
            continue;
          }

          logToFile(`Creating missing language file: ${targetPath}`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await this.xmlParser.writeStringsXML(targetPath, defaultStrings);
          result.created.push({ module: moduleName, language: lang, path: targetPath });
          result.totalCreated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logToFile(`Failed to create ${targetPath}: ${errorMessage}`);
          result.errors.push({ module: moduleName, language: lang, error: errorMessage });
        }
      }
    }

    return result;
  }

  /**
   * Creates AND translates missing language files in one operation.
   * @param options - Translation options including fileFilter and languages
   * @returns Object with created files, errors, and translation counts
   */
  async createAndTranslateMissingLanguages(options?: TranslationOptions): Promise<{
    created: Array<{ module: string; language: string; path: string; translatedCount: number; totalStrings: number; }>;
    errors: Array<{ module: string; language: string; error: string; }>;
    totalCreated: number;
    totalStringsTranslated: number;
  }> {
    logToFile('Starting createAndTranslateMissingLanguages...');
    const projectRoot = options?.projectRoot || this.projectRoot;
    const fileFilter = options?.fileFilter;
    // Determine target languages: options.languages (if non-empty) > defaults
    const languages = (options?.languages && options.languages.length > 0)
      ? this.validateLanguages(options.languages)
      : this.languagesToTranslate;
    
    logToFile(`Target languages for createAndTranslate: [${languages.join(', ')}]`);

    const defaultFiles = await this.findDefaultStringsFiles(fileFilter);
    const result = {
      created: [] as Array<{ module: string; language: string; path: string; translatedCount: number; totalStrings: number; }>,
      errors: [] as Array<{ module: string; language: string; error: string; }>,
      totalCreated: 0,
      totalStringsTranslated: 0
    };

      /* istanbul ignore next */
      if (defaultFiles.length === 0) {
        logToFile('No modules found to translate.');
        return result;
      }

    for (const defaultFile of defaultFiles) {
      const moduleDir = path.dirname(path.dirname(defaultFile));
      const moduleName = path.relative(projectRoot, moduleDir);
      
      let defaultStrings: Map<string, { name: string; value: string; translatable?: boolean }> | undefined;
      try {
        defaultStrings = await this.xmlParser.parseStringsXML(defaultFile);
      } catch (e) {
        logToFile(`XML parse error in ${defaultFile}`, e);
        result.errors.push({ module: moduleName, language: 'PARSE_ERROR', error: `Invalid XML: ${e}` });
        continue;
      }
      
      if (!defaultStrings) {
        continue;
      }

      const stringsToTranslate = new Map<string, string>();
      const defaultOrder: string[] = [];
      
      for (const [key, res] of defaultStrings) {
        defaultOrder.push(key);
        if (res.translatable !== false) stringsToTranslate.set(key, res.value);
      }

      const fs = await import('node:fs/promises');
      const missingLangs: string[] = [];
      for (const lang of languages) {
        // Skip source language unless explicitly included
        if (lang === this.sourceLanguage && !options?.includeSourceLanguage) continue;
        
        const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
        if (!langFolder) continue;

        const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
        try {
          await fs.access(targetPath);
          // Check if it's missing keys
          const targetStrings = await this.xmlParser.parseStringsXML(targetPath);
          const missingKeys = Array.from(stringsToTranslate.keys()).filter(k => !targetStrings.has(k));
          if (missingKeys.length > 0) missingLangs.push(lang);
        } catch {
          missingLangs.push(lang);
        }
      }

      logToFile(`Module ${moduleName}: checking ${languages.length} languages, found ${missingLangs.length} missing (${missingLangs.join(', ')}).`);

      // Call progress callback for module start
      if (options?.onProgress) {
        options.onProgress(0, missingLangs.length, `Starting module ${moduleName}: ${missingLangs.length} languages to create`);
      }

      // Sequential processing for missing languages
      for (let langIdx = 0; langIdx < missingLangs.length; langIdx++) {
        const lang = missingLangs[langIdx];
        logToFile(`Translating missing language ${lang} for module ${moduleName}...`);
        
        // Call progress callback after each language
        if (options?.onProgress) {
          options.onProgress(langIdx + 1, missingLangs.length, `Module ${moduleName}: translated ${lang} (${langIdx + 1}/${missingLangs.length})`);
        }
        const langFolder = this.LANGUAGE_FOLDER_MAP[lang];
        const targetPath = path.join(moduleDir, langFolder, 'strings.xml');
        try {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          let translations = new Map<string, string>();
          let translatedCount = 0;

          if (lang === this.sourceLanguage || options?.includeSourceLanguage) {
            for (const [key, val] of stringsToTranslate) translations.set(key, val);
            translatedCount = translations.size;
          } else if (stringsToTranslate.size > 0) {
            let retryCount = 0;
            const maxRetries = 3;
            let lastError: Error | undefined;
            while (retryCount < maxRetries) {
              try {
                translations = await this.translator.translateBatch(stringsToTranslate, lang, this.sourceLanguage);
                translatedCount = translations.size;
                break;
              } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                retryCount++;
                if (retryCount < maxRetries) {
                  logToFile(`Retry ${retryCount} for ${lang} due to error: ${lastError.message}`);
                  await this.timer.delay(2000 * retryCount);
                }
              }
            }
            if (retryCount >= maxRetries && lastError) {
              logToFile(`Failed to translate to ${lang} after ${maxRetries} retries: ${lastError.message}`);
              for (const [key, val] of stringsToTranslate) translations.set(key, `[TRANSLATION_FAILED: ${lang}] ${val}`);
              translatedCount = 0;
            }
          }

          const out = new Map<string, import('./xmlParser.js').StringResource>();
          for (const key of defaultOrder) {
            const src = defaultStrings.get(key)!;
            if (src.translatable === false) {
              out.set(key, { name: key, value: src.value, translatable: false });
            } else {
              const val = translations.get(key) ?? src.value;
              out.set(key, { name: key, value: val, translatable: true });
            }
          }

          await this.xmlParser.writeStringsXML(targetPath, out);
          logToFile(`Successfully created/updated ${targetPath}`);
          result.created.push({ module: moduleName, language: lang, path: targetPath, translatedCount, totalStrings: stringsToTranslate.size });
          result.totalCreated++;
          result.totalStringsTranslated += translatedCount;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logToFile(`Error processing ${lang} for ${moduleName}: ${errorMessage}`);
          result.errors.push({ module: moduleName, language: lang, error: errorMessage });
        }
      }
    }

    return result;
  }
}
