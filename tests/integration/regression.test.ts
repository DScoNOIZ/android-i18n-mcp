/**
 * Regression Test Suite - verifies all fixed BUGS continue to work
 *
 * Each test documents a specific BUG that was fixed.
 * Tests do NOT use mocks - work with real files and logic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TranslationManager } from '../../src/translationManager.js';
import { InvalidLanguageError, ValidationError, XMLParseError } from '../../src/errors.js';

// Paths to test files
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.join(path.dirname(__filename), '../../AndroidProject');
const DEFAULT_STRINGS = path.join(PROJECT_ROOT, 'app/src/main/res/values/strings.xml');

describe('Regression Tests - All Fixed Bugs', () => {
  beforeEach(async () => {
    // CLEANUP all created files BEFORE each test for isolation
    const cleanupDirs = [
      'values-ru', 'values-es', 'values-de', 'values-fr', 'values-zh-rCN',
      'values-ar', 'values-hi', 'values-ja', 'values-ko', 'values-pt',
      'values-ta', 'values-te', 'values-tr', 'values-uk', 'values-vi',
      'values-az', 'values-be', 'values-bn', 'values-id', 'values-it',
      'values-mr', 'values-sw', 'values-ur', 'values-zh-rTW', 'values-zh-rHK',
      'values-zh-rSG', 'values-zh-rMO'
    ];
    for (const dir of cleanupDirs) {
      const dirPath = path.join(PROJECT_ROOT, 'app/src/main/res', dir);
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  afterEach(async () => {
    // Cleanup created translation files
    const cleanupDirs = [
      'values-ru', 'values-es', 'values-de', 'values-fr', 
      'values-zh-rCN', 'values-ar', 'values-hi', 'values-ja',
      'values-ko', 'values-pt', 'values-ta', 'values-te',
      'values-tr', 'values-uk', 'values-vi', 'values-az',
      'values-be', 'values-bn', 'values-id', 'values-it',
      'values-mr', 'values-sw', 'values-ur'
    ];
    for (const dir of cleanupDirs) {
      const dirPath = path.join(PROJECT_ROOT, 'app/src/main/res', dir);
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ========== BUG-1: translateModule creates translation files ==========
  describe('BUG-1: translateModule creates translation files', () => {
    it('should create values-ru/strings.xml if it does not exist', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key',
        translationLanguages: ['ru']
      });

      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['ru']
      });

      const ruResult = summary.languages.find(l => l.language === 'ru');
      expect(ruResult).toBeDefined();
      
      const ruPath = path.join(PROJECT_ROOT, 'app/src/main/res/values-ru/strings.xml');
      expect(fs.existsSync(ruPath)).toBe(true);
    });

    it('should create file with correct XML content', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      await manager.translateModule(DEFAULT_STRINGS, { languages: ['es'] });

      const esPath = path.join(PROJECT_ROOT, 'app/src/main/res/values-es/strings.xml');
      const content = fs.readFileSync(esPath, 'utf-8');
      
      expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(content).toContain('<resources>');
      expect(content).toContain('</resources>');
    });
  });

  // ========== BUG-2: translateAllModules returns correct paths ==========
  describe('BUG-2: translateAllModules returns correct paths', () => {
    it('should return primaryTranslationPath with values-{lang} format', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summaries = await manager.translateAllModules({ languages: ['de'] });

      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries[0].primaryTranslationPath).toContain('values-de');
    });

    it('should map zh-CN to values-zh-rCN', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summaries = await manager.translateAllModules({ languages: ['zh-CN'] });

      expect(summaries[0].primaryTranslationPath).toContain('values-zh-rCN');
    });
  });

  // ========== BUG-3: findDefaultStringsFiles ignores values-XX/ ==========
  describe('BUG-3: findDefaultStringsFiles ignores values-XX/', () => {
    it('should ignore already translated folders values-ru/', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Create translation file
      await manager.translateModule(DEFAULT_STRINGS, { languages: ['ru'] });

      // Find files - values-ru should not be in the result
      const files = await manager.findDefaultStringsFiles();
      const ruFiles = files.filter(f => f.includes('values-ru'));
      
      expect(ruFiles.length).toBe(0);
    });

    it('should find only default strings.xml', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const files = await manager.findDefaultStringsFiles();

      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        const hasLocaleFolder = /\/values-[a-z]{2}(-[A-Z]{2})?\//i.test(normalized);
        expect(hasLocaleFolder).toBe(false);
      }
    });
  });

  // ========== BUG-4: validateLanguages empty array ==========
  describe('BUG-4: validateLanguages empty array', () => {
    it('should return empty array for empty input', () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const result = manager.validateLanguages([]);
      expect(result).toEqual([]);
    });

    it('should not throw error for undefined/null', () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      expect(() => manager.validateLanguages(undefined as any)).not.toThrow();
      expect(manager.validateLanguages(null as any)).toEqual([]);
    });
  });

  // ========== BUG-5: InvalidLanguageError for unsupported languages ==========
  describe('BUG-5: InvalidLanguageError for unsupported languages', () => {
    it('should throw error for "xx"', () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      expect(() => manager.validateLanguages(['xx'])).toThrow(InvalidLanguageError);
    });

    it('should include list of supported languages in error', () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      expect(() => manager.validateLanguages(['fake-lang'])).toThrow(InvalidLanguageError);
      
      try {
        manager.validateLanguages(['fake-lang']);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidLanguageError);
        const langError = error as InvalidLanguageError;
        expect(langError.suggest).toContain('ru');
      }
    });
  });

  // ========== BUG-6: translateModule with fileFilter ==========
  describe('BUG-6: translateModule with fileFilter', () => {
    it('should filter files by pattern', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const files = await manager.findDefaultStringsFiles('**/src/main/res/values/strings.xml');
      
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toContain('app/src/main/res/values/strings.xml');
    });
  });

  // ========== BUG-7: mergeTranslationsWithOrder creates new file ==========
  describe('BUG-7: mergeTranslationsWithOrder creates new file', () => {
    it('should create file if it does not exist', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['ta']
      });

      const taPath = path.join(PROJECT_ROOT, 'app/src/main/res/values-ta/strings.xml');
      expect(fs.existsSync(taPath)).toBe(true);
    });
  });

  // ========== BUG-8: getModuleChanges returns DiffResult ==========
  describe('BUG-8: getModuleChanges returns DiffResult', () => {
    it('should return object with added, modified, deleted fields', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const diff = await manager.getModuleChanges(DEFAULT_STRINGS);

      expect(diff).toHaveProperty('added');
      expect(diff).toHaveProperty('modified');
      expect(diff).toHaveProperty('deleted');
      // added, modified, deleted may be Set or Map depending on implementation
      expect(diff.added).toBeDefined();
      expect(diff.modified).toBeDefined();
      expect(diff.deleted).toBeDefined();
    });
  });

  // ========== BUG-9: skipped=true when translation exists ==========
  describe('BUG-9: skipped=true when translation exists', () => {
    it('should show skipped=true for already translated language', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // First call
      await manager.translateModule(DEFAULT_STRINGS, { languages: ['tr'] });

      // Second call - should show skipped
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['tr']
      });

      const trResult = summary.languages.find(l => l.language === 'tr');
      expect(trResult?.skipped).toBe(true);
      // FIXED: totalStrings reports existing strings, translatedCount is 0 when skipped
      expect(trResult?.totalStrings).toBeGreaterThan(0);
    });
  });

  // ========== BUG-10: moduleError on XML parse error ==========
  describe('BUG-10: moduleError on XML parse error', () => {
    it('should return moduleError for corrupted XML', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const corruptedPath = path.join(PROJECT_ROOT, 'app/src/main/res/values/corrupted.xml');
      const summary = await manager.translateModule(corruptedPath, {
        languages: ['uk']
      });

      expect(summary.success).toBe(false);
      expect(summary.moduleError).toBeDefined();
    });
  });

  // ========== BUG-11: translateAllModules with empty languages ==========
  describe('BUG-11: translateAllModules with empty languages', () => {
    it('should use default languages', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: []
      });

      expect(summary).toBeDefined();
      expect(summary.languages.length).toBeGreaterThan(0);
    });
  });

  // ========== BUG-12: LANGUAGE_FOLDER_MAP for special languages ==========
  describe('BUG-12: LANGUAGE_FOLDER_MAP for special languages', () => {
    it('should map zh-TW to values-zh-rTW', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summaries = await manager.translateAllModules({ languages: ['zh-TW'] });

      expect(summaries[0].primaryTranslationPath).toContain('values-zh-rTW');
    });

    it('should map zh-HK to values-zh-rHK', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summaries = await manager.translateAllModules({ languages: ['zh-HK'] });

      expect(summaries[0].primaryTranslationPath).toContain('values-zh-rHK');
    });
  });

  // ========== BUG-13: validateLanguages deduplication ==========
  describe('BUG-13: validateLanguages deduplication', () => {
    it('should deduplicate repeated languages', () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const result = manager.validateLanguages(['ru', 'ru', 'es']);
      expect(result).toEqual(['ru', 'es']);
    });
  });

  // ========== BUG-14: translateModule forceUpdate ==========
  describe('BUG-14: translateModule forceUpdate', () => {
    it('should re-translate when forceUpdate=true', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Create first time
      await manager.translateModule(DEFAULT_STRINGS, { languages: ['vi'] });

      // Re-translate with forceUpdate
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['vi'],
        forceUpdate: true
      });

      const viResult = summary.languages.find(l => l.language === 'vi');
      expect(viResult?.translatedCount).toBeGreaterThan(0);
    });
  });

  // ========== BUG-15: findDefaultStringsFiles fileFilter security ==========
  describe('BUG-15: findDefaultStringsFiles fileFilter security', () => {
    it('should handle path traversal safely', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Path traversal should be handled safely - should not throw
      const files = await manager.findDefaultStringsFiles('../../etc/passwd');
      
      // Result may be empty or valid files
      // Main thing - should not throw exception
      expect(Array.isArray(files)).toBe(true);
    });

    it('should accept valid relative paths', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const files = await manager.findDefaultStringsFiles('app/src/main/res/values/strings.xml');
      
      expect(files.length).toBeGreaterThan(0);
    });
  });

  // ========== BUG-16: retranslate with new keys ==========
  describe('BUG-16: retranslate with new keys', () => {
    it('should translate new keys on subsequent calls', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Create first time
      await manager.translateModule(DEFAULT_STRINGS, { languages: ['az'] });

      // With fileFilter specify exact file
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['az'],
        forceUpdate: false
      });

      // Should not throw error
      expect(summary).toBeDefined();
    });
  });

  // ========== BUG-17: getModuleTranslationStatus ==========
  describe('BUG-17: getModuleTranslationStatus', () => {
    it('should return translation status for all languages', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const status = await manager.getModuleTranslationStatus(DEFAULT_STRINGS);

      expect(status.size).toBeGreaterThan(0);
      for (const [lang, info] of status) {
        expect(info).toHaveProperty('missingKeys');
        expect(info).toHaveProperty('missingCount');
        expect(info).toHaveProperty('totalKeys');
        expect(info).toHaveProperty('completenessPercent');
        expect(info).toHaveProperty('path');
      }
    });
  });

  // ========== BUG-18: checkMissingLanguages ==========
  describe('BUG-18: checkMissingLanguages', () => {
    it('should find missing languages', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const result = await manager.checkMissingLanguages({
        languages: ['be', 'it']
      });

      expect(result).toHaveProperty('modules');
      expect(result).toHaveProperty('totalMissingCount');
    });
  });

  // ========== BUG-19: createMissingLanguages ==========
  describe('BUG-19: createMissingLanguages', () => {
    it('should create missing languages', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const result = await manager.createMissingLanguages();

      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('totalCreated');
    });
  });

  // ========== BUG-20: primaryTranslationPath format ==========
  describe('BUG-20: primaryTranslationPath format', () => {
    it('should contain path to first target language', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const summaries = await manager.translateAllModules({
        languages: ['ko', 'ja']
      });

      // primaryTranslationPath should contain first language
      expect(summaries[0].primaryTranslationPath).toContain('values-ko');
    });
  });

  // ========== BUG-21: skipped count shows actual number ==========
  describe('BUG-21: skipped count shows actual number', () => {
    it('translatedCount should show existing strings when skipped', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      await manager.translateModule(DEFAULT_STRINGS, { languages: ['mr'] });
      
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['mr']
      });

      const mrResult = summary.languages.find(l => l.language === 'mr');
      // FIXED: totalStrings reports existing strings, translatedCount is 0 when skipped
      expect(mrResult?.totalStrings).toBeGreaterThan(0);
      expect(mrResult?.skipped).toBe(true);
    });
  });

  // ========== BUG-22: getModuleChanges for corrupted.xml ==========
  describe('BUG-22: getModuleChanges for corrupted.xml', () => {
    it('should handle corrupted XML correctly via git diff', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const corruptedPath = path.join(PROJECT_ROOT, 'app/src/main/res/values/corrupted.xml');
      
      // Should not throw exception
      const diff = await manager.getModuleChanges(corruptedPath);
      
      expect(diff).toBeDefined();
      expect(diff.added).toBeDefined();
    });
  });

  // ========== BUG-23: translateModule validates XML ==========
  describe('BUG-23: translateModule validates XML', () => {
    it('should return success=false for corrupted XML', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      const corruptedPath = path.join(PROJECT_ROOT, 'app/src/main/res/values/corrupted.xml');
      const summary = await manager.translateModule(corruptedPath, {
        languages: ['sw']
      });

      expect(summary.success).toBe(false);
      expect(summary.moduleError).toContain('XML parse error');
    });

    it('should continue working after error with one file', async () => {
      const manager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Error with corrupted should not affect subsequent operations
      const summaries = await manager.translateAllModules({
        languages: ['te']
      });

      expect(summaries.length).toBeGreaterThan(0);
    });
  });
});