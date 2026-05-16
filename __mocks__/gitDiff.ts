/// <reference types="jest" />
// ESM mock for gitDiff
const mockGetDefaultStringsChanges = jest.fn();

export const GitDiffAnalyzer = jest.fn(() => ({
  getDefaultStringsChanges: mockGetDefaultStringsChanges,
}));

// Export mock functions for test access
export { mockGetDefaultStringsChanges };
