// Setup file for Jest tests
// Enables mock translator to avoid real API calls

process.env.TRANSLATION_MOCK = 'true';

console.error('[Setup] TRANSLATION_MOCK enabled');
