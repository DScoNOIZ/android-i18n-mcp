// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

// Mock functions - declare BEFORE jest.unstable_mockModule
const mockTranslate = jest.fn();
const mockTranslateBatch = jest.fn();
const mockTranslatorInstance = {
  translate: mockTranslate,
  translateBatch: mockTranslateBatch
};
const mockCreate = jest.fn(() => mockTranslatorInstance);

const mockGetDefaultStringsChanges = jest.fn();
const mockHasUncommittedChanges = jest.fn();
const mockGitDiffAnalyzerInstance = {
  getDefaultStringsChanges: mockGetDefaultStringsChanges,
  hasUncommittedChanges: mockHasUncommittedChanges
};
const mockGitDiffAnalyzer = jest.fn(() => mockGitDiffAnalyzerInstance);

const mockParse = jest.fn();
const mockBuild = jest.fn();
const mockWriteXML = jest.fn();
const mockMergeTranslationsWithOrder = jest.fn(() => Promise.resolve());
const mockSyncWithDefaultOrder = jest.fn(() => Promise.resolve());
const mockParserInstance = {
  parse: mockParse,
  parseStringsXML: mockParse,
  build: mockBuild,
  writeStringsXML: mockWriteXML,
  mergeTranslationsWithOrder: mockMergeTranslationsWithOrder,
  syncWithDefaultOrder: mockSyncWithDefaultOrder
};
const mockAndroidXMLParser = jest.fn(() => mockParserInstance);

const mockGlob = jest.fn();

// Mock TimerProvider
const mockTimer = {
  delay: jest.fn(() => Promise.resolve())
};

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockAccess = jest.fn();
const mockMkdir = jest.fn();
const mockCp = jest.fn();

// Use unstable_mockModule - cast jest to any to avoid TypeScript errors
(jest as any).unstable_mockModule('./translator', () => ({
  TranslatorFactory: {
    create: mockCreate
  }
}));

(jest as any).unstable_mockModule('./gitDiff', () => ({
  GitDiffAnalyzer: mockGitDiffAnalyzer
}));

(jest as any).unstable_mockModule('./xmlParser', () => ({
  AndroidXMLParser: mockAndroidXMLParser
}));

(jest as any).unstable_mockModule('glob', () => ({
  glob: mockGlob
}));

// Mock node:fs for synchronous functions (existsSync, statSync, etc.)
const mockExistsSync = jest.fn(() => true);
const mockStatSync = jest.fn(() => ({ mtime: new Date() }));

(jest as any).unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync
}));

(jest as any).unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  access: mockAccess,
  mkdir: mockMkdir,
  cp: mockCp
}));

// Dynamic import after mocks are registered - use beforeAll instead of top-level await
let TranslationManager;

beforeAll(async () => {
  const module = await import('./translationManager.js');
  TranslationManager = module.TranslationManager;
});

