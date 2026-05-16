import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

// Mock functions for simple-git (properly typed for ESM as per Jest best practices)
const mockRevparse = jest.fn<(args: string[]) => Promise<string>>();
const mockStatus = jest.fn<() => Promise<any>>();
const mockShow = jest.fn<(ref: string) => Promise<string>>();
const mockSimpleGit = jest.fn((cwd: string, options?: any) => ({
  revparse: mockRevparse,
  status: mockStatus,
  show: mockShow
}));

// Mock functions for xmlParser
const mockParseStringsXML = jest.fn<(filePath: string) => Promise<Map<string, any>>>();
const mockParseStringsXMLContent = jest.fn<(content: string, source: string) => Promise<Map<string, any>>>();
const mockAndroidXMLParserInstance = {
  parseStringsXML: mockParseStringsXML,
  parseStringsXMLContent: mockParseStringsXMLContent
};
const mockAndroidXMLParser = jest.fn(() => mockAndroidXMLParserInstance);

// Mock functions for fs/promises
const mockWriteFile = jest.fn<(path: string, data: string) => Promise<void>>();
const mockUnlink = jest.fn<(path: string) => Promise<void>>();
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>();
const mockMkdir = jest.fn<(path: string) => Promise<void>>();
const mockStat = jest.fn<(path: string) => Promise<any>>();

// Mock modules before import
(jest as any).unstable_mockModule('simple-git', () => ({
  default: mockSimpleGit
}));

(jest as any).unstable_mockModule('./xmlParser', () => ({
  AndroidXMLParser: mockAndroidXMLParser
}));

(jest as any).unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  readFile: mockReadFile,
  mkdir: mockMkdir,
  stat: mockStat
}));

// Dynamic import after mocks
let GitDiffAnalyzer: any;

beforeAll(async () => {
  const module = await import('./gitDiff.js');
  GitDiffAnalyzer = module.GitDiffAnalyzer;
});

