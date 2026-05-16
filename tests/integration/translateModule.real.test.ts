/**
 * Integration Test BUG-001: translateModule should create translation files
 *
 * BUG: When translateModule is called for a language that doesn't have a
 * strings.xml file yet (e.g., values-ru/strings.xml), the function should create it.
 *
 * TEST: Verify that translateModule.createLanguageFile() creates translation files
 * when they don't exist.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import { TranslationManager } from '../../src/translationManager.js';
import { FileTestHelper } from '../utils/FileTestHelper.js';

describe('BUG-001: translateModule creates translation files', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await FileTestHelper.createTempAndroidProject();
  });

  afterEach(async () => {
    await FileTestHelper.cleanup(tempDir);
  });

  it('should create values-ru/strings.xml file when it does not exist', async () => {
    // Create TranslationManager with Russian translation
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: ['ru']
    });

    // Path to default strings.xml
    const defaultStringsPath = path.join(tempDir, 'app/src/main/res/values/strings.xml');
    
    // Verify translation file doesn't exist yet
    const ruPathBefore = path.join(tempDir, 'app/src/main/res/values-ru/strings.xml');
    expect(await FileTestHelper.fileExists(ruPathBefore)).toBe(false);

    // Call translateModule - should create file
    const summary = await manager.translateModule(defaultStringsPath, {
      languages: ['ru']
    });

    // Verify summary contains results for Russian language
    expect(summary.languages.length).toBeGreaterThan(0);
    const ruResult = summary.languages.find(l => l.language === 'ru');
    expect(ruResult).toBeDefined();

    // Verify file was created
    const ruPath = path.join(tempDir, 'app/src/main/res/values-ru/strings.xml');
    expect(await FileTestHelper.fileExists(ruPath)).toBe(true);

    // Verify file contains translated strings
    const content = await FileTestHelper.readFile(ruPath);
    expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(content).toContain('<resources>');
  });

  it('should create values-es/strings.xml file for Spanish language', async () => {
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: ['es']
    });

    const defaultStringsPath = path.join(tempDir, 'app/src/main/res/values/strings.xml');
    
    // Call translateModule
    const summary = await manager.translateModule(defaultStringsPath, {
      languages: ['es']
    });

    // Verify file was created
    const esPath = path.join(tempDir, 'app/src/main/res/values-es/strings.xml');
    expect(await FileTestHelper.fileExists(esPath)).toBe(true);

    // Verify summary contains results for Spanish
    const esResult = summary.languages.find(l => l.language === 'es');
    expect(esResult).toBeDefined();
  });

  it('should create values-de/strings.xml file for German language', async () => {
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test-api-key',
      translationLanguages: ['de']
    });

    const defaultStringsPath = path.join(tempDir, 'app/src/main/res/values/strings.xml');
    
    const summary = await manager.translateModule(defaultStringsPath, {
      languages: ['de']
    });

    // Verify file was created
    const dePath = path.join(tempDir, 'app/src/main/res/values-de/strings.xml');
    expect(await FileTestHelper.fileExists(dePath)).toBe(true);

    // Verify file content
    const content = await FileTestHelper.readFile(dePath);
    expect(content).toContain('<resources>');
  });
});
