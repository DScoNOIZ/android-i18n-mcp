/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // Run tests serially to avoid race conditions with real file system operations
  maxWorkers: 1,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1' // Map .js imports to .ts files for Node16 moduleResolution
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.tests.json',
      diagnostics: false // Disable type checking for faster execution
    }]
  },
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  collectCoverageFrom: [
    'src/translationManager.ts',
    'src/translator.ts',
    'src/xmlParser.ts',
  ],
  coverageThreshold: {
    'src/translationManager.ts': {
      branches: 75,
      functions: 85,
      lines: 88,
      statements: 75,
    },
    'src/translator.ts': {
      branches: 90,
      functions: 80,
      lines: 95,
      statements: 95,
    },
    'src/xmlParser.ts': {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  verbose: true,
};
