/**
 * Custom error classes for android-i18n MCP server
 * Implements proper TypeScript error inheritance with cause support
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.code = code;
    this.cause = cause;

    // Fix prototype chain for TypeScript Error inheritance
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
  }
}

export class TranslationError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'TRANSLATION_ERROR', cause);
  }
}

export class XMLParseError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'XML_PARSE_ERROR', cause);
  }
}

export class FileSystemError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'FILE_SYSTEM_ERROR', cause);
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.field = field;
  }
}

export class PathTraversalError extends ValidationError {
  constructor(path: string) {
    super(`Path traversal detected: ${path}`, 'path');
  }
}

export class InvalidLanguageError extends AppError {
  public readonly invalidLanguages: string[];
  public readonly suggest: string[];

  constructor(invalidLanguages: string[], availableLanguages: string[], cause?: Error) {
    // Special handling for empty string - provide a clearer error message
    if (invalidLanguages.length === 1 && invalidLanguages[0] === '') {
      const message = `Empty string is not a valid language code. Supported: ${availableLanguages.join(', ')}`;
      super(message, 'INVALID_LANGUAGE', cause);
    } else {
      const message = `Unsupported language codes: ${invalidLanguages.join(', ')}. Supported: ${availableLanguages.join(', ')}`;
      super(message, 'INVALID_LANGUAGE', cause);
    }
    this.invalidLanguages = invalidLanguages;
    this.suggest = availableLanguages;
  }
}
