/// <reference types="jest" />
// Mock for translator.js (ESM)
const mockTranslateBatch = jest.fn();
const mockTranslate = jest.fn();

const mockTranslator = {
  translate: mockTranslate,
  translateBatch: mockTranslateBatch,
};

export const TranslatorFactory = {
  create: jest.fn(() => mockTranslator),
};

// Export mock functions for use in tests
export { mockTranslateBatch, mockTranslate };

// For type compatibility
export class OpenAITranslator {}
export class DeepSeekTranslator {}
