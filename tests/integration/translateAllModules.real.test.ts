/**
 * Integration Test BUG-002: translateAllModules should create ALL languages
 *
 * BUG: When translateAllModules is called for multiple modules, the function should
 * continue working even if one module fails to translate. All modules
 * should be processed.
 *
 * TEST: Verify that translateAllModules does not abort on errors and creates
 * translation files for all modules.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import { TranslationManager } from '../../src/translationManager.js';
import { FileTestHelper } from '../utils/FileTestHelper.js';

describe('BUG-002: translateAllModules creates all languages for all modules', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await FileTestHelper.createMultiModuleProject();
  });

  afterEach(async () => {
    await FileTestHelper.cleanup(tempDir);
  });

  it('should process all modules and create files for all languages', async () => {
    // Create TranslationManager with translation to multiple languages
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: ['ru', 'es', 'de']
    });

    // Call translateAllModules
    const summaries = await manager.translateAllModules({
      languages: ['ru', 'es', 'de']
    });

    // Verify all modules were processed
    expect(summaries.length).toBe(3); // app, library, feature

    // Verify files were created for app module
    const appRuPath = path.join(tempDir, 'app/src/main/res/values-ru/strings.xml');
    const appEsPath = path.join(tempDir, 'app/src/main/res/values-es/strings.xml');
    const appDePath = path.join(tempDir, 'app/src/main/res/values-de/strings.xml');

    expect(await FileTestHelper.fileExists(appRuPath)).toBe(true);
    expect(await FileTestHelper.fileExists(appEsPath)).toBe(true);
    expect(await FileTestHelper.fileExists(appDePath)).toBe(true);

    // Verify files were created for library module
    const libRuPath = path.join(tempDir, 'library/src/main/res/values-ru/strings.xml');
    expect(await FileTestHelper.fileExists(libRuPath)).toBe(true);

    // Verify files were created for feature module
    const featRuPath = path.join(tempDir, 'feature/src/main/res/values-ru/strings.xml');
    expect(await FileTestHelper.fileExists(featRuPath)).toBe(true);
  });

  it('should return array of results for each module', async () => {
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: ['ru']
    });

    const summaries = await manager.translateAllModules({
      languages: ['ru']
    });

    // Verify result structure
    expect(Array.isArray(summaries)).toBe(true);
    expect(summaries.length).toBeGreaterThan(0);

    // Each element should contain module information
    for (const summary of summaries) {
      expect(summary.modulePath).toBeDefined();
      expect(Array.isArray(summary.languages)).toBe(true);
    }
  });

  it('should create files for all requested languages', async () => {
    const languages = ['ru', 'es', 'de', 'fr', 'ja'];
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: languages
    });

    const summaries = await manager.translateAllModules({
      languages
    });

    // Verify files were created for app module for all languages
    const appDir = path.join(tempDir, 'app/src/main/res');

    for (const lang of languages) {
      const langFolder = FileTestHelper.getLanguageFolder(lang);
      const langPath = path.join(appDir, langFolder, 'strings.xml');
      expect(await FileTestHelper.fileExists(langPath)).toBe(true);
    }
  });
});
