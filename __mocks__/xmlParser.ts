/// <reference types="jest" />
// ESM mock for xmlParser
const mockParseStringsXML = jest.fn();
const mockParseStringsXMLContent = jest.fn();
const mockWriteStringsXML = jest.fn();
const mockMergeTranslationsWithOrder = jest.fn();

export const AndroidXMLParser = jest.fn(() => ({
  parseStringsXML: mockParseStringsXML,
  parseStringsXMLContent: mockParseStringsXMLContent,
  writeStringsXML: mockWriteStringsXML,
  mergeTranslationsWithOrder: mockMergeTranslationsWithOrder,
}));

export { 
  mockParseStringsXML, 
  mockParseStringsXMLContent,
  mockWriteStringsXML, 
  mockMergeTranslationsWithOrder 
};
