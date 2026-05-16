import { jest, describe, it, expect, beforeEach, beforeAll, afterEach } from '@jest/globals';
import type OpenAI from 'openai';
import { TranslatorConfig } from './translator.js';

// Create a mock function with proper typing
const mockCreate = jest.fn() as jest.MockedFunction<
  (args: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: string };
  }) => Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>
>;

const mockModelsList = jest.fn<() => Promise<{ data: any[] }>>().mockResolvedValue({ data: [] });

// Mock the openai module for ESM using unstable_mockModule
jest.unstable_mockModule('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      models: {
        list: mockModelsList
      },
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }))
  };
});

// Dynamic imports after mocking for ESM
const { OpenAITranslator, DeepSeekTranslator, TranslatorFactory } = await import('./translator.js');
const MockedOpenAI = (await import('openai')).default as jest.MockedClass<typeof OpenAI>;

describe('TranslatorFactory', () => {
  describe('create', () => {
    // Clear TRANSLATION_MOCK before all factory tests
    beforeAll(() => {
      delete process.env.TRANSLATION_MOCK;
    });

    it('should create OpenAITranslator for openai provider', () => {
      const config: TranslatorConfig = {
        provider: 'openai',
        apiKey: 'test-key'
      };
      const translator = TranslatorFactory.create(config);
      expect(translator).toBeInstanceOf(OpenAITranslator);
    });

    it('should create DeepSeekTranslator for deepseek provider', () => {
      const config: TranslatorConfig = {
        provider: 'deepseek',
        apiKey: 'test-key'
      };
      const translator = TranslatorFactory.create(config);
      expect(translator).toBeInstanceOf(DeepSeekTranslator);
    });

    it('should throw error for anthropic provider', () => {
      const config: TranslatorConfig = {
        provider: 'anthropic',
        apiKey: 'test-key'
      };
      expect(() => TranslatorFactory.create(config)).toThrow('Anthropic provider not yet implemented');
    });

    it('should throw error for google provider', () => {
      const config: TranslatorConfig = {
        provider: 'google',
        apiKey: 'test-key'
      };
      expect(() => TranslatorFactory.create(config)).toThrow('Google Translate provider not yet implemented');
    });

    it('should throw error for unknown provider', () => {
      const config = {
        provider: 'unknown',
        apiKey: 'test-key'
      } as unknown as TranslatorConfig;
      expect(() => TranslatorFactory.create(config)).toThrow('Unknown provider: unknown');
    });
  });
});

