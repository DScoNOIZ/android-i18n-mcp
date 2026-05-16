import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import simpleGitPkg from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { AndroidXMLParser, StringResource, StringsXML } from './xmlParser.js';
import { XMLValidator, XMLParser } from 'fast-xml-parser';

const simpleGit = (simpleGitPkg as any).default || simpleGitPkg;

/**
 * Safely resolves a path and verifies it stays within the base directory.
 * Prevents path traversal attacks including Windows device names (CVE-2025-27210)
 */
function safeResolve(basePath: string, userPath: string): string {
  // Block Windows device names (CVE-2025-27210)
  const windowsDeviceNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  if (windowsDeviceNames.test(userPath)) {
    throw new Error(`Invalid path: reserved device name detected in "${userPath}"`);
  }

  // Block null bytes
  if (userPath.includes('\0')) {
    throw new Error(`Invalid path: null byte detected`);
  }

  // Resolve the path
  const resolved = path.resolve(basePath, userPath);
  const baseResolved = path.resolve(basePath);

  // Ensure resolved path starts with base path (with separator)
  const separator = path.sep;
  const expectedPrefix = baseResolved + separator;
  
  if (!resolved.startsWith(expectedPrefix) && resolved !== baseResolved) {
    throw new Error(`Path traversal attempt detected: "${userPath}" resolves to "${resolved}" which is outside "${baseResolved}"`);
  }

  return resolved;
}

export interface DiffResult {
  added: Map<string, string>;
  modified: Map<string, string>;
  deleted: Set<string>;
  orderChanged: boolean;
  currentOrder: string[];
}

export interface ModuleChangeInfo {
  modulePath: string;
  isNew: boolean;
  changes: DiffResult;
}

export class GitDiffAnalyzer {
  private git: SimpleGit;
  private xmlParser: AndroidXMLParser;
  private workingDir: string;
  private repoRootPromise?: Promise<string>;
  private gitDir?: string;

  constructor(workingDir: string, gitDir?: string) {
    this.workingDir = path.resolve(workingDir);
    this.gitDir = gitDir;
    
    // Configure simple-git with GIT_DIR if provided or detected
    const gitOptions: any = {};
    
    // Check for explicit gitDir parameter or GIT_DIR environment variable
    const envGitDir = process.env.GIT_DIR;
    const resolvedGitDir = gitDir || envGitDir;
    
    if (resolvedGitDir) {
      // Use custom git directory (for stealth repos like .gite2e)
      // Set GIT_WORK_TREE explicitly to working directory
      const env = { ...process.env, GIT_DIR: resolvedGitDir, GIT_WORK_TREE: this.workingDir };
      this.git = simpleGit(this.workingDir, { ...gitOptions, env });
    } else {
      // Try to detect stealth repository (.gite2e) if no GIT_DIR is set
      this.git = simpleGit(this.workingDir);
    }
    
    this.xmlParser = new AndroidXMLParser();
    
    // Asynchronously detect stealth repository if not provided
    // Note: detection happens in getRepoRoot() for the first call to avoid race conditions
  }

