// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

const mockParse = jest.fn();
const mockBuild = jest.fn();
const mockParserInstance = { parse: mockParse };
const mockBuilderInstance = { build: mockBuild };
const mockValidate = jest.fn(() => true);

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();

(jest as any).unstable_mockModule('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir
}));

(jest as any).unstable_mockModule('fast-xml-parser', () => ({
  XMLParser: jest.fn(() => mockParserInstance),
  XMLBuilder: jest.fn(() => mockBuilderInstance),
  XMLValidator: { validate: mockValidate }
}));

let AndroidXMLParser;

beforeAll(async () => {
  const module = await import('./xmlParser.js');
  AndroidXMLParser = module.AndroidXMLParser;
});

describe('AndroidXMLParser', () => {
  let parser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParse.mockReset();
    mockBuild.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockValidate.mockReset();
    mockValidate.mockReturnValue(true);
    parser = new AndroidXMLParser();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('escapeAndroidString', () => {
    const escape = (str) => parser.escapeAndroidString(str);

    it('should escape single quotes', () => {
      expect(escape(`It's a test`)).toBe(`It\\'s a test`);
    });

    it('should escape @ at the beginning', () => {
      expect(escape('@string/app_name')).toBe('\\@string/app_name');
    });

    it('should escape regular double quotes', () => {
      expect(escape(`He said "hello"`)).toBe('He said \\"hello\\"');
    });

    it('should handle apos entity', () => {
      expect(escape(`It's a test`)).toBe(`It\\'s a test`);
    });

    it('should NOT escape plain text', () => {
      expect(escape('plain text')).toBe('plain text');
    });

    it('should escape " entities', () => {
      expect(escape('He said "hello"')).toBe('He said \\"hello\\"');
    });

    it('should escape regular < and > characters', () => {
      expect(escape('a < b > c')).toBe('a \\< b \\> c');
    });

    it('should escape < and > entities', () => {
      expect(escape('a < b > c')).toBe('a \\< b \\> c');
    });

    it('should escape regular & character', () => {
      expect(escape('a & b')).toBe('a \\& b');
    });

    it('should escape & entities', () => {
      expect(escape('a & b')).toBe('a \\& b');
    });
  });

  describe('parseStringsXML', () => {
    it('should parse XML file and return Map', async () => {
      const mockXml = {
        resources: {
          string: [
            { '@_name': 'app_name', '#text': 'My App' },
            { '@_name': 'hello', '#text': 'Hello' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('<xml />');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('strings.xml');

      expect(result.size).toBe(2);
      expect(result.get('app_name')).toEqual({ name: 'app_name', value: 'My App', translatable: true });
    });

    it('should handle single string object', async () => {
      const mockXml = {
        resources: {
          string: { '@_name': 'app_name', '#text': 'My App' }
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('strings.xml');
      expect(result.size).toBe(1);
    });

    it('should respect translatable false', async () => {
      const mockXml = {
        resources: {
          string: [
            { '@_name': 'app_name', '#text': 'My App', '@_translatable': 'false' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('strings.xml');
      expect(result.get('app_name')?.translatable).toBe(false);
    });

    it('should return empty Map on ENOENT', async () => {
      mockReadFile.mockRejectedValue({ code: 'ENOENT' });
      const result = await parser.parseStringsXML('nonexistent.xml');
      expect(result.size).toBe(0);
    });

    it('should throw on other errors', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));
      await expect(parser.parseStringsXML('strings.xml')).rejects.toThrow('Permission denied');
    });

    it('should return empty Map when no resources in XML', async () => {
      mockReadFile.mockResolvedValue('<xml />');
      mockParse.mockReturnValue({});
      mockValidate.mockReturnValue(true);
      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(0);
    });

    it('should return empty Map when no strings in resources', async () => {
      mockReadFile.mockResolvedValue('<xml />');
      mockParse.mockReturnValue({ resources: {} });
      mockValidate.mockReturnValue(true);
      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(0);
    });

    it('should skip strings without name attribute', async () => {
      const mockXml = {
        resources: {
          string: [
            { '#text': 'No Name' },
            { '@_name': 'valid', '#text': 'Valid' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(1);
      expect(result.has('valid')).toBe(true);
    });

    it('should skip strings with empty name (line 101)', async () => {
      const mockXml = {
        resources: {
          string: [
            { '@_name': '', '#text': 'Empty' },
            { '@_name': 'valid', '#text': 'Valid' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(1);
      expect(result.has('valid')).toBe(true);
    });

    it('should throw on invalid XML validation', async () => {
      mockReadFile.mockResolvedValue('<xml>bad');
      mockValidate.mockReturnValue({ err: { msg: 'Invalid XML' } });
      await expect(parser.parseStringsXML('bad.xml')).rejects.toThrow('Invalid XML in');
    });
  });

  describe('parseStringsXML - error cases and edge cases', () => {
    it('should handle invalid XML (parser throws)', async () => {
      mockReadFile.mockResolvedValue('<xml>unclosed tag');
      mockValidate.mockReturnValue(true);
      mockParse.mockImplementation(() => {
        throw new Error('Invalid XML');
      });

      await expect(parser.parseStringsXML('bad.xml')).rejects.toThrow('Invalid XML');
    });

    it('should handle empty string content', async () => {
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue({});
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('empty.xml');
      expect(result.size).toBe(0);
    });

    it('should handle XML with only whitespace', async () => {
      mockReadFile.mockResolvedValue('   \n\t   ');
      mockParse.mockReturnValue({});
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('whitespace.xml');
      expect(result.size).toBe(0);
    });

    it('should skip strings with empty text value', async () => {
      const mockXml = {
        resources: {
          string: [
            { '@_name': 'empty_text', '#text': '' },
            { '@_name': 'valid', '#text': 'Valid' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(2);
      expect(result.get('empty_text')?.value).toBe('');
    });

    it('should handle string without #text property', async () => {
      const mockXml = {
        resources: {
          string: [
            { '@_name': 'no_text' },
            { '@_name': 'valid', '#text': 'Valid' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(2);
      expect(result.get('no_text')?.value).toBe('');
    });

    it('should handle XML with no string elements', async () => {
      const mockXml = {
        resources: {}
      };
      mockReadFile.mockResolvedValue('<resources></resources>');
      mockParse.mockReturnValue(mockXml);
      mockValidate.mockReturnValue(true);

      const result = await parser.parseStringsXML('test.xml');
      expect(result.size).toBe(0);
    });

    it('should handle XML with malformed characters', async () => {
      mockReadFile.mockResolvedValue('<xml>invalid \x00 character</xml>');
      mockValidate.mockReturnValue(true);
      mockParse.mockImplementation(() => {
        throw new Error('Invalid character');
      });

      await expect(parser.parseStringsXML('bad.xml')).rejects.toThrow('Invalid character');
    });
  });

  describe('writeStringsXML', () => {
    it('should write XML file', async () => {
      const strings = new Map();
      strings.set('app_name', { name: 'app_name', value: 'My App', translatable: true });

      mockBuild.mockReturnValue('<xml>content</xml>');

      await parser.writeStringsXML('strings.xml', strings);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should add translatable false', async () => {
      const strings = new Map();
      strings.set('app_name', { name: 'app_name', value: 'My App', translatable: false });

      mockBuild.mockReturnValue('<xml>content</xml>');

      await parser.writeStringsXML('strings.xml', strings);
      const buildArg = mockBuild.mock.calls[0][0];
      expect(buildArg.resources.string[0]['@_translatable']).toBe('false');
    });

    it('should handle empty strings map (line 138)', async () => {
      const strings = new Map();
      mockBuild.mockReturnValue('<resources></resources>');

      await parser.writeStringsXML('strings.xml', strings);
      const buildArg = mockBuild.mock.calls[0][0];
      expect(buildArg.resources.string).toBeUndefined();
    });

    it('should create directory if not exists', async () => {
      const strings = new Map();
      strings.set('app_name', { name: 'app_name', value: 'My App' });

      mockBuild.mockReturnValue('<xml>content</xml>');

      await parser.writeStringsXML('/new/path/strings.xml', strings);
      expect(mockMkdir).toHaveBeenCalledWith('/new/path', { recursive: true });
    });
  });

  describe('mergeTranslations', () => {
    it('should update existing and add new', async () => {
      const existingXml = {
        resources: {
          string: [{ '@_name': 'a', '#text': 'A_old' }]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      newTranslations.set('a', 'A_new');
      newTranslations.set('b', 'B_new');

      await parser.mergeTranslations('path', newTranslations);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toContain('a');
      expect(names).toContain('b');
    });

    it('should add new key when not existing (line 159)', async () => {
      const existingXml = {
        resources: {
          string: [{ '@_name': 'a', '#text': 'A_old' }]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      newTranslations.set('b', 'B_new');

      await parser.mergeTranslations('path', newTranslations);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toContain('b');
      const bString = buildArg.resources.string.find((s) => s['@_name'] === 'b');
      expect(bString['#text']).toBe('B_new');
      expect(bString['@_translatable']).toBeUndefined();
    });

    it('should not update translatable false strings', async () => {
      const existingXml = {
        resources: {
          string: [{ '@_name': 'a', '#text': 'A_old', '@_translatable': 'false' }]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      newTranslations.set('a', 'A_new');

      await parser.mergeTranslations('path', newTranslations);

      const buildArg = mockBuild.mock.calls[0][0];
      expect(buildArg.resources.string[0]['#text']).toBe('A_old');
    });
  });

  describe('mergeTranslationsWithOrder', () => {
    it('should order strings by keyOrder', async () => {
      const existingXml = {
        resources: {
          string: [
            { '@_name': 'b', '#text': 'B' },
            { '@_name': 'a', '#text': 'A' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      newTranslations.set('a', 'A_new');
      const keyOrder = ['a', 'b'];

      await parser.mergeTranslationsWithOrder('path', newTranslations, keyOrder);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toEqual(['a', 'b']);
    });

    it('should add new keys not in existing strings', async () => {
      const existingXml = {
        resources: {
          string: [{ '@_name': 'a', '#text': 'A' }]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      newTranslations.set('b', 'New B');
      const keyOrder = ['a'];

      await parser.mergeTranslationsWithOrder('path', newTranslations, keyOrder);
      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toEqual(['a', 'b']);
      expect(buildArg.resources.string[1]['#text']).toBe('New B');
    });

    it('should add keys not in keyOrder at the end (lines 203-206)', async () => {
      const existingXml = {
        resources: {
          string: [
            { '@_name': 'a', '#text': 'A' },
            { '@_name': 'c', '#text': 'C' }
          ]
        }
      };
      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const newTranslations = new Map();
      const keyOrder = ['a'];

      await parser.mergeTranslationsWithOrder('path', newTranslations, keyOrder);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toEqual(['a', 'c']);
    });
  });

  describe('syncWithDefaultOrder', () => {
    it('should sync with default order', async () => {
      const defaultStrings = new Map();
      defaultStrings.set('a', { name: 'a', value: 'A' });
      defaultStrings.set('b', { name: 'b', value: 'B' });

      const existingXml = {
        resources: {
          string: [
            { '@_name': 'b', '#text': 'B_old' },
            { '@_name': 'a', '#text': 'A_old' },
            { '@_name': 'c', '#text': 'C' }
          ]
        }
      };

      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const deletedKeys = new Set();

      await parser.syncWithDefaultOrder('path', defaultStrings, deletedKeys);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toEqual(['a', 'b']);
    });

    it('should exclude deleted keys (line 222)', async () => {
      const defaultStrings = new Map();
      defaultStrings.set('a', { name: 'a', value: 'A' });
      defaultStrings.set('b', { name: 'b', value: 'B' });

      const existingXml = {
        resources: {
          string: [
            { '@_name': 'a', '#text': 'A_old' },
            { '@_name': 'b', '#text': 'B_old' },
            { '@_name': 'c', '#text': 'C' }
          ]
        }
      };

      mockReadFile.mockResolvedValue('');
      mockParse.mockReturnValue(existingXml);
      mockBuild.mockReturnValue('xml');
      mockValidate.mockReturnValue(true);

      const deletedKeys = new Set(['b']);

      await parser.syncWithDefaultOrder('path', defaultStrings, deletedKeys);

      const buildArg = mockBuild.mock.calls[0][0];
      const names = buildArg.resources.string.map((s) => s['@_name']);
      expect(names).toEqual(['a']);
    });
  });
});