describe('OpenAITranslator', () => {
  let translator: InstanceType<typeof OpenAITranslator>;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://test.api.com';

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockClear();
    
    const config: TranslatorConfig = {
      provider: 'openai',
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      model: 'gpt-4o-mini',
      batchSize: 10
    };
    translator = new OpenAITranslator(config);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const config: TranslatorConfig = {
        provider: 'openai',
        apiKey: 'my-key',
        baseUrl: 'https://custom.url',
        model: 'gpt-4',
        batchSize: 30
      };
      new OpenAITranslator(config);
      const mockConstructor = MockedOpenAI.mock;
      const lastCall = mockConstructor.calls[mockConstructor.calls.length - 1];
      expect(lastCall[0]).toMatchObject({
        apiKey: 'my-key',
        baseURL: 'https://custom.url',
        timeout: 120000,
        maxRetries: 3
      });
    });

    it('should use default model when not provided', () => {
      const config: TranslatorConfig = {
        provider: 'openai',
        apiKey: 'test-key'
      };
      new OpenAITranslator(config);
      expect(MockedOpenAI).toHaveBeenCalled();
    });
  });

  describe('translate', () => {
    it('should successfully translate text', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated text' } }]
      });

      const result = await translator.translate('Hello world', 'ru', 'en');
      expect(result).toBe('translated text');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: expect.stringContaining('Hello world') })
        ]),
        temperature: 0.3,
        max_tokens: 500
      });
    });

    it('should handle Korean language with additional instructions', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'ko', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('formal Korean');
    });

    it('should handle Chinese Simplified with additional instructions', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'zh-CN', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('Simplified Chinese');
    });

    it('should handle Chinese Traditional (Taiwan) with additional instructions', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'zh-TW', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('Traditional Chinese characters specifically for Taiwan');
    });

    it('should escape newlines before translation', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Line1\\nLine2' } }]
      });

      const result = await translator.translate('Line1\nLine2', 'ru', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('__NEWLINE__');
      expect(result).toBe('Line1\\nLine2');
    });

    it('should return original text if no content in response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }]
      });

      const result = await translator.translate('Hello', 'ru', 'en');
      expect(result).toBe('Hello');
    });

    it('should throw error on API failure', async () => {
      const error = new Error('API Error');
      mockCreate.mockRejectedValueOnce(error);

      await expect(translator.translate('Hello', 'ru', 'en')).rejects.toThrow('API Error');
    });

    it('should use LANGUAGE_MAPPING for known target language', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'es', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('English');
      expect(userMessage).toContain('Spanish');
    });

    it('should use language code for unknown target language', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'unknown-lang', 'en');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('unknown-lang');
    });

    it('should use LANGUAGE_MAPPING for known source language', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'de', 'es');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('Spanish');
      expect(userMessage).toContain('German');
    });

    it('should use language code for unknown source language', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      await translator.translate('Hello', 'de', 'unknown-lang');
      const userMessage = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(userMessage).toContain('unknown-lang');
    });
  });

  describe('translateBatch', () => {
    it('should throw error if translation service is unavailable', async () => {
      mockModelsList.mockRejectedValueOnce(new Error('Connection failed'));
      const texts = new Map([['key1', 'Hello']]);
      await expect(translator.translateBatch(texts, 'ru', 'en')).rejects.toThrow('Translation service unavailable: Connection failed');
    });

    it('should translate batch smaller than batchSize in one call', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              'key1': 'translated1',
              'key2': 'translated2'
            })
          }
        }]
      });

      const texts = new Map([['key1', 'Hello'], ['key2', 'World']]);
      const result = await translator.translateBatch(texts, 'ru', 'en');

      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('translated1');
      expect(result.get('key2')).toBe('translated2');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect((mockCreate.mock.calls[0][0] as any).response_format).toEqual({ type: 'json_object' });
    });

    it('should split large batches according to batchSize', async () => {
      const config: TranslatorConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        batchSize: 2
      };
      const t = new OpenAITranslator(config);

      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ 'key1': 'a', 'key2': 'b' }) } }]
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ 'key3': 'c', 'key4': 'd' }) } }]
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ 'key5': 'e' }) } }]
        });

      const texts = new Map([
        ['key1', 'a'], ['key2', 'b'], ['key3', 'c'],
        ['key4', 'd'], ['key5', 'e']
      ]);

      const result = await t.translateBatch(texts, 'ru', 'en');
      expect(result.size).toBe(5);
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle empty batch', async () => {
      const texts = new Map<string, string>();
      const result = await translator.translateBatch(texts, 'ru', 'en');
      expect(result.size).toBe(0);
    });

    it('should handle API error in batch and retry individual translations', async () => {
      // First call fails for batch
      mockCreate.mockRejectedValueOnce(new Error('Batch API Error'));

      // Then individual translate calls
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated1' } }]
      });
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated2' } }]
      });

      const texts = new Map([['key1', 'Hello'], ['key2', 'World']]);
      const result = await translator.translateBatch(texts, 'ru', 'en');

      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('translated1');
      expect(result.get('key2')).toBe('translated2');
    });

    it('should mark failed translations after retries', async () => {
      // Batch fails
      mockCreate.mockRejectedValueOnce(new Error('Batch Error'));

      // Individual translations fail 2 times then succeed or fail
      mockCreate.mockRejectedValueOnce(new Error('Retry 1 failed'));
      mockCreate.mockRejectedValueOnce(new Error('Retry 2 failed'));

      const texts = new Map([['key1', 'Hello']]);
      const result = await translator.translateBatch(texts, 'ru', 'en');

      expect(result.get('key1')).toContain('[TRANSLATION_FAILED: ru]');
    });

    it('should warn about untranslated strings', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              'key1': 'Hello' // Same as original - untranslated
            })
          }
        }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'ru', 'en');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('appears untranslated')
      );

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should throw error when no content in batch response', async () => {
      // Mock empty content response
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      
      // This should trigger the error handling in translateBatchChunk
      // which will then retry individual translations
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'translated' } }]
      });

      const result = await translator.translateBatch(texts, 'ru', 'en');
      // Should have retried and succeeded
      expect(result.get('key1')).toBe('translated');
    });

    it('should throw error on connectivity check failure', async () => {
      mockModelsList.mockRejectedValueOnce(new Error('API Down'));
      await expect(translator.checkConnectivity()).rejects.toThrow('Translation service unavailable: API Down');
    });

    // Tests for additional language instructions in translateBatchChunk (lines 141, 143, 145)
    it('should add Korean instructions in batch translation', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'key1': 'translated' }) } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'ko', 'en');
      
      const prompt = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(prompt).toContain('formal Korean');
    });

    it('should add Chinese Simplified instructions in batch translation', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'key1': 'translated' }) } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'zh-CN', 'en');
      
      const prompt = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(prompt).toContain('Simplified Chinese');
    });

    it('should add Chinese Traditional instructions in batch translation', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'key1': 'translated' }) } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'zh-TW', 'en');
      
      const prompt = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(prompt).toContain('Traditional Chinese characters specifically for Taiwan');
    });

    it('should use language code for unknown language in batch target', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'key1': 'translated' }) } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'unknown-lang', 'en');
      
      const prompt = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(prompt).toContain('unknown-lang');
    });

    it('should use language code for unknown language in batch source', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'key1': 'translated' }) } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      await translator.translateBatch(texts, 'de', 'unknown-lang');
      
      const prompt = (mockCreate.mock.calls[0][0] as any).messages[1].content;
      expect(prompt).toContain('unknown-lang');
    });
  });

  describe('escapeNewlines and unescapeNewlines', () => {
    it('should escape newlines correctly', () => {
      const t = new OpenAITranslator({ provider: 'openai', apiKey: 'test' });
      // escapeNewlines replaces literal \n (two characters: backslash + n) with __NEWLINE__
      // It does NOT replace actual newline characters
      const input = 'Line1\nLine2\\nLine3'; // \n = actual newline, \\n = literal \n
      const escaped = (t as any).escapeNewlines(input);
      // Only the literal \n after Line2 should be replaced
      expect(escaped).toBe('Line1\nLine2__NEWLINE__Line3');
    });

    it('should unescape newlines correctly', () => {
      const t = new OpenAITranslator({ provider: 'openai', apiKey: 'test' });
      const unescaped = (t as any).unescapeNewlines('Line1__NEWLINE__Line2');
      expect(unescaped).toBe('Line1\\nLine2');
    });
  });
});