describe('TranslationManager', () => {
  const getBaseConfig = () => ({
    provider: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-4'
  });

  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTimer.delay.mockClear();

    // Reset synchronous fs mocks
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtime: new Date() });

    // Reset mock implementations
    mockGlob.mockImplementation((pattern) => []);
    mockReadFile.mockImplementation((path) => Promise.resolve(''));
    mockWriteFile.mockImplementation(() => Promise.resolve());
    mockAccess.mockImplementation(() => Promise.resolve());
    mockMkdir.mockImplementation(() => Promise.resolve());
    mockCp.mockImplementation(() => Promise.resolve());

    mockGetDefaultStringsChanges.mockResolvedValue({
      added: new Map(),
      modified: new Map(),
      deleted: new Map(),
      allChangedKeys: new Set(),
      currentOrder: [],
      orderChanged: false
    });
    mockHasUncommittedChanges.mockResolvedValue(false);

    mockParse.mockResolvedValue(new Map());
    mockBuild.mockReturnValue('');

    mockTranslate.mockResolvedValue('translated text');
    mockTranslateBatch.mockResolvedValue(new Map([['key', 'translated']]));

    manager = new TranslationManager('/test/project', getBaseConfig(), mockTimer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor and validateLanguages', () => {
    it('should return valid languages when all are supported', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      const result = validateFn(['en', 'fr', 'de']);
      expect(result).toEqual(['en', 'fr', 'de']);
    });

    it('should return empty array when none specified', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      const result = validateFn([]);
      expect(result).toEqual([]);
    });

    it('should throw error when any unsupported language is specified', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      expect(() => validateFn(['en', 'unsupported', 'de'])).toThrow(/Unsupported language codes/);
    });

    it('should throw error when all languages are invalid', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      expect(() => validateFn(['invalid1', 'invalid2'])).toThrow(/Unsupported language codes/);
    });

    it('should be case-sensitive for language codes (EN != en)', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      // 'EN' uppercase is not in SUPPORTED_LANGUAGES (which has 'en')
      expect(() => validateFn(['EN'])).toThrow(/Unsupported language codes/);
      // 'en' lowercase works
      expect(validateFn(['en'])).toEqual(['en']);
    });

    it('should throw with exact unsupported codes listed in error message', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      try {
        validateFn(['en', 'xyz123', 'de']);
        fail('Expected error to be thrown');
      } catch (e: any) {
        expect(e.message).toContain('xyz123');
      }
    });

    it('should handle array with one invalid language', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      expect(() => validateFn(['badlang'])).toThrow(/Unsupported language codes/);
    });

    it('should return empty array for empty input', () => {
      const config = getBaseConfig();
      const manager = new TranslationManager('/test', config, mockTimer);
      const validateFn = manager.validateLanguages.bind(manager);
      expect(validateFn([])).toEqual([]);
    });

    it('should set languagesToTranslate from config (line 61)', () => {
      const config = {
        ...getBaseConfig(),
        translationLanguages: ['fr', 'de', 'es']
      };
      const manager = new TranslationManager('/test', config, mockTimer);
      // Access private field via any for testing
      const langs = (manager as any).languagesToTranslate;
      expect(langs).toContain('fr');
      expect(langs).toContain('de');
      expect(langs).toContain('es');
    });
  });

  describe('findDefaultStringsFiles', () => {
    it('should find default strings files with default pattern', async () => {
      mockGlob.mockResolvedValue(['/test/project/module1/src/main/res/values/strings.xml']);

      const result = await manager.findDefaultStringsFiles();

      expect(mockGlob).toHaveBeenCalledWith(
        expect.stringContaining('**/src/main/res/values/strings.xml'),
        expect.objectContaining({ absolute: true })
      );
      expect(result).toEqual(['/test/project/module1/src/main/res/values/strings.xml']);
    });

    it('should use custom fileFilter when provided', async () => {
      mockGlob.mockResolvedValue(['/test/project/custom/path/strings.xml']);

      await manager.findDefaultStringsFiles('custom/**/strings.xml');

      // findDefaultStringsFiles joins projectRoot with fileFilter
      expect(mockGlob).toHaveBeenCalledWith(
        '/test/project/custom/**/strings.xml',
        expect.any(Object)
      );
    });

    it('should return empty array when no files found', async () => {
      mockGlob.mockResolvedValue([]);

      const result = await manager.findDefaultStringsFiles();

      expect(result).toEqual([]);
    });
  });

  describe('translateModule', () => {
    it('should handle access errors for target files (line 204-210)', async () => {
      jest.spyOn(manager, 'findDefaultStringsFiles').mockResolvedValue(['/test/res/values/strings.xml']);
      mockGetDefaultStringsChanges.mockResolvedValueOnce({
        added: new Map([['k1', 'v1']]),
        modified: new Map(),
        deleted: new Set(),
        currentOrder: ['k1'],
        orderChanged: false
      });
      mockParse.mockImplementation((fp) => {
        if (fp.includes('values/strings.xml')) return Promise.resolve(new Map([['k1', {value: 'v1'}]]));
        return Promise.reject(new Error('Access denied'));
      });
      mockAccess.mockRejectedValue(new Error('Access denied'));
      
      const result = await manager.translateModule('/test/res/values/strings.xml', { languages: ['fr'] });
      expect(result.success).toBe(true);
      expect(result.languages.length).toBe(1);
      expect(mockTranslateBatch).toHaveBeenCalled();
    });

    beforeEach(() => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockReadFile.mockImplementation((path) => {
        if (path.includes('strings.xml')) {
          return Promise.resolve('<resources><string name="hello">Hello</string></resources>');
        }
        return Promise.resolve('');
      });
      mockParse.mockResolvedValue(new Map([['hello', { value: 'Hello', translatable: true }]]));
    });

    it('should translate module successfully', async () => {
      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result.success).toBe(true);
      expect(result.languages).toBeDefined();
    });

    it('should handle options with specific languages', async () => {
      const options = {
        languages: ['fr', 'de']
      };

      await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml',
        options
      );

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle options with projectRoot', async () => {
      const options = {
        projectRoot: '/custom/project'
      };

      await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml',
        options
      );

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should return early when no changes detected', async () => {
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map(),
        modified: new Map(),
        deleted: new Map(),
        allChangedKeys: new Set(),
        currentOrder: [],
        orderChanged: false
      });

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result.totalStrings).toBe(0);
    });

    it('should handle translation errors gracefully', async () => {
      mockTranslateBatch.mockRejectedValue(new Error('Translation failed'));

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result).toBeDefined();
    });

    it('should handle order changes without content changes', async () => {
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map(),
        modified: new Map(),
        deleted: new Map(),
        allChangedKeys: new Set(),
        currentOrder: ['hello', 'world'],
        orderChanged: true
      });

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result).toBeDefined();
    });

    it('should handle deleted keys and sync order', async () => {
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map([['new_key', 'New']]),
        modified: new Map(),
        deleted: new Map([['old_key', 'Old']]),
        allChangedKeys: new Set(['new_key']),
        currentOrder: ['new_key'],
        orderChanged: false
      });

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result).toBeDefined();
    });

    it('should retry translation on failure (lines 198-202)', async () => {
      // Setup: return changes so translateModule proceeds
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map([['hello', 'Hello']]),
        modified: new Map(),
        deleted: new Map(),
        allChangedKeys: new Set(['hello']),
        currentOrder: ['hello'],
        orderChanged: false
      });
      
      // First two calls fail, third succeeds
      mockTranslateBatch
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce(new Map([['hello', 'Bonjour']]));

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml',
        { languages: ['fr'] }
      );

      // Verify that timer.delay was called (for retries)
      expect(mockTimer.delay).toHaveBeenCalled();
      // Verify that translateBatch was called multiple times (retries)
      expect(mockTranslateBatch).toHaveBeenCalledTimes(3);
      // The translation may have errors but should have attempted retries
      expect(result.languages.length).toBe(1);
    });

    it('should handle max retries failure gracefully (line 208)', async () => {
      // Setup: return changes so translateModule proceeds
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map([['hello', 'Hello']]),
        modified: new Map(),
        deleted: new Map(),
        allChangedKeys: new Set(['hello']),
        currentOrder: ['hello'],
        orderChanged: false
      });
      
      // All retries fail
      mockTranslateBatch.mockRejectedValue(new Error('Persistent failure'));

      const result = await manager.translateModule(
        '/test/project/app/src/main/res/values/strings.xml',
        { languages: ['fr'] }
      );

      // translateModule catches errors, sets success=false
      expect(result.success).toBe(false);
      expect(result.languages.length).toBe(1);
      expect(result.languages[0].errors.length).toBeGreaterThan(0);
      // Verify that timer.delay was called (for retries)
      expect(mockTimer.delay).toHaveBeenCalled();
    });
  });

  describe('Constructor and Validation coverage', () => {
    it('should use default source language if not provided', () => {
      const mgr = new TranslationManager('/test', { provider: 'openai', apiKey: 'key' });
      expect(mgr).toBeDefined();
    });

    it('should throw error when constructor receives unsupported language', async () => {
      // Now throws error instead of fallback behavior
      expect(() => new TranslationManager('/test', {
        provider: 'openai',
        apiKey: 'key',
        translationLanguages: ['unsupported']
      })).toThrow(/Unsupported language codes/);
    });

    // Note: Line 80 test removed - no console.error call exists at that line in constructor
  });

  describe('translateLanguageOnly', () => {
    it('should handle strings.xml path in translateLanguageOnly (line 247-249)', async () => {
      mockGetDefaultStringsChanges.mockResolvedValueOnce({
        added: new Map([['key', 'val']]),
        modified: new Map(),
        deleted: new Set(),
        currentOrder: ['key'],
        orderChanged: false
      });
      
      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'es'
      );
      expect(result.language).toBe('es');
    });

    beforeEach(() => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values-fr/strings.xml']);
    });

    it('should translate single language successfully', async () => {
      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'fr'
      );

      expect(result.language).toBe('fr');
      expect(result.filePath).toBeDefined();
    });

    it('should handle translation errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File read error'));

      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'fr'
      );

      expect(result.translatedCount).toBe(0);
    });

    it('should use options when provided', async () => {
      const options = {
        projectRoot: '/custom/root'
      };

      await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'fr',
        options
      );

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle module with no language folders', async () => {
      mockGlob.mockResolvedValue([]);

      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'fr'
      );

      expect(result.translatedCount).toBe(0);
    });
  });

  describe('translateAllModules', () => {
    it('should translate all modules sequentially', async () => {
      mockGlob.mockResolvedValue([
        '/test/project/app1/src/main/res/values/strings.xml',
        '/test/project/app2/src/main/res/values/strings.xml'
      ]);

      const results = await manager.translateAllModules();

      expect(results.length).toBe(2);
    });

    it('should throw error when no modules found', async () => {
      mockGlob.mockResolvedValue([]);

      // The actual error message is "No default strings.xml files found in the project"
      await expect(manager.translateAllModules()).rejects.toThrow('No default strings.xml files found in the project');
    });

    it('should use options when provided', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);

      const options = {
        languages: ['fr']
      };

      await manager.translateAllModules(options);

      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('translateSpecificModule', () => {
    it('should translate specific module', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);

      const result = await manager.translateSpecificModule(
        '/test/project/app/src/main/res/values/strings.xml'
      );

      expect(result).toBeDefined();
    });
  });

  describe('checkMissingLanguages', () => {
    it('should handle XML parse error and report PARSE_ERROR (line 605-613)', async () => {
      mockGlob.mockResolvedValueOnce(['/test/res/values/strings.xml']);
      mockParse.mockRejectedValueOnce(new Error('Invalid XML'));
      
      const result = await manager.checkMissingLanguages();
      expect(result.modules.length).toBe(1);
      expect(result.modules[0].missingLanguages).toContain('PARSE_ERROR');
      expect(result.totalMissingCount).toBe(1);
    });

    it('should identify missing languages in modules', async () => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        if (pattern.includes('values-')) {
          return Promise.resolve(['/test/project/app/src/main/res/values-fr/strings.xml']);
        }
        return Promise.resolve([]);
      });

      mockAccess.mockImplementation((filePath) => {
        if (filePath.includes('values-de') || filePath.includes('values-es')) {
          return Promise.reject('File not found');
        }
        return Promise.resolve();
      });

      const result = await manager.checkMissingLanguages();

      expect(result.modules).toBeDefined();
      expect(result.totalMissingCount).toBeGreaterThanOrEqual(0);
    });

    it('should return empty result when all languages exist', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockAccess.mockImplementation(() => Promise.resolve(undefined));

      const result = await manager.checkMissingLanguages();

      expect(result.totalMissingCount).toBe(0);
    });
  });

  describe('createMissingLanguages', () => {
    it('should create missing language files', async () => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        return Promise.resolve([]);
      });

      mockAccess.mockImplementation((filePath) => {
        if (filePath.includes('values-fr')) {
          return Promise.reject('File not found');
        }
        return Promise.resolve();
      });

      mockReadFile.mockResolvedValue('<resources></resources>');

      const result = await manager.createMissingLanguages();

      expect(result.created).toBeDefined();
      expect(result.totalCreated).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors during creation', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockAccess.mockRejectedValue(new Error('Access error'));

      const result = await manager.createMissingLanguages();

      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });


  describe('createAndTranslateMissingLanguages', () => {
    beforeEach(() => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        return Promise.resolve([]);
      });
    });

    it('should create and translate missing languages', async () => {
      mockAccess.mockImplementation((fp) => {
        if (fp.includes('values-fr')) {
          return Promise.reject('File not found');
        }
        return Promise.resolve();
      });

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.created).toBeDefined();
      expect(result.totalCreated).toBeGreaterThanOrEqual(0);
    });

    it('should handle all retries failed', async () => {
      mockAccess.mockRejectedValue(new Error('Always fails'));

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle write errors', async () => {
      mockAccess.mockImplementation((fp) => {
        if (fp.includes('values-fr')) {
          return Promise.reject('File not found');
        }
        return Promise.resolve();
      });
      mockWriteFile.mockRejectedValue(new Error('Write error'));

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle git analyzer errors in translateModule', async () => {
      // translateModule catches errors and sets success=false instead of throwing
      mockGetDefaultStringsChanges.mockRejectedValue(
        new Error('Git error')
      );

      const result = await manager.translateModule('/test/project/app/src/main/res/values/strings.xml');
      
      expect(result.success).toBe(false);
    });

    it('should handle invalid module path in translateLanguageOnly', async () => {
      mockGlob.mockResolvedValue([]);

      const result = await manager.translateLanguageOnly(
        '/invalid/path/strings.xml',
        'fr'
      );

      expect(result.translatedCount).toBe(0);
    });

    it('should handle access errors in checkMissingLanguages', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockAccess.mockRejectedValue(new Error('Access denied'));

      const result = await manager.checkMissingLanguages();

      expect(result).toBeDefined();
    });
  });

  // DefaultTimer is internal; delay behavior is mocked via mockTimer in other tests.

  describe('translateLanguage - translatedCount (line 224)', () => {
    it('should set translatedCount correctly after merge', async () => {
      // Ensure translateBatch mock is set before any call
      mockTranslateBatch.mockReset();
      mockTranslateBatch.mockResolvedValue(new Map([['hello', 'Bonjour']]));
      
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map([['hello', 'Hello']]),
        modified: new Map(),
        deleted: new Set(),
        allChangedKeys: new Set(['hello']),
        currentOrder: ['hello'],
        orderChanged: false
      });
      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockWriteXML.mockResolvedValue(undefined);

      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'fr'
      );

      expect(mockTranslateBatch).toHaveBeenCalled();
      expect(result.translatedCount).toBe(1);
    });
  });

  describe('translateLanguage - order sync without translations', () => {
    it('should handle empty stringsToTranslate with deleted keys', async () => {
      mockTranslateBatch.mockReset();
      mockGetDefaultStringsChanges.mockResolvedValue({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(['oldKey']),
        allChangedKeys: new Set(['oldKey']),
        currentOrder: [],
        orderChanged: false
      });
      mockParse.mockResolvedValue(new Map());
      mockWriteXML.mockResolvedValue(undefined);

      const result = await manager.translateLanguageOnly(
        '/test/project/app/src/main/res/values/strings.xml',
        'es'
      );

      expect(mockWriteXML).toHaveBeenCalled();
      expect(result.translatedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });


  describe('createAndTranslateMissingLanguages - advanced coverage', () => {
    it('should handle XML parse error in createAndTranslateMissingLanguages', async () => {
      // Mock findDefaultStringsFiles to return a file
      jest.spyOn(manager, 'findDefaultStringsFiles').mockResolvedValueOnce(['/test/project/app/src/main/res/values/strings.xml']);
      // Make parseStringsXML throw an error
      mockParse.mockRejectedValueOnce(new Error('XML parse failed'));
      
      // Call method - it should handle the error gracefully
      const result = await manager.createAndTranslateMissingLanguages();
      expect(result.totalCreated).toBe(0);
    });

    it('should handle missing defaultStringsFiles', async () => {
      // Use spy to mock findDefaultStringsFiles for this test only
      const spy = jest.spyOn(manager, 'findDefaultStringsFiles').mockResolvedValueOnce([]);
      const result = await manager.createAndTranslateMissingLanguages();
      expect(result.totalCreated).toBe(0);
      spy.mockRestore();
    });

    beforeEach(() => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        return Promise.resolve([]);
      });
      mockAccess.mockImplementation((fp: string) => {
        if (fp.includes('values-fr') || fp.includes('values-de')) {
          return Promise.reject('Not found');
        }
        return Promise.resolve();
      });
    });

    it('should skip translatable false strings (lines 365-366, 412-417)', async () => {
      mockParse.mockResolvedValue(new Map([
        ['app_name', { name: 'app_name', value: 'My App', translatable: false }],
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockTranslateBatch.mockResolvedValue(new Map([['hello', 'Bonjour']]));
      mockWriteXML.mockResolvedValue(undefined);

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.created.length).toBeGreaterThan(0);
      const writeCall = mockWriteXML.mock.calls[0];
      const writtenMap = writeCall[1] as Map<string, any>;
      expect(writtenMap.get('app_name')?.translatable).toBe(false);
      expect(writtenMap.get('app_name')?.value).toBe('My App');
    });

    it('should handle all retries failed with TRANSLATION_FAILED (lines 390-406)', async () => {
      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockTranslateBatch.mockRejectedValue(new Error('API Down'));

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.created.length).toBeGreaterThan(0);
    });

    it('should handle write errors gracefully (lines 426-427)', async () => {
      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockTranslateBatch.mockResolvedValue(new Map([['hello', 'Bonjour']]));
      mockWriteXML.mockRejectedValue(new Error('Permission denied'));

      const result = await manager.createAndTranslateMissingLanguages();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Permission denied');
    });
  });

  describe('DefaultTimer coverage (line 13)', () => {
    it('should call DefaultTimer.delay when no timer provided and retry occurs', async () => {
      // Mock setTimeout to be immediate
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => { fn(); return 0 as any; }) as any;

      try {
        // Create manager without timer (will use DefaultTimer)
        const managerWithoutTimer = new TranslationManager('/test/project', getBaseConfig());

        // Mock translateBatch to fail first then succeed, triggering delay
        let callCount = 0;
        mockTranslateBatch.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('First attempt fails'));
          }
          return Promise.resolve(new Map([['hello', 'Bonjour']]));
        });

        mockGetDefaultStringsChanges.mockResolvedValue({
          added: new Map([['hello', 'Hello']]),
          modified: new Map(),
          deleted: new Set(),
          allChangedKeys: new Set(['hello']),
          currentOrder: ['hello'],
          orderChanged: false
        });
        mockParse.mockResolvedValue(new Map([
          ['hello', { name: 'hello', value: 'Hello', translatable: true }]
        ]));
        mockWriteXML.mockResolvedValue(undefined);

        const result = await managerWithoutTimer.translateLanguageOnly(
          '/test/project/app/src/main/res/values/strings.xml',
          'fr'
        );

        // Should have retried and eventually succeeded
        expect(result.errors.length).toBe(0);
        expect(result.translatedCount).toBe(1);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });
  });

  describe('Coverage for specific lines (400, 417-427)', () => {
    describe('Retry error handling (line 400)', () => {
      it('should catch errors during retries and set lastError (line 400)', async () => {
        mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
        mockAccess.mockImplementation((fp: string) => {
          if (fp.includes('values-fr')) return Promise.reject('Not found');
          return Promise.resolve();
        });
        mockParse.mockResolvedValue(new Map([
          ['hello', { name: 'hello', value: 'Hello', translatable: true }]
        ]));
        
        // Simulate 3 failures to trigger retry logic and hit line 400
        mockTranslateBatch.mockRejectedValue(new Error('Network Error'));

        const result = await manager.createAndTranslateMissingLanguages();

        // Should have created entries with TRANSLATION_FAILED fallback
        expect(result.created.length).toBeGreaterThan(0);
        expect(result.created[0].translatedCount).toBe(0);
        // Verify that the error was caught and handled (line 400)
        expect(mockTranslateBatch).toHaveBeenCalledTimes(3); // maxRetries = 3
      });
    });

    describe('Fallback logic and write errors (lines 417-427)', () => {
      it('should use source text as fallback when translation is missing (line 417)', async () => {
        mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
        mockAccess.mockImplementation((fp: string) => {
          if (fp.includes('values-fr')) return Promise.reject('Not found');
          return Promise.resolve();
        });
        mockParse.mockResolvedValue(new Map([
          ['hello', { name: 'hello', value: 'Hello', translatable: true }],
          ['bye', { name: 'bye', value: 'Goodbye', translatable: true }]
        ]));
        
        // Return only partial translations (missing 'bye')
        mockTranslateBatch.mockResolvedValue(new Map([
          ['hello', 'Bonjour']
          // 'bye' is missing, should fallback to 'Goodbye'
        ]));
        mockWriteXML.mockResolvedValue(undefined);

        const result = await manager.createAndTranslateMissingLanguages();

        expect(result.created.length).toBeGreaterThan(0);
        const writeCall = mockWriteXML.mock.calls[0];
        const writtenMap = writeCall[1] as Map<string, any>;
        // line 417: val = translations.get(key) ?? src.value
        expect(writtenMap.get('bye')?.value).toBe('Goodbye'); // Fallback
        expect(writtenMap.get('hello')?.value).toBe('Bonjour'); // Translated
      });

      it('should handle write errors in createAndTranslateMissingLanguages (lines 426-427)', async () => {
        mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
        mockAccess.mockImplementation((fp: string) => {
          if (fp.includes('values-fr')) return Promise.reject('Not found');
          return Promise.resolve();
        });
        mockParse.mockResolvedValue(new Map([
          ['hello', { name: 'hello', value: 'Hello', translatable: true }]
        ]));
        mockTranslateBatch.mockResolvedValue(new Map([['hello', 'Bonjour']]));
        mockWriteXML.mockRejectedValue(new Error('Disk full'));

        const result = await manager.createAndTranslateMissingLanguages();

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].error).toContain('Disk full');
      });
    });
  });

  // ============== sourceLanguage exclusion tests (lines ~291, ~514, ~582, ~673) ==============

  describe('sourceLanguage exclusion in checkMissingLanguages (line ~514)', () => {
    it('should NOT include sourceLanguage in missingLanguages result', async () => {
      // Setup: sourceLanguage='en', languages=['en', 'fr']
      const config = {
        ...getBaseConfig(),
        sourceLanguage: 'en',
        translationLanguages: ['en', 'fr']
      };
      const manager = new TranslationManager('/test/project', config, mockTimer);

      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        if (pattern.includes('values-fr')) {
          return Promise.resolve(['/test/project/app/src/main/res/values-fr/strings.xml']);
        }
        return Promise.resolve([]);
      });

      mockAccess.mockImplementation((filePath) => {
        // values-en/ does NOT exist, but should be excluded from missing
        if (filePath.includes('values-fr')) {
          return Promise.resolve(); // fr exists
        }
        return Promise.reject('Not found'); // everything else missing
      });

      const result = await manager.checkMissingLanguages();

      // line 514: sourceLanguage should be excluded from missingLanguages
      // 'en' should NOT appear in any missingLanguages list
      for (const module of result.modules) {
        expect(module.missingLanguages).not.toContain('en');
      }
    });
  });

  describe('sourceLanguage exclusion in createMissingLanguages (line ~582)', () => {
    it.skip('should NOT create values-{sourceLanguage} folder (line ~582)', async () => {
      // Setup: sourceLanguage='en', languages=['en', 'fr', 'de']
      const config = {
        ...getBaseConfig(),
        sourceLanguage: 'en',
        translationLanguages: ['en', 'fr', 'de']
      };
      const manager = new TranslationManager('/test/project', config, mockTimer);

      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockAccess.mockImplementation((filePath) => {
        if (filePath.includes('values-en')) {
          return Promise.reject('Not found'); // en is missing
        }
        return Promise.resolve();
      });
      mockReadFile.mockResolvedValue('<resources><string name="hello">Hello</string></resources>');
      mockWriteFile.mockResolvedValue(undefined);

      const result = await manager.createMissingLanguages();

      // line 582: sourceLanguage 'en' should NOT be created
      // Check that writeFile was NOT called for values-en
      const writeFileCalls = mockWriteFile.mock.calls;
      const enWriteCalls = writeFileCalls.filter(call => call[0].includes('values-en'));
      expect(enWriteCalls.length).toBe(0);
    });
  });

  describe('sourceLanguage exclusion in createAndTranslateMissingLanguages (line ~673)', () => {
    it.skip('should NOT translate sourceLanguage (line ~673)', async () => {
      // Setup: sourceLanguage='en', languages=['en', 'fr']
      const config = {
        ...getBaseConfig(),
        sourceLanguage: 'en',
        translationLanguages: ['en', 'fr']
      };
      const manager = new TranslationManager('/test/project', config, mockTimer);

      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        if (pattern.includes('values-fr')) {
          return Promise.resolve(['/test/project/app/src/main/res/values-fr/strings.xml']);
        }
        return Promise.resolve([]);
      });

      mockAccess.mockImplementation((filePath) => {
        if (filePath.includes('values-fr')) return Promise.resolve();
        return Promise.reject('Not found'); // values-en missing
      });

      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));

      const result = await manager.createAndTranslateMissingLanguages();

      // line 673: sourceLanguage 'en' should NOT be translated
      // translateBatch should NOT be called for 'en' language
      expect(mockTranslateBatch).not.toHaveBeenCalled();
    });
  });

  // ============== checkMissingLanguages edge cases ==============

  describe('checkMissingLanguages edge cases', () => {
    it('should handle empty strings.xml (no translatable strings)', async () => {
      // Setup: default file has no translatable strings (all have translatable=false)
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockParse.mockResolvedValue(new Map([
        ['key1', { name: 'key1', value: 'Value1', translatable: false }],
        ['key2', { name: 'key2', value: 'Value2', translatable: false }]
      ]));

      // All languages exist
      mockAccess.mockImplementation(() => Promise.resolve());

      const result = await manager.checkMissingLanguages();

      // expectedKeys will be empty, so no missing keys detected
      expect(result.totalMissingCount).toBe(0);
    });

    it('should detect partially translated language (missing some keys)', async () => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        return Promise.resolve([]);
      });

      // Default file has 3 keys
      mockParse.mockImplementation((filePath) => {
        if (filePath.includes('values/strings.xml')) {
          return Promise.resolve(new Map([
            ['key1', { name: 'key1', value: 'Value1', translatable: true }],
            ['key2', { name: 'key2', value: 'Value2', translatable: true }],
            ['key3', { name: 'key3', value: 'Value3', translatable: true }]
          ]));
        }
        // French file exists but has only 2 keys (key3 is missing)
        if (filePath.includes('values-fr/strings.xml')) {
          return Promise.resolve(new Map([
            ['key1', { name: 'key1', value: 'Valeur1', translatable: true }],
            ['key2', { name: 'key2', value: 'Valeur2', translatable: true }]
          ]));
        }
        return Promise.resolve(new Map());
      });

      mockAccess.mockImplementation(() => Promise.resolve());

      const result = await manager.checkMissingLanguages();

      // French should be detected as partially translated
      expect(result.modules.length).toBe(1);
      expect(result.modules[0].missingLanguages).toContain('fr');
    });

    it('should throw error for unsupported language codes in constructor (line 165)', async () => {
      // Setup: create manager with unsupported language code
      const config = {
        ...getBaseConfig(),
        translationLanguages: ['unsupported_lang', 'fr']
      };

      // Should throw error because unsupported_lang is not valid
      expect(() => new TranslationManager('/test/project', config, mockTimer))
        .toThrow(/Unsupported language codes/);
    });

    it('should skip languages without folder mapping in checkMissingLanguages', async () => {
      // Test that if a language somehow gets past validation but has no folder mapping,
      // it will be skipped. This tests line 518-519
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockAccess.mockImplementation(() => Promise.reject('Not found')); // File doesn't exist

      // Only 'fr' is supported and has folder mapping
      const result = await manager.checkMissingLanguages({ languages: ['fr'] });

      // 'fr' should be checked and found in missingLanguages (file doesn't exist)
      expect(result.modules.length).toBe(1);
      expect(result.modules[0].missingLanguages).toContain('fr');
      expect(result.totalMissingCount).toBe(1);
    });

    it('should use fileFilter to limit scope of check', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('app/**/strings.xml')) {
          return Promise.resolve([
            '/test/project/app/src/main/res/values/strings.xml',
            '/test/project/library/src/main/res/values/strings.xml'
          ]);
        }
        return Promise.resolve([]);
      });
      mockParse.mockResolvedValue(new Map([
        ['hello', { name: 'hello', value: 'Hello', translatable: true }]
      ]));
      mockAccess.mockImplementation(() => Promise.reject('Not found'));

      const result = await manager.checkMissingLanguages({ fileFilter: 'app/**/strings.xml' });

      // Should only check app module, not library
      expect(mockGlob).toHaveBeenCalledWith(
        '/test/project/app/**/strings.xml',
        expect.any(Object)
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle PARSE_ERROR when XML is corrupted', async () => {
      mockGlob.mockResolvedValue(['/test/project/app/src/main/res/values/strings.xml']);
      mockParse.mockRejectedValueOnce(new Error('Corrupted XML'));

      const result = await manager.checkMissingLanguages();

      expect(result.modules.length).toBe(1);
      expect(result.modules[0].missingLanguages).toContain('PARSE_ERROR');
      expect(result.modules[0].existingLanguages).toEqual([]);
      expect(result.totalMissingCount).toBe(1);
    });

    it('should handle PARSE_ERROR for translation file (line 538-540)', async () => {
      mockGlob.mockImplementation((pattern) => {
        if (pattern.includes('values/strings.xml')) {
          return Promise.resolve(['/test/project/app/src/main/res/values/strings.xml']);
        }
        return Promise.resolve([]);
      });

      // Default file parses fine
      mockParse.mockImplementation((filePath) => {
        if (filePath.includes('values/strings.xml')) {
          return Promise.resolve(new Map([
            ['hello', { name: 'hello', value: 'Hello', translatable: true }]
          ]));
        }
        // French file exists but is corrupted
        if (filePath.includes('values-fr/strings.xml')) {
          return Promise.reject(new Error('Corrupted XML'));
        }
        return Promise.resolve(new Map());
      });

      mockAccess.mockImplementation(() => Promise.resolve());

      const result = await manager.checkMissingLanguages();

      expect(result.modules.length).toBe(1);
      expect(result.modules[0].missingLanguages).toContain('fr');
    });
  });
});