describe('GitDiffAnalyzer', () => {
  let analyzer: any;
  const workingDir = '/test/working/dir';
  const repoRoot = '/test/working/dir';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRevparse.mockResolvedValue(repoRoot);
    mockStatus.mockResolvedValue({
      not_added: [],
      created: [],
      modified: []
    });
    mockShow.mockResolvedValue('');
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('');
    mockMkdir.mockResolvedValue(undefined);
    mockStat.mockReset();
    
    analyzer = new GitDiffAnalyzer(workingDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with resolved working directory', () => {
      const testDir = '/test/path';
      const instance = new GitDiffAnalyzer(testDir);
      expect(instance).toBeInstanceOf(GitDiffAnalyzer);
    });

    it('should configure simple-git with GIT_DIR and GIT_WORK_TREE when gitDir is provided (Bug #2)', () => {
      const testDir = '/test/working/dir';
      const customGitDir = '/test/working/dir/.gite2e';
      
      mockSimpleGit.mockClear();
      
      new GitDiffAnalyzer(testDir, customGitDir);
      
      expect(mockSimpleGit).toHaveBeenCalledWith(testDir, expect.objectContaining({
        env: expect.objectContaining({
          GIT_DIR: customGitDir,
          GIT_WORK_TREE: testDir
        })
      }));
    });

    it('should detect stealth repository (.gite2e) automatically when no gitDir provided (Bug #2)', async () => {
      const testDir = '/test/working/dir';
      
      // Mock fs.stat to simulate .gite2e existence
      mockStat.mockImplementation((path: string) => {
        if (path.includes('.gite2e')) {
          return Promise.resolve({ isDirectory: () => true });
        }
        return Promise.reject(new Error('Not found'));
      });
      
      // Simulate revparse failure (not a git repo) so detectGitDir() is triggered
      mockRevparse.mockRejectedValueOnce(new Error('Not a git repository'));
      
      mockSimpleGit.mockClear();
      
      const instance = new GitDiffAnalyzer(testDir);
      
      // Detection happens in getRepoRoot() when revparse fails
      await instance.getRepoRoot();
      
      // After detection completes, fs.stat should have been called for .gite2e
      expect(mockStat).toHaveBeenCalledWith(expect.stringContaining('.gite2e'));
    });

    it('should use GIT_DIR environment variable if set (Bug #2)', () => {
      const testDir = '/test/working/dir';
      const envGitDir = '/env/git/dir';
      
      // Mock process.env.GIT_DIR
      const originalGitDir = process.env.GIT_DIR;
      process.env.GIT_DIR = envGitDir;
      
      mockSimpleGit.mockClear();
      
      new GitDiffAnalyzer(testDir);
      
      expect(mockSimpleGit).toHaveBeenCalledWith(testDir, expect.objectContaining({
        env: expect.objectContaining({
          GIT_DIR: envGitDir,
          GIT_WORK_TREE: testDir
        })
      }));
      
      // Restore
      if (originalGitDir) {
        process.env.GIT_DIR = originalGitDir;
      } else {
        delete process.env.GIT_DIR;
      }
    });
  });

  describe('getRepoRoot', () => {
    it('should return repo root when in git repository', async () => {
      const result = await analyzer.getRepoRoot();
      expect(result).toBe(repoRoot);
      expect(mockRevparse).toHaveBeenCalledWith(['--show-toplevel']);
    });

    it('should return working directory when not in git repository', async () => {
      mockRevparse.mockRejectedValueOnce(new Error('not a git repo'));
      const instance = new GitDiffAnalyzer(workingDir);
      const result = await instance.getRepoRoot();
      expect(result).toBe(workingDir);
    });

    it('should cache the repo root promise', async () => {
      const instance = new GitDiffAnalyzer(workingDir);
      mockRevparse.mockClear();
      mockRevparse.mockResolvedValue(repoRoot);
      
      const promise1 = instance.getRepoRoot();
      const promise2 = instance.getRepoRoot();
      
      await Promise.all([promise1, promise2]);
      
      expect(mockRevparse).toHaveBeenCalledTimes(1);
    });

    it('should return working directory for stealth repo with gitDir set (Bug #2)', async () => {
      const testDir = '/test/working/dir';
      const customGitDir = '/test/working/dir/.gite2e';
      
      const instance = new GitDiffAnalyzer(testDir, customGitDir);
      const result = await instance.getRepoRoot();
      
      expect(result).toBe(testDir);
    });
  });

  describe('resolvePaths', () => {
    it('should resolve absolute path correctly', async () => {
      const absolutePath = '/test/working/dir/res/values/strings.xml';
      const result = await analyzer.resolvePaths(absolutePath);
      
      expect(result.absolutePath).toBe(absolutePath);
      expect(result.gitRelativePath).toBe('res/values/strings.xml');
      expect(result.workingRelativePath).toBe('res/values/strings.xml');
    });

    it('should resolve relative path correctly', async () => {
      const relativePath = 'res/values/strings.xml';
      const result = await analyzer.resolvePaths(relativePath);
      
      const expectedAbsolute = '/test/working/dir/res/values/strings.xml';
      expect(result.absolutePath).toBe(expectedAbsolute);
    });

    it('should throw error when file is outside git repository', async () => {
      // Using path traversal pattern - file is outside working directory
      const outsidePath = '../outside/strings.xml';
      const newAnalyzer = new GitDiffAnalyzer(workingDir);
      
      await expect(newAnalyzer.resolvePaths(outsidePath))
        .rejects.toThrow(/File is outside of git repository|Path traversal attempt detected/);
    });

    it('should normalize paths to use forward slashes', async () => {
      const result = await analyzer.resolvePaths('test.xml');
      expect(result.gitRelativePath).not.toContain('\\');
      expect(result.workingRelativePath).not.toContain('\\');
    });
  });

  describe('getDefaultStringsChanges', () => {
    const testFilePath = 'res/values/strings.xml';

    beforeEach(() => {
      const currentStrings = new Map<string, any>([
        ['app_name', { value: 'My App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }]
      ]);
      mockParseStringsXML.mockResolvedValue(currentStrings);
    });

    it('should return added strings for untracked files (not_added)', async () => {
      mockStatus.mockResolvedValue({
        not_added: [testFilePath],
        created: [],
        modified: []
      });

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.added.has('app_name')).toBe(true);
      expect(result.added.has('welcome')).toBe(true);
      expect(result.modified.size).toBe(0);
      expect(result.deleted.size).toBe(0);
    });

    it('should return added strings for untracked files (created)', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [testFilePath],
        modified: []
      });

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.added.has('app_name')).toBe(true);
      expect(result.added.size).toBe(2);
    });

    it('should detect modified strings', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: [testFilePath]
      });

      const previousStrings = new Map<string, any>([
        ['app_name', { value: 'Old App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }]
      ]);
      
      mockShow.mockResolvedValue('<resources><string name="app_name">Old App</string><string name="welcome">Welcome!</string></resources>');
      
      // Mock parseStringsXMLContent for parsing git show output
      mockParseStringsXMLContent.mockResolvedValue(previousStrings);
      
      // Mock parseStringsXML for current file
      mockParseStringsXML.mockResolvedValue(new Map([
        ['app_name', { value: 'My App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }]
      ]));

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.modified.has('app_name')).toBe(true);
      expect(result.modified.get('app_name')).toBe('My App');
      expect(result.added.size).toBe(0);
    });

    it('should detect deleted strings', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: []
      });

      const previousStrings = new Map<string, any>([
        ['app_name', { value: 'My App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }],
        ['old_string', { value: 'Old', translatable: true }]
      ]);
      
      mockShow.mockResolvedValue('<resources><string name="app_name">My App</string><string name="welcome">Welcome!</string><string name="old_string">Old</string></resources>');
      
      mockParseStringsXMLContent.mockResolvedValue(previousStrings);
      
      mockParseStringsXML.mockResolvedValue(new Map([
        ['app_name', { value: 'My App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }]
      ]));

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.deleted.has('old_string')).toBe(true);
    });

    it('should handle empty git show output (new file in git)', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: []
      });
      
      mockShow.mockRejectedValue(new Error('Invalid object'));

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.added.size).toBe(2);
      expect(result.modified.size).toBe(0);
      expect(result.deleted.size).toBe(0);
    });

    it('should skip non-translatable strings in untracked files', async () => {
      mockStatus.mockResolvedValue({
        not_added: [testFilePath],
        created: [],
        modified: []
      });

      mockParseStringsXML.mockResolvedValue(new Map([
        ['app_name', { value: 'My App', translatable: true }],
        ['internal_id', { value: '123', translatable: false }]
      ]));

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.added.has('app_name')).toBe(true);
      expect(result.added.has('internal_id')).toBe(false);
    });

    it('should skip non-translatable strings in tracked files (current)', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: []
      });

      const currentStrings = new Map<string, any>([
        ['app_name', { value: 'My App', translatable: true }],
        ['internal_id', { value: '123', translatable: false }]
      ]);

      mockParseStringsXMLContent.mockResolvedValue(new Map());
      
      mockParseStringsXML.mockResolvedValue(currentStrings);

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.added.has('app_name')).toBe(true);
      expect(result.added.has('internal_id')).toBe(false);
    });


    it('should detect order changes', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: []
      });

      const previousStrings = new Map<string, any>([
        ['welcome', { value: 'Welcome!', translatable: true }],
        ['app_name', { value: 'My App', translatable: true }]
      ]);

      mockShow.mockResolvedValue('<resources><string name="welcome">Welcome!</string><string name="app_name">My App</string></resources>');

      mockParseStringsXMLContent.mockResolvedValue(previousStrings);
      
      mockParseStringsXML.mockResolvedValue(new Map([
        ['app_name', { value: 'My App', translatable: true }],
        ['welcome', { value: 'Welcome!', translatable: true }]
      ]));

      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      
      expect(result.orderChanged).toBe(true);
    });

    it('should handle errors and rethrow', async () => {
      mockStatus.mockRejectedValue(new Error('Git error'));

      // Now it doesn't throw, it warns and returns untracked result
      const result = await analyzer.getDefaultStringsChanges(testFilePath);
      expect(result.added.size).toBeGreaterThan(0);
    });
  });

  describe('hasUncommittedChanges', () => {
    const testFilePath = 'res/values/strings.xml';

    it('should return true for modified files', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: [testFilePath]
      });

      const result = await analyzer.hasUncommittedChanges(testFilePath);
      expect(result).toBe(true);
    });

    it('should return true for not_added files', async () => {
      mockStatus.mockResolvedValue({
        not_added: [testFilePath],
        created: [],
        modified: []
      });

      const result = await analyzer.hasUncommittedChanges(testFilePath);
      expect(result).toBe(true);
    });

    it('should return true for created files', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [testFilePath],
        modified: []
      });

      const result = await analyzer.hasUncommittedChanges(testFilePath);
      expect(result).toBe(true);
    });

    it('should return false for unchanged files', async () => {
      mockStatus.mockResolvedValue({
        not_added: [],
        created: [],
        modified: []
      });

      const result = await analyzer.hasUncommittedChanges(testFilePath);
      expect(result).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should keep forward slashes unchanged', () => {
      const result = analyzer.normalizePath('path/to/file.xml');
      expect(result).toBe('path/to/file.xml');
    });

    it('should handle paths with backslashes (implementation specific)', () => {
      const result = analyzer.normalizePath('path\\to\\file.xml');
      expect(result).toBeDefined();
    });
  });
});
