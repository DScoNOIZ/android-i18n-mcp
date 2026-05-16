import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TranslationManager } from '../src/translationManager.js';

describe('TranslationManager Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find strings.xml in various project structures', async () => {
    const manager = new TranslationManager(tempDir, { provider: 'openai', apiKey: 'test' });

    // Structure 1: standard Gradle
    const path1 = path.join(tempDir, 'app/src/main/res/values/strings.xml');
    await fs.mkdir(path.dirname(path1), { recursive: true });
    await fs.writeFile(path1, '<resources></resources>');

    // Structure 2: simplified
    const path2 = path.join(tempDir, 'lib/res/values/strings.xml');
    await fs.mkdir(path.dirname(path2), { recursive: true });
    await fs.writeFile(path2, '<resources></resources>');

    const files = await manager.findDefaultStringsFiles();
    expect(files).toContain(path1);
    expect(files).toContain(path2);
    expect(files.length).toBe(2);
  });

  it('should detect missing keys in existing translation files', async () => {
    const manager = new TranslationManager(tempDir, { 
      provider: 'openai', 
      apiKey: 'test',
      translationLanguages: ['ru'] 
    });

    const resDir = path.join(tempDir, 'app/src/main/res');
    const defaultFile = path.join(resDir, 'values/strings.xml');
    const ruFile = path.join(resDir, 'values-ru/strings.xml');

    await fs.mkdir(path.dirname(defaultFile), { recursive: true });
    await fs.mkdir(path.dirname(ruFile), { recursive: true });

    await fs.writeFile(defaultFile, `
      <resources>
        <string name="app_name">My App</string>
        <string name="hello">Hello</string>
      </resources>
    `);

    // Ru file exists but misses "hello"
    await fs.writeFile(ruFile, `
      <resources>
        <string name="app_name">My Application</string>
      </resources>
    `);

    const missing = await manager.checkMissingLanguages();
    expect(missing.totalMissingCount).toBe(1);
    expect(missing.modules[0].missingLanguages).toContain('ru');
  });

  it('should handle invalid XML gracefully in checkMissingLanguages and report parse warnings', async () => {
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test',
      translationLanguages: ['ru']
    });

    const resDir = path.join(tempDir, 'app/src/main/res');
    const defaultFile = path.join(resDir, 'values/strings.xml');
    const ruFile = path.join(resDir, 'values-ru/strings.xml');

    await fs.mkdir(path.dirname(defaultFile), { recursive: true });
    await fs.mkdir(path.dirname(ruFile), { recursive: true });

    await fs.writeFile(defaultFile, '<resources><string name="a">A</string></resources>');
    await fs.writeFile(ruFile, '<resources>INVALID XML');

    const missing = await manager.checkMissingLanguages();
    // Invalid XML should be treated as missing
    expect(missing.totalMissingCount).toBe(1);
    expect(missing.modules[0].missingLanguages).toContain('ru');
    // Invalid XML should generate a parse warning
    expect(missing.modules[0].parseWarnings).toBeDefined();
    expect(missing.modules[0].parseWarnings!.length).toBeGreaterThan(0);
    expect(missing.modules[0].parseWarnings![0]).toContain('ru');
  });

  it('should throw XMLParseError when default strings.xml is corrupted', async () => {
    const manager = new TranslationManager(tempDir, {
      provider: 'openai',
      apiKey: 'test',
      translationLanguages: ['ru']
    });

    const resDir = path.join(tempDir, 'app/src/main/res');
    const corruptedFile = path.join(resDir, 'values/strings.xml');

    await fs.mkdir(path.dirname(corruptedFile), { recursive: true });
    // Write corrupted XML with unclosed tag
    await fs.writeFile(corruptedFile, `
      <resources>
        <string name="test">Unclosed string
      </resources>
    `);

    // Call checkMissingLanguages - should throw error
    const result = await manager.checkMissingLanguages();
    
    // Result should contain parse error information
    expect(result.modules.length).toBe(1);
    expect(result.modules[0].missingLanguages).toContain('PARSE_ERROR');
  });

  it('should throw XMLParseError for real corrupted.xml in AndroidProject', async () => {
    // Use real file AndroidProject/app/src/main/res/values/corrupted.xml
    const realProjectRoot = path.join(process.cwd(), 'AndroidProject');
    const manager = new TranslationManager(realProjectRoot, {
      provider: 'openai',
      apiKey: 'test',
      translationLanguages: ['ru']
    });

    const result = await manager.checkMissingLanguages({
      fileFilter: '**/values/corrupted.xml'
    });
    
    // corrupted.xml should be detected and marked as PARSE_ERROR
    expect(result.modules.length).toBe(1);
    expect(result.modules[0].missingLanguages).toContain('PARSE_ERROR');
  });
});