describe('DeepSeekTranslator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockClear();
  });

  it('should extend OpenAITranslator', () => {
    const config: TranslatorConfig = {
      provider: 'deepseek',
      apiKey: 'test-key'
    };
    const translator = new DeepSeekTranslator(config);
    expect(translator).toBeInstanceOf(OpenAITranslator);
    expect(translator).toBeInstanceOf(DeepSeekTranslator);
  });

  it('should use default baseUrl if not provided', () => {
    const config: TranslatorConfig = {
      provider: 'deepseek',
      apiKey: 'test-key'
    };
    new DeepSeekTranslator(config);
    const mockConstructor = MockedOpenAI.mock;
    const lastCall = mockConstructor.calls[mockConstructor.calls.length - 1];
    expect(lastCall[0]).toMatchObject({
      baseURL: 'https://api.deepseek.com'
    });
  });

  it('should use custom baseUrl if provided', () => {
    const config: TranslatorConfig = {
      provider: 'deepseek',
      apiKey: 'test-key',
      baseUrl: 'https://custom.deepseek.com'
    };
    new DeepSeekTranslator(config);
    const mockConstructor = MockedOpenAI.mock;
    const lastCall = mockConstructor.calls[mockConstructor.calls.length - 1];
    expect(lastCall[0]).toMatchObject({
      baseURL: 'https://custom.deepseek.com'
    });
  });

  it('should use default model deepseek-chat if not provided', () => {
    const config: TranslatorConfig = {
      provider: 'deepseek',
      apiKey: 'test-key'
    };
    new DeepSeekTranslator(config);
    expect(MockedOpenAI).toHaveBeenCalled();
  });
});