  private async detectGitDir(): Promise<string | undefined> {
    // Check for stealth repository directories
    const stealthDirs = ['.gite2e', '.git'];
    for (const dir of stealthDirs) {
      const fullPath = path.join(this.workingDir, dir);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          return fullPath;
        }
      } catch {
        // Directory doesn't exist, continue
      }
    }
    return undefined;
  }

  private normalizePath(filePath: string): string {
    return filePath.split(path.sep).join('/');
  }

  private async getRepoRoot(): Promise<string> {
    if (!this.repoRootPromise) {
      this.repoRootPromise = (async () => {
        // If we have a custom gitDir, we might be in a stealth repo
        if (this.gitDir) {
          // For stealth repos with GIT_DIR set, the working directory is the repo root
          return this.workingDir;
        }
        
        try {
          const root = await this.git.revparse(['--show-toplevel']);
          return path.resolve(root.trim());
        } catch {
          // If revparse fails, try to detect stealth repository
          const detectedGitDir = await this.detectGitDir();
          if (detectedGitDir) {
            this.gitDir = detectedGitDir;
            // Reinitialize git with detected GIT_DIR
            const env = { ...process.env, GIT_DIR: detectedGitDir, GIT_WORK_TREE: this.workingDir };
            this.git = simpleGit(this.workingDir, { env });
            return this.workingDir;
          }
          return this.workingDir;
        }
      })();
    }
    return this.repoRootPromise;
  }

  private async resolvePaths(filePath: string): Promise<{
    absolutePath: string;
    gitRelativePath: string;
    workingRelativePath: string;
  }> {
    // Use safeResolve to prevent path traversal attacks
    const absolutePath = safeResolve(this.workingDir, filePath);

    const repoRoot = await this.getRepoRoot();
    let gitRelativePath = path.relative(repoRoot, absolutePath);
    const workingRelativePath = path.relative(this.workingDir, absolutePath);

    gitRelativePath = this.normalizePath(gitRelativePath);
    const normalizedWorkingRelative = this.normalizePath(workingRelativePath);

    if (!gitRelativePath || gitRelativePath.startsWith('..')) {
      throw new Error(`File is outside of git repository: ${absolutePath}`);
    }

    return {
      absolutePath,
      gitRelativePath,
      workingRelativePath: normalizedWorkingRelative
    };
  }

  /**
   * Safely parses XML file and handles corrupted XML.
   * Returns null on parse error instead of throwing.
   */
  private async safeParseStringsXML(filePath: string): Promise<{ strings: Map<string, StringResource>; error: string | null }> {
    try {
      const strings = await this.xmlParser.parseStringsXML(filePath);
      return { strings, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ XML parse error in ${filePath}: ${errorMsg}`);
      return { strings: new Map(), error: errorMsg };
    }
  }

  /**
   * Safely parses XML content (not file) and handles corrupted XML.
   * Returns null on parse error instead of throwing.
   */
  private safeParseStringsXMLContent(content: string, sourceIdentifier: string): { strings: Map<string, StringResource>; error: string | null } {
    try {
      // Validate XML content
      const validationResult = XMLValidator.validate(content);
      if (validationResult !== true) {
        const errorMsg = `Invalid XML in ${sourceIdentifier}: ${JSON.stringify(validationResult)}`;
        console.warn(`⚠️ ${errorMsg}`);
        return { strings: new Map(), error: errorMsg };
      }
      // Parse XML content
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        preserveOrder: false,
        trimValues: true,
        parseAttributeValue: true
      });
      const result = parser.parse(content) as StringsXML;
      const stringsMap = new Map<string, StringResource>();
      if (result.resources?.string) {
        const strings = result.resources.string;
        const stringArray = Array.isArray(strings) ? strings : [strings];
        for (const str of stringArray) {
          const name = str['@_name'];
          if (name) {
            stringsMap.set(name, {
              name,
              value: str['#text'] || '',
              translatable: str['@_translatable'] !== 'false'
            });
          }
        }
      }
      return { strings: stringsMap, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ XML parse error in ${sourceIdentifier}: ${errorMsg}`);
      return { strings: new Map(), error: errorMsg };
    }
  }

  async getDefaultStringsChanges(defaultStringsPath: string): Promise<DiffResult> {
    const diffResult: DiffResult = {
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      orderChanged: false,
      currentOrder: []
    };

    try {
      let status;
      try {
        status = await this.git.status();
      } catch (e) {
        console.warn(`Warning: Not a git repository or git error at ${this.workingDir}. Treating as untracked.`);
        // Not a git repo, treat as if everything is added (untracked)
        const absolutePath = path.isAbsolute(defaultStringsPath)
          ? defaultStringsPath
          : path.join(this.workingDir, defaultStringsPath);
        
        const { strings: currentStrings, error } = await this.safeParseStringsXML(absolutePath);
        // BUG-22: If XML is corrupted, mark entire file as "added" with warning
        if (error) {
          diffResult.added.set('__XML_PARSE_ERROR__', `Corrupted XML: ${error}`);
        }
        for (const [name, resource] of currentStrings) {
          if (resource.translatable !== false) {
            diffResult.added.set(name, resource.value);
          }
        }
        diffResult.currentOrder = Array.from(currentStrings.keys());
        return diffResult;
      }

      const {
        absolutePath,
        gitRelativePath,
        workingRelativePath
      } = await this.resolvePaths(defaultStringsPath);

      const notAdded = status.not_added.map(p => this.normalizePath(p));
      const created = status.created.map(p => this.normalizePath(p));
      const isTracked = !notAdded.includes(workingRelativePath) && !created.includes(workingRelativePath);

      if (!isTracked) {
        const { strings: currentStrings, error } = await this.safeParseStringsXML(absolutePath);
        // BUG-22: If XML is corrupted, mark entire file as "added" with warning
        if (error) {
          diffResult.added.set('__XML_PARSE_ERROR__', `Corrupted XML: ${error}`);
        }
        for (const [name, resource] of currentStrings) {
          if (resource.translatable !== false) {
            diffResult.added.set(name, resource.value);
          }
        }
        diffResult.currentOrder = Array.from(currentStrings.keys());
        return diffResult;
      }

      const { strings: currentStrings, error } = await this.safeParseStringsXML(absolutePath);
      // BUG-22: If XML is corrupted, mark entire file as "added" with warning
      if (error) {
        diffResult.added.set('__XML_PARSE_ERROR__', `Corrupted XML: ${error}`);
      }
      diffResult.currentOrder = Array.from(currentStrings.keys());
      
      const headContent = await this.git.show(['HEAD:' + gitRelativePath]).catch(() => '');
      
      const previousStrings = new Map<string, StringResource>();
      let previousOrder: string[] = [];
      if (headContent) {
        // BUG-22: Use safe parsing for HEAD content
        const { strings: parsed, error: parseError } = this.safeParseStringsXMLContent(headContent, `HEAD:${gitRelativePath}`);
        if (parseError) {
          console.warn(`⚠️ Failed to parse HEAD version of ${gitRelativePath}: ${parseError}`);
        }
        for (const [name, resource] of parsed) {
          previousStrings.set(name, resource);
        }
        previousOrder = Array.from(parsed.keys());
      }

      for (const [name, currentResource] of currentStrings) {
        if (currentResource.translatable === false) continue;
        
        const previousResource = previousStrings.get(name);
        
        if (!previousResource) {
          diffResult.added.set(name, currentResource.value);
        } else if (previousResource.value !== currentResource.value) {
          diffResult.modified.set(name, currentResource.value);
        }
      }

      for (const [name, previousResource] of previousStrings) {
        if (previousResource.translatable === false) continue;

        if (!currentStrings.has(name)) {
          diffResult.deleted.add(name);
        }
      }

      // Check if the order has changed
      if (previousOrder.length > 0) {
        const currentOrderFiltered = diffResult.currentOrder.filter(key => previousStrings.has(key));
        const previousOrderFiltered = previousOrder.filter(key => currentStrings.has(key));
        
        if (currentOrderFiltered.length === previousOrderFiltered.length) {
          for (let i = 0; i < currentOrderFiltered.length; i++) {
            if (currentOrderFiltered[i] !== previousOrderFiltered[i]) {
              diffResult.orderChanged = true;
              break;
            }
          }
        }
      }

    } catch (error) {
      console.error('Error analyzing git diff:', error);
      throw error;
    }

    return diffResult;
  }

  /**
   * Finds new (untracked) strings.xml modules in the filesystem.
   * Checks for new files in values/ directories that are not tracked by git.
   */
  private async findNewStringsModules(repoRoot: string, workingDir: string): Promise<string[]> {
    const newModules: string[] = [];
    const normalizedRepoRoot = path.resolve(repoRoot);
    const normalizedWorkingDir = path.resolve(workingDir);
    
    try {
      // Get list of tracked files from git
      const trackedFiles = await this.git.raw(['ls-files', '-z']);
      const trackedSet = new Set(trackedFiles.split('\0').filter(Boolean));
      
      // Walk through the working directory looking for values directories
      const valuesDirs = await this.findValuesDirectories(normalizedWorkingDir);
      
      for (const valuesDir of valuesDirs) {
        const valuesDirResolved = path.resolve(valuesDir);
        try {
          const entries = await fs.readdir(valuesDirResolved, { withFileTypes: true });
          
          for (const entry of entries) {
            if (entry.isFile() && entry.name === 'strings.xml') {
              const absolutePath = path.join(valuesDirResolved, entry.name);
              
              // Check if git tracks this file
              // UNTRACKED = file exists on disk but is NOT in git's index
              const relativeToRepo = path.relative(normalizedRepoRoot, absolutePath).split(path.sep).join('/');
              const relativeToWorking = path.relative(normalizedWorkingDir, absolutePath).split(path.sep).join('/');
              
              const isTracked = trackedSet.has(relativeToRepo) ||
                               trackedSet.has(relativeToWorking) ||
                               trackedSet.has(absolutePath);
              
              if (!isTracked) {
                newModules.push(absolutePath);
              }
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }
    } catch {
      // If git commands fail, return empty array
    }
    
    return newModules;
  }

  /**
   * Recursively finds all values directories in a directory tree.
   */
  private async findValuesDirectories(dir: string, maxDepth: number = 5, currentDepth: number = 0): Promise<string[]> {
    const results: string[] = [];
    
    if (currentDepth > maxDepth) return results;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const fullPath = path.join(dir, entry.name);
        
        // Check if this directory name ends with "values" (handles values-es, values-ru, etc.)
        const isValuesDir = entry.name === 'values' || entry.name.startsWith('values-');
        
        if (isValuesDir) {
          results.push(fullPath);
        } else if (!entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
          // Recurse into non-special directories
          const subResults = await this.findValuesDirectories(fullPath, maxDepth, currentDepth + 1);
          results.push(...subResults);
        }
      }
    } catch {
      // Skip directories we can't read
    }
    
    return results;
  }

  /**
   * Gets changes for all modules (including newly discovered untracked modules).
   * Combines git diff analysis with filesystem-based new module detection.
   */
  async getAllModulesWithChanges(knownModules: string[]): Promise<ModuleChangeInfo[]> {
    const results: ModuleChangeInfo[] = [];
    
    // Process known (already tracked) modules with git diff
    for (const modulePath of knownModules) {
      try {
        const relativePath = path.relative(this.workingDir, modulePath);
        const changes = await this.getDefaultStringsChanges(relativePath);
        results.push({
          modulePath,
          isNew: false,
          changes
        });
      } catch (error) {
        console.error(`Error getting changes for ${modulePath}:`, error);
      }
    }
    
    // Find new untracked modules via filesystem scan
    const repoRoot = await this.getRepoRoot();
    const newModules = await this.findNewStringsModules(repoRoot, this.workingDir);
    
    for (const newModulePath of newModules) {
      // Skip if already processed
      if (results.some(r => r.modulePath === newModulePath)) continue;
      
      try {
        const changes = await this.getDefaultStringsChanges(newModulePath);
        results.push({
          modulePath: newModulePath,
          isNew: true,
          changes
        });
      } catch (error) {
        console.error(`Error getting changes for new module ${newModulePath}:`, error);
      }
    }
    
    return results;
  }

  async hasUncommittedChanges(filePath: string): Promise<boolean> {
    const { workingRelativePath } = await this.resolvePaths(filePath);
    const status = await this.git.status();
    const modified = status.modified.map(p => this.normalizePath(p));
    const notAdded = status.not_added.map(p => this.normalizePath(p));
    const created = status.created.map(p => this.normalizePath(p));

    return modified.includes(workingRelativePath) ||
           notAdded.includes(workingRelativePath) ||
           created.includes(workingRelativePath);
  }
}
