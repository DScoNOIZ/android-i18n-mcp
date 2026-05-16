/**
 * FileTestHelper - utility for working with real file system in integration tests
 * Provides methods for creating test Android projects and checking files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class FileTestHelper {
  /**
   * Creates a temporary Android project with test strings.xml
   * @returns Path to the created project directory
   */
  static async createTempAndroidProject(): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `android-i18n-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create structure: app/src/main/res/values/
    const valuesDir = path.join(tmpDir, 'app/src/main/res/values');
    await fs.mkdir(valuesDir, { recursive: true });

    // Create strings.xml with test strings
    const content = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Test App</string>
    <string name="hello">Hello World</string>
    <string name="welcome">Welcome to the app</string>
</resources>`;
    await fs.writeFile(path.join(valuesDir, 'strings.xml'), content);

    return tmpDir;
  }

  /**
   * Creates Android project with multiple modules for testing translateAllModules
   * @returns Path to the created project directory
   */
  static async createMultiModuleProject(): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `android-i18n-multimodule-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Module 1: app
    const appValuesDir = path.join(tmpDir, 'app/src/main/res/values');
    await fs.mkdir(appValuesDir, { recursive: true });
    const appContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">My Application</string>
    <string name="start">Start</string>
</resources>`;
    await fs.writeFile(path.join(appValuesDir, 'strings.xml'), appContent);

    // Module 2: library
    const libValuesDir = path.join(tmpDir, 'library/src/main/res/values');
    await fs.mkdir(libValuesDir, { recursive: true });
    const libContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="library_name">My Library</string>
    <string name="library_desc">Description</string>
</resources>`;
    await fs.writeFile(path.join(libValuesDir, 'strings.xml'), libContent);

    // Module 3: feature
    const featureValuesDir = path.join(tmpDir, 'feature/src/main/res/values');
    await fs.mkdir(featureValuesDir, { recursive: true });
    const featureContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="feature_title">Feature</string>
</resources>`;
    await fs.writeFile(path.join(featureValuesDir, 'strings.xml'), featureContent);

    return tmpDir;
  }

  /**
   * Cleans up temporary directory
   * @param tmpDir Path to temporary directory
   */
  static async cleanup(tmpDir: string): Promise<void> {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
      console.error(`Failed to cleanup ${tmpDir}:`, error);
    }
  }

  /**
   * Checks if file exists
   * @param filePath Path to file
   * @returns true if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads file content
   * @param filePath Path to file
   * @returns File content or empty string on error
   */
  static async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Creates language folder with strings.xml
   * @param projectRoot Project root directory
   * @param modulePath Path to module (e.g., 'app')
   * @param language Language code (e.g., 'ru')
   * @param strings Map of strings for translation
   */
  static async createLanguageFile(
    projectRoot: string,
    modulePath: string,
    language: string,
    strings: Record<string, string>
  ): Promise<string> {
    const langFolder = this.getLanguageFolder(language);
    const valuesDir = path.join(projectRoot, modulePath, 'src/main/res', langFolder);
    await fs.mkdir(valuesDir, { recursive: true });

    const stringsContent = Object.entries(strings)
      .map(([name, value]) => `    <string name="${name}">${value}</string>`)
      .join('\n');

    const content = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${stringsContent}
</resources>`;

    const filePath = path.join(valuesDir, 'strings.xml');
    await fs.writeFile(filePath, content);

    return filePath;
  }

  /**
   * Returns folder name for language
   * @param language Language code
   * @returns Folder name (e.g., 'values-ru')
   */
  static getLanguageFolder(language: string): string {
    const folderMap: Record<string, string> = {
      'zh-CN': 'values-zh-rCN',
      'zh-TW': 'values-zh-rTW',
      'zh-SG': 'values-zh-rSG',
      'zh-HK': 'values-zh-rHK',
      'zh-MO': 'values-zh-rMO',
    };

    if (folderMap[language]) {
      return folderMap[language];
    }

    // Simple mapping: ru -> values-ru, es -> values-es, etc.
    if (language.includes('-r')) {
      return `values-${language}`;
    }
    return `values-${language}`;
  }

  /**
   * Checks if file contains a specific string
   * @param filePath Path to file
   * @param searchString String to search for
   * @returns true if string found
   */
  static async fileContains(filePath: string, searchString: string): Promise<boolean> {
    const content = await this.readFile(filePath);
    return content.includes(searchString);
  }

  /**
   * Gets list of all language files in project
   * @param projectRoot Project root directory
   * @returns Array of paths to strings.xml files
   */
  static async getAllStringsFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.name === 'strings.xml') {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore access errors
      }
    }

    await walkDir(projectRoot);
    return files;
  }
}
