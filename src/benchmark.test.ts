/**
 * Benchmark Tests for android-i18n-mcp
 * Measures performance and resource usage of critical operations
 */

import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'os';
import { AndroidXMLParser } from './xmlParser.js';
import { GitDiffAnalyzer } from './gitDiff.js';

describe('Performance Benchmarks', () => {
  const parser = new AndroidXMLParser();
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('XMLParser', () => {
    it('should parse 1000 strings efficiently', async () => {
      // Generate large XML with 1000 strings
      let xml = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n';
      for (let i = 0; i < 1000; i++) {
        xml += `    <string name="key_${i}">Value ${i} with some text content</string>\n`;
      }
      xml += '</resources>';

      const filePath = path.join(tempDir, 'large.xml');
      await fs.writeFile(filePath, xml);

      const start = process.hrtime.bigint();
      const result = await parser.parseStringsXML(filePath);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;

      console.log(`Parsed 1000 strings in ${durationMs.toFixed(2)}ms`);
      
      expect(result.size).toBe(1000);
      expect(durationMs).toBeLessThan(200); // Should parse in under 200ms (CI environment)
    });

    it('should write 500 strings efficiently', async () => {
      const strings = new Map();
      for (let i = 0; i < 500; i++) {
        strings.set(`key_${i}`, {
          name: `key_${i}`,
          value: `Translated value ${i} with some text`,
          translatable: true
        });
      }

      const filePath = path.join(tempDir, 'write-test.xml');

      const start = process.hrtime.bigint();
      await parser.writeStringsXML(filePath, strings);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;

      console.log(`Wrote 500 strings in ${durationMs.toFixed(2)}ms`);
      
      expect(durationMs).toBeLessThan(200); // Should write in under 200ms
    });

    it('should handle deeply nested XML', async () => {
      // Create XML that might stress the parser
      let xml = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n';
      for (let i = 0; i < 100; i++) {
        xml += `    <string name="nested_${i}" translatable="false">Escaped quotes and more less-than content here</string>\n`;
      }
      xml += '</resources>';

      const filePath = path.join(tempDir, 'nested.xml');
      await fs.writeFile(filePath, xml);

      const start = process.hrtime.bigint();
      const result = await parser.parseStringsXML(filePath);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;

      console.log(`Parsed 100 strings with escaping in ${durationMs.toFixed(2)}ms`);
      
      expect(result.size).toBe(100);
      expect(durationMs).toBeLessThan(50);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory on repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform 100 parse/write cycles
      for (let i = 0; i < 100; i++) {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="test">Test value ${i}</string>
</resources>`;
        const filePath = path.join(tempDir, `mem-test-${i}.xml`);
        await fs.writeFile(filePath, xml);
        await parser.parseStringsXML(filePath);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory increase after 100 cycles: ${memoryIncrease.toFixed(2)}MB`);
      
      // Memory should not increase by more than 50MB for this test
      expect(memoryIncrease).toBeLessThan(50);
    });

    it('should handle large file (10KB) without issues', async () => {
      // Generate 10KB XML file
      let xml = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n';
      const largeText = 'A'.repeat(500); // 500 char string
      for (let i = 0; i < 50; i++) {
        xml += `    <string name="large_${i}">${largeText}</string>\n`;
      }
      xml += '</resources>';

      const filePath = path.join(tempDir, 'large-10kb.xml');
      await fs.writeFile(filePath, xml);

      const stats = await fs.stat(filePath);
      console.log(`File size: ${(stats.size / 1024).toFixed(2)}KB`);

      const start = process.hrtime.bigint();
      const result = await parser.parseStringsXML(filePath);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;

      console.log(`Parsed 10KB file in ${durationMs.toFixed(2)}ms`);
      
      expect(result.size).toBe(50);
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('Concurrency', () => {
    it('should handle parallel file operations', async () => {
      const files: string[] = [];

      // Create 20 files
      for (let i = 0; i < 20; i++) {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="concurrent_${i}">Value ${i}</string>
</resources>`;
        const filePath = path.join(tempDir, `concurrent-${i}.xml`);
        await fs.writeFile(filePath, xml);
        files.push(filePath);
      }

      const start = process.hrtime.bigint();

      // Parse all files in parallel
      const results = await Promise.all(
        files.map(f => parser.parseStringsXML(f))
      );

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      console.log(`Parsed 20 files in parallel in ${durationMs.toFixed(2)}ms`);
      
      expect(results.length).toBe(20);
      expect(durationMs).toBeLessThan(500); // Should handle parallel ops well
    });
  });
});

describe('Stress Tests', () => {
  it('should handle rapid sequential operations', async () => {
    const parser = new AndroidXMLParser();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stress-'));
    
    try {
      const start = process.hrtime.bigint();
      let totalStrings = 0;

      // Perform 50 operations
      for (let i = 0; i < 50; i++) {
        const strings = new Map();
        for (let j = 0; j < 20; j++) {
          strings.set(`key_${j}`, {
            name: `key_${j}`,
            value: `Value ${i}-${j}`,
            translatable: true
          });
        }

        const filePath = path.join(tempDir, `stress-${i}.xml`);
        await parser.writeStringsXML(filePath, strings);
        const result = await parser.parseStringsXML(filePath);
        totalStrings += result.size;
      }

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      const opsPerSecond = (50 / durationMs) * 1000;

      console.log(`50 write+read cycles: ${durationMs.toFixed(2)}ms (${opsPerSecond.toFixed(1)} ops/sec)`);
      console.log(`Total strings processed: ${totalStrings}`);
      
      expect(totalStrings).toBe(1000);
      expect(durationMs).toBeLessThan(5000); // Should complete in 5 seconds
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