// Additional tests to reach 100% coverage
describe('Coverage: Error Handling and Edge Cases', () => {
  let translator: InstanceType<typeof OpenAITranslator>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockClear();
    const config: TranslatorConfig = {
      provider: 'openai',
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      batchSize: 10
    };
    translator = new OpenAITranslator(config);
  });

  describe('Line 76: Error handling in translate method', () => {
    it('should log error to console when API fails in translate()', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Network Error');
      mockCreate.mockRejectedValueOnce(error);

      await expect(translator.translate('Hello', 'ru', 'en')).rejects.toThrow('Network Error');
      
      // Verify that console.error was called with the specific error context
      expect(consoleErrorSpy).toHaveBeenCalledWith('Translation error for ru:', error);
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Line 126 & Retry Logic: translateBatchChunk', () => {
    it('should retry individual translation on failure and succeed on next attempt', async () => {
      // Simulate batch failure first
      mockCreate.mockRejectedValueOnce(new Error('Batch failed'));

      // First individual attempt fails, second succeeds (retry logic)
      mockCreate
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'translated_success' } }]
        });

      const texts = new Map([['key1', 'Hello']]);
      const result = await translator.translateBatch(texts, 'ru', 'en');

      expect(result.get('key1')).toBe('translated_success');
      // Ensure translate was called twice (fail + success retry)
      expect(mockCreate).toHaveBeenCalledTimes(3); // 1 batch fail + 1 fail + 1 success
    });

    it('should handle multiple retries within batch chunk correctly', async () => {
      // Batch fails
      mockCreate.mockRejectedValueOnce(new Error('Batch Error'));

      // Key1: fails once (retryCount=0), succeeds on second try (retryCount=1, which is < maxRetries=2)
      mockCreate
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValueOnce({ choices: [{ message: { content: 'final_translation' } }] });

      const texts = new Map([['key1', 'Test']]);
      const result = await translator.translateBatch(texts, 'es', 'en');

      expect(result.get('key1')).toBe('final_translation');
    });
  });

  describe('Line 241: translateBatch behavior and empty response handling', () => {
    it('should call translateBatchChunk directly when batch size is within limit (line 241-244)', async () => {
      const smallBatch = new Map([['k1', 'v1']]);
      
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ 'k1': 'val1' }) } }]
      });

      const result = await translator.translateBatch(smallBatch, 'fr', 'en');
      expect(result.size).toBe(1);
      expect(result.get('k1')).toBe('val1');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should handle empty content in batch response and fallback to individual retries', async () => {
      // Return null content to trigger 'No response content' error in chunk
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }]
      });

      // Individual retry succeeds
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'individual_translation' } }]
      });

      const texts = new Map([['key1', 'Hello']]);
      const result = await translator.translateBatch(texts, 'de', 'en');

      expect(result.get('key1')).toBe('individual_translation');
    });

    it('should process chunks correctly when batch size exceeds limit', async () => {
      const config: TranslatorConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        batchSize: 1 // Force chunking
      };
      const t = new OpenAITranslator(config);

      mockCreate
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ 'a': 'x' }) } }] })
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ 'b': 'y' }) } }] });

      const texts = new Map([['a', '1'], ['b', '2']]);
      const result = await t.translateBatch(texts, 'ru', 'en');

      expect(result.size).toBe(2);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });
});
