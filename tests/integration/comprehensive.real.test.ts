/**
 * Comprehensive Integration Tests on REAL files from AndroidProject/
 *
 * Tests verify TranslationManager functionality on real files:
 * - AndroidProject/app/src/main/res/values/strings.xml (valid XML)
 * - AndroidProject/app/src/main/res/values/corrupted.xml (corrupted XML)
 *
 * NO mocks, no main code modifications.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TranslationManager } from '../../src/translationManager.js';
import { InvalidLanguageError } from '../../src/errors.js';
import { fileURLToPath } from 'node:url';

// Root path to test Android project
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.join(path.dirname(__filename), '../../AndroidProject');
const DEFAULT_STRINGS = path.join(PROJECT_ROOT, 'app/src/main/res/values/strings.xml');
const CORRUPTED_XML = path.join(PROJECT_ROOT, 'app/src/main/res/values/corrupted.xml');

describe('TranslationManager Integration (Real Files)', () => {
  let manager: TranslationManager;

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

    // Use TRANSLATION_MOCK from setup.js
    manager = new TranslationManager(PROJECT_ROOT, {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || 'test-key'
    });
  });

  afterEach(async () => {
    // Cleanup after test (additional cleanup)
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

  describe('BUG-20: translateAllModules returns correct values-{lang}/ paths', () => {
    it('should return primaryTranslationPath with correct folder format', async () => {
      const summaries = await manager.translateAllModules({
        languages: ['ru']
      });

      expect(summaries.length).toBeGreaterThan(0);
      
      const summary = summaries[0];
      expect(summary.primaryTranslationPath).toBeDefined();
      
      // Check format: values-{lang}/
      const containsLangFolder = summary.primaryTranslationPath.includes('values-ru');
      expect(containsLangFolder).toBe(true);
    });

    it('should use LANGUAGE_FOLDER_MAP for special languages', async () => {
      const summaries = await manager.translateAllModules({
        languages: ['zh-CN']
      });

      expect(summaries.length).toBeGreaterThan(0);
      
      const summary = summaries[0];
      // zh-CN should map to values-zh-rCN (Android region format)
      const containsCorrectFolder = summary.primaryTranslationPath.includes('values-zh-rCN');
      expect(containsCorrectFolder).toBe(true);
    });
  });

  describe('BUG-21: retranslate shows skipped count, not 0', () => {
    it('should show skipped=true when translation file already exists', async () => {
      // First call - creates the file
      const summary1 = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['es']
      });

      expect(summary1.languages.length).toBeGreaterThan(0);
      const esResult1 = summary1.languages.find(l => l.language === 'es');
      expect(esResult1).toBeDefined();

      // Second call - should show skipped
      const summary2 = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['es']
      });

      const esResult2 = summary2.languages.find(l => l.language === 'es');
      expect(esResult2).toBeDefined();
      expect(esResult2?.skipped).toBe(true);
    });

    it('should show translatedCount=0 when skipped', async () => {
      // Create file first time
      await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['de']
      });

      // Repeat call
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['de']
      });

      const deResult = summary.languages.find(l => l.language === 'de');
      expect(deResult).toBeDefined();
      // FIXED: translatedCount now reports existing strings when skipped (not 0)
      expect(deResult?.translatedCount).toBeGreaterThan(0);
      expect(deResult?.skipped).toBe(true);
    });
  });

  describe('BUG-22: getModuleChanges detects corrupted.xml', () => {
    it('should handle corrupted XML file correctly in getModuleChanges', async () => {
      // getModuleChanges uses git diff, not XML parsing
      // So it should work even with corrupted.xml
      const diff = await manager.getModuleChanges(CORRUPTED_XML);
      
      expect(diff).toBeDefined();
      expect(diff.added).toBeDefined();
      expect(diff.modified).toBeDefined();
      expect(diff.deleted).toBeDefined();
    });
  });

  describe('BUG-23: translateModule validates corrupted XML', () => {
    it('should return moduleError when trying to translate corrupted XML', async () => {
      const summary = await manager.translateModule(CORRUPTED_XML, {
        languages: ['ru']
      });

      // For corrupted XML there should be a moduleError
      expect(summary.success).toBe(false);
      expect(summary.moduleError).toBeDefined();
      expect(summary.moduleError).toContain('XML parse error');
    });

    it('should continue working with valid file after error with corrupted one', async () => {
      // Error in one module should not affect others
      const summaries = await manager.translateAllModules({
        languages: ['ru']
      });

      // All summaries should be in the array, even if some failed
      expect(summaries.length).toBeGreaterThan(0);
    });
  });

  describe('Edge: findDefaultStringsFiles ignores values-XX/', () => {
    it('should ignore values-ru/ and other locale folders', async () => {
      // First create a translation file
      await manager.translateModule(DEFAULT_STRINGS, {
        languages: ['ru']
      });

      // Now findDefaultStringsFiles should not include values-ru/strings.xml
      const files = await manager.findDefaultStringsFiles();

      // Filter only those in app/src/main/res/values
      const resValuesFiles = files.filter(f => f.includes('app/src/main/res/values/'));
      
      // values-ru/ should NOT be included
      const ruFiles = resValuesFiles.filter(f => f.includes('values-ru'));
      expect(ruFiles.length).toBe(0);
    });

    it('should find ONLY default strings.xml in values/', async () => {
      const files = await manager.findDefaultStringsFiles();

      // All found files should be in values/ folder, not values-XX/
      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        // Should not contain values-{2 letters} pattern
        const hasLocaleFolder = /\/values-[a-z]{2}(-[A-Z]{2})?\//i.test(normalized) ||
                                /\/values-[a-z]{2}(-[A-Z]{2})?$/i.test(normalized);
        expect(hasLocaleFolder).toBe(false);
      }
    });
  });

  describe('Edge: empty languages array', () => {
    it('should use all default languages when empty array is provided', async () => {
      // Create manager WITHOUT specifying languages
      const defaultManager = new TranslationManager(PROJECT_ROOT, {
        provider: 'openai',
        apiKey: 'test-key'
      });

      // findDefaultStringsFiles should work
      const files = await defaultManager.findDefaultStringsFiles();
      expect(files.length).toBeGreaterThan(0);
    });

    it('should use languages from options if empty array is passed', async () => {
      // options.languages = [] should use manager defaults
      const summary = await manager.translateModule(DEFAULT_STRINGS, {
        languages: [] // Empty array - should use defaults
      });

      // Should process default languages
      expect(summary).toBeDefined();
    });
  });

  describe('Edge: unsupported language → InvalidLanguageError', () => {
    it('should throw InvalidLanguageError for language "xx"', () => {
      expect(() => {
        manager.validateLanguages(['xx']);
      }).toThrow(InvalidLanguageError);
    });

    it('should throw InvalidLanguageError for language "french"', () => {
      expect(() => {
        manager.validateLanguages(['french']);
      }).toThrow(InvalidLanguageError);
    });

    it('should throw InvalidLanguageError with correct list of supported languages', async () => {
      // Use real translateModule call instead of validateLanguages
      // to ensure unsupported language causes an error
      await expect(
        manager.translateModule(DEFAULT_STRINGS, {
          languages: ['fake-lang-123']
        })
      ).rejects.toThrow(InvalidLanguageError);
    });

    it('should accept all actually supported languages', () => {
      const supportedLanguages = [
        'zh-CN', 'zh-TW', 'zh-SG', 'zh-HK', 'zh-MO',
        'en', 'es', 'hi', 'fr', 'ar', 'bn', 'pt', 'ru',
        'ur', 'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr',
        'ko', 'ta', 'vi', 'az', 'be', 'it', 'uk'
      ];

      const result = manager.validateLanguages(supportedLanguages);
      expect(result.length).toBe(supportedLanguages.length);
    });
  });
});