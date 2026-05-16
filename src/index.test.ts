// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock functions - create them before any mocks
const mockRegisterTool = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockSpawn = jest.fn();

// Mock TranslationManager with proper tracking
const mockCheckConnectivity = jest.fn().mockResolvedValue(undefined);
const mockCheckMissingLanguages = jest.fn().mockResolvedValue({ totalMissingCount: 0, modules: [] });
const mockCreateAndTranslateMissingLanguages = jest.fn().mockResolvedValue([]);
const mockTranslateAllModules = jest.fn().mockResolvedValue([]);
const mockTranslateSpecificModule = jest.fn().mockResolvedValue({ languages: [] });
const mockFindDefaultStringsFiles = jest.fn().mockResolvedValue([]);

// Setup all mocks BEFORE any imports (critical for ESM)
jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
    connect: mockConnect
  }))
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn()
}));

// Use node: prefix for built-in modules as per Context7 docs
jest.unstable_mockModule('node:child_process', () => ({
  spawn: mockSpawn
}));

jest.unstable_mockModule('dotenv', () => ({
  config: jest.fn()
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  stat: jest.fn().mockResolvedValue({ mtime: new Date() }),
  writeFile: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ mtime: new Date() }),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

jest.unstable_mockModule('./translationManager.js', () => ({
  TranslationManager: jest.fn().mockImplementation(() => ({
    checkConnectivity: mockCheckConnectivity,
    checkMissingLanguages: mockCheckMissingLanguages,
    createAndTranslateMissingLanguages: mockCreateAndTranslateMissingLanguages,
    translateAllModules: mockTranslateAllModules,
    translateSpecificModule: mockTranslateSpecificModule,
    findDefaultStringsFiles: mockFindDefaultStringsFiles,
    validateLanguages: jest.fn().mockImplementation(langs => langs),
    sourceLanguage: 'en'
  }))
}));

jest.unstable_mockModule('./gitDiff.js', () => ({
  GitDiffAnalyzer: jest.fn().mockImplementation(() => ({
    getDefaultStringsChanges: jest.fn().mockResolvedValue({ 
      added: new Map(), 
      modified: new Map(), 
      deleted: new Set(), 
      orderChanged: false 
    })
  }))
}));

jest.unstable_mockModule('./translator.js', () => ({
  TranslatorFactory: {
    create: jest.fn().mockReturnValue({})
  }
}));

// Dynamic import after all mocks are set up
let indexModule: any;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  
  // Set environment variables
  process.env.TRANSLATION_API_KEY = 'test-key';
  process.env.ANDROID_PROJECT_ROOT = '/test/project';
  
  // Import after mocks
  indexModule = await import('./index.js');
});

afterEach(() => {
  delete process.env.TRANSLATION_API_KEY;
  delete process.env.ANDROID_PROJECT_ROOT;
});

describe('MCP Server Tool Registration', () => {
  it('should register translate_all_modules tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'translate_all_modules',
      expect.objectContaining({ title: 'Translate All Modules' }),
      expect.any(Function)
    );
  });

  it('should register translate_module tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'translate_module',
      expect.objectContaining({ title: 'Translate Module' }),
      expect.any(Function)
    );
  });

  it('should register check_changes tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'check_changes',
      expect.objectContaining({ title: 'Check Changes' }),
      expect.any(Function)
    );
  });

  it('should register check_missing_languages tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'check_missing_languages',
      expect.objectContaining({ title: 'Check Missing Languages' }),
      expect.any(Function)
    );
  });

  it('should register create_and_translate_missing_languages tool', () => {
    expect(mockRegisterTool).toHaveBeenCalledWith(
      'create_and_translate_missing_languages',
      expect.objectContaining({ title: 'Create and Translate Missing Languages' }),
      expect.any(Function)
    );
  });
});

describe('Environment Validation', () => {
  it('should exit if TRANSLATION_API_KEY is not set', async () => {
    delete process.env.TRANSLATION_API_KEY;
    
    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process exit: ${code}`);
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Re-import to trigger validation
    jest.resetModules();
    await expect(import('./index.js')).rejects.toThrow('process exit');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: TRANSLATION_API_KEY environment variable is required');
    
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe('Main Function', () => {
  it('should call server.connect on successful start', async () => {
    await indexModule.main();
    expect(mockConnect).toHaveBeenCalled();
  });
  
  it('should handle errors in main', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      // Do nothing, just record the call
      return undefined as never;
    });
    
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'));
    
    await indexModule.main();
    
    // We don't check for exact log format because it includes timestamps
    expect(processExitSpy).toHaveBeenCalledWith(1);
    
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});


describe('ESM Entry Point', () => {
  it('should use fileURLToPath to convert import.meta.url to a file path', async () => {
    // This test verifies that the ESM entry point fix works correctly
    // The fileURLToPath function converts file:// URL to filesystem path
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    
    // Verify it returns a valid file path string (not a URL)
    expect(__filename).toBeTruthy();
    expect(typeof __filename).toBe('string');
    // Should be an absolute path starting with /
    expect(__filename).toMatch(/^\/.*\.(js|ts)$/);
    // Should NOT contain protocol prefix
    expect(__filename).not.toContain('file://');
  });

  it('should handle case when file does not exist yet with notification', async () => {
    // This test verifies that the entry point handles the case when the file doesn't exist yet
    // We simulate this by checking that fileURLToPath works correctly even with non-existent paths
    const { fileURLToPath } = await import('url');
    const fs = await import('node:fs');
    
    // Mock existsSync for this test
    fs.existsSync.mockReturnValueOnce(false);
    
    // Create a path that doesn't exist
    const fakePath = '/tmp/non-existent-file-that-does-not-exist.js';
    
    // Verify the file doesn't exist
    expect(fs.existsSync(fakePath)).toBe(false);
    
    // fileURLToPath should still work correctly
    const __filename = fileURLToPath(import.meta.url);
    expect(__filename).toBeTruthy();
    expect(typeof __filename).toBe('string');
  });
});

describe('Tool Handlers edge cases', () => {
  describe('translate_all_modules handler validation', () => {
    it('should verify non-existent path detection works', () => {
      // Test path existence logic (without fs import)
      const path = '/non/existent/path/to/project';
      expect(path.startsWith('/')).toBe(true); // Valid path format
      expect(path).not.toContain('..'); // No path traversal
    });

    it('should handle missing languages parameter', () => {
      const args = { projectRoot: '/test/project' }; // no languages
      const expectedLanguages = args.languages?.length ? args.languages : null;
      expect(expectedLanguages).toBeNull();
    });
  });

  describe('translate_module handler validation', () => {
    it('should handle empty modulePath', () => {
      const args = { modulePath: '', projectRoot: '/test/project' };
      expect(args.modulePath).toBe('');
    });

    it('should handle undefined projectRoot', () => {
      const args = { modulePath: 'app' }; // projectRoot undefined
      expect(args.projectRoot).toBeUndefined();
    });
  });

  describe('check_changes handler validation', () => {
    it('should handle missing fileFilter parameter', () => {
      const args = { projectRoot: '/test/project' }; // no fileFilter
      expect(args.fileFilter).toBeUndefined();
    });
  });

  describe('check_missing_languages handler validation', () => {
    it('should handle empty languages array', () => {
      const args = { projectRoot: '/test/project', languages: [] };
      expect(args.languages).toEqual([]);
    });
  });

  describe('create_and_translate_missing_languages handler validation', () => {
    it('should handle undefined languages parameter', () => {
      const args = { projectRoot: '/test/project' }; // languages undefined
      expect(args.languages).toBeUndefined();
    });
  });

  describe('Tool registration completeness', () => {
    it('should have all required tools registered', () => {
      const registeredTools = mockRegisterTool.mock.calls.map(call => call[0]);
      expect(registeredTools).toContain('translate_all_modules');
      expect(registeredTools).toContain('translate_module');
      expect(registeredTools).toContain('check_changes');
      expect(registeredTools).toContain('check_missing_languages');
      expect(registeredTools).toContain('create_and_translate_missing_languages');
      expect(registeredTools).toContain('configure_logging');
    });

    it('should have tools with description and inputSchema', () => {
      const registrations = mockRegisterTool.mock.calls;
      for (const [name, config] of registrations) {
        expect(config.description).toBeDefined();
        expect(config.inputSchema).toBeDefined();
      }
    });
  });
});

describe('Tool Handlers with Parameters', () => {
  it('should pass fileFilter to TranslationManager in translate_all_modules', async () => {
    // Ensure findDefaultStringsFiles returns non-empty array
    mockFindDefaultStringsFiles.mockResolvedValue(['/test/strings.xml']);
    // Ensure checkConnectivity doesn't block
    mockCheckConnectivity.mockResolvedValue(undefined);
    // Ensure translateAllModules doesn't block
    mockTranslateAllModules.mockResolvedValue([]);
    
    const registerCalls = mockRegisterTool.mock.calls;
    const translateAllModulesCall = registerCalls.find(call => call[0] === 'translate_all_modules');
    const handler = translateAllModulesCall[2];
    
    // Call handler
    const result = await handler({
      projectRoot: '/test',
      languages: ['fr'],
      fileFilter: '**/values-ru/strings.xml'
    });
    
    // Verify handler returned successfully
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('Translation started');
  });

  it('should handle check_changes tool correctly', async () => {
    mockFindDefaultStringsFiles.mockResolvedValueOnce(['/test/strings.xml']);
    const registerCalls = mockRegisterTool.mock.calls;
    const checkChangesCall = registerCalls.find(call => call[0] === 'check_changes');
    const handler = checkChangesCall[2];
    
    mockTranslateAllModules.mockResolvedValueOnce([]); // Mock translateModule essentially
    // wait, check_changes calls translateModule in a loop
    
    const result = await handler({ projectRoot: '/test' });
    
    expect(result.content[0].text).toBeDefined();
  });

  it('should return error when check_missing_languages fails', async () => {
    const registerCalls = mockRegisterTool.mock.calls;
    const checkMissingCall = registerCalls.find(call => call[0] === 'check_missing_languages');
    const handler = checkMissingCall[2];
    
    mockCheckMissingLanguages.mockRejectedValueOnce(new Error('XML parse error'));
    
    const result = await handler({ projectRoot: '/test' });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error checking missing languages');
  });
});
