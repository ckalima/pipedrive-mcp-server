/**
 * Tests for utils/errors.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createErrorResponse,
  handleApiError,
  formatErrorForMcp,
  getErrorResponse,
  destructiveOperationGuard,
  mcpErrorResult,
  mcpErrorFromCode,
  type ErrorResponse,
} from '../../../src/utils/errors.js';

describe('errors', () => {
  describe('createErrorResponse', () => {
    it('should create error response with code and message', () => {
      const result = createErrorResponse('NOT_FOUND', 'Resource not found');

      expect(result).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        suggestion: undefined,
      });
    });

    it('should create error response with suggestion', () => {
      const result = createErrorResponse(
        'RATE_LIMITED',
        'Too many requests',
        'Wait 60 seconds'
      );

      expect(result).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        suggestion: 'Wait 60 seconds',
      });
    });

    it('should create error response for all error codes', () => {
      const codes = [
        'MISSING_API_KEY',
        'INVALID_API_KEY',
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'RATE_LIMITED',
        'PERMISSION_DENIED',
        'API_ERROR',
        'NETWORK_ERROR',
        'DESTRUCTIVE_DISABLED',
      ] as const;

      codes.forEach((code) => {
        const result = createErrorResponse(code, 'Test message');
        expect(result.code).toBe(code);
      });
    });
  });

  describe('handleApiError', () => {
    it('should handle 400 Bad Request', () => {
      const result = handleApiError(400, { error: 'Invalid parameter' });

      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toContain('Invalid parameter');
      expect(result.suggestion).toContain('Check your request parameters');
    });

    it('should handle 401 Unauthorized', () => {
      const result = handleApiError(401, { error: 'Invalid API key' });

      expect(result.code).toBe('INVALID_API_KEY');
      expect(result.message).toContain('invalid or expired');
      expect(result.suggestion).toContain('Verify your API key');
    });

    it('should handle 403 Forbidden', () => {
      const result = handleApiError(403, { error: 'Access denied' });

      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.message).toContain('Access denied');
      expect(result.suggestion).toContain('permissions');
    });

    it('should handle 404 Not Found', () => {
      const result = handleApiError(404, { error: 'Deal not found' });

      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toContain('not found');
      expect(result.suggestion).toContain('Verify the ID');
    });

    it('should handle 429 Too Many Requests', () => {
      const result = handleApiError(429, { error: 'Rate limit exceeded' });

      expect(result.code).toBe('RATE_LIMITED');
      expect(result.message).toContain('Rate limit');
      expect(result.suggestion).toContain('Wait 60 seconds');
    });

    it('should handle unknown status codes as API_ERROR', () => {
      const result = handleApiError(500, { error: 'Internal server error' });

      expect(result.code).toBe('API_ERROR');
      expect(result.message).toContain('500');
      expect(result.message).toContain('Internal server error');
    });

    it('should handle body without error field', () => {
      const result = handleApiError(400, { message: 'Something went wrong' });

      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toContain('Unknown error');
    });

    it('should handle null body', () => {
      const result = handleApiError(500, null);

      expect(result.code).toBe('API_ERROR');
      expect(result.message).toContain('Unknown error');
    });

    it('should handle string body', () => {
      const result = handleApiError(400, 'Error string');

      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toContain('Unknown error');
    });
  });

  describe('formatErrorForMcp', () => {
    it('should format error without suggestion', () => {
      const error: ErrorResponse = {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      };

      const result = formatErrorForMcp(error);

      expect(result).toBe('Error [NOT_FOUND]: Resource not found');
    });

    it('should format error with suggestion', () => {
      const error: ErrorResponse = {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        suggestion: 'Wait 60 seconds',
      };

      const result = formatErrorForMcp(error);

      expect(result).toBe(
        'Error [RATE_LIMITED]: Too many requests\nSuggestion: Wait 60 seconds'
      );
    });

    it('should handle empty suggestion', () => {
      const error: ErrorResponse = {
        code: 'API_ERROR',
        message: 'Server error',
        suggestion: '',
      };

      const result = formatErrorForMcp(error);

      // Empty string is falsy, so no suggestion line
      expect(result).toBe('Error [API_ERROR]: Server error');
    });
  });

  describe('getErrorResponse', () => {
    it('should return response error when present', () => {
      const error: ErrorResponse = {
        code: 'NOT_FOUND', message: 'Not found',
      };
      const result = getErrorResponse({ error });

      expect(result).toBe(error);
    });

    it('should return default error when response error is undefined', () => {
      const result = getErrorResponse({});

      expect(result.code).toBe('API_ERROR');
      expect(result.message).toBe('Unknown API error');
      expect(result.suggestion).toContain('API key');
    });

    it('should return default error when response error is null-ish', () => {
      const result = getErrorResponse({ error: undefined });

      expect(result.code).toBe('API_ERROR');
    });

    it('should return independent copies of the default error', () => {
      const a = getErrorResponse({});
      const b = getErrorResponse({});

      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('should isolate mutations between returned copies', () => {
      const a = getErrorResponse({});
      a.code = 'MUTATED';
      const b = getErrorResponse({});

      expect(b.code).toBe('API_ERROR');
    });
  });

  describe('mcpErrorResult', () => {
    it('should return MCP error result with error response', () => {
      const response = {
        error: { code: 'NOT_FOUND', message: 'Not found' } as ErrorResponse,
      };
      const result = mcpErrorResult(response);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Error [NOT_FOUND]: Not found');
    });

    it('should include suggestion in MCP error result when present', () => {
      const response = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          suggestion: 'Wait 60 seconds',
        } as ErrorResponse,
      };
      const result = mcpErrorResult(response);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Error [RATE_LIMITED]: Too many requests\nSuggestion: Wait 60 seconds'
      );
    });

    it('should return MCP error result with default error when no error present', () => {
      const result = mcpErrorResult({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API_ERROR');
      expect(result.content[0].text).toContain('Unknown API error');
    });
  });

  describe('mcpErrorFromCode', () => {
    it('should return MCP error result with code and message', () => {
      const result = mcpErrorFromCode('NOT_FOUND', 'Deal not found');

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Error [NOT_FOUND]: Deal not found');
    });

    it('should include suggestion when provided', () => {
      const result = mcpErrorFromCode(
        'VALIDATION_ERROR',
        'Invalid arguments',
        'Check the inputSchema'
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Error [VALIDATION_ERROR]: Invalid arguments\nSuggestion: Check the inputSchema'
      );
    });

    it('should omit suggestion line when not provided', () => {
      const result = mcpErrorFromCode('API_ERROR', 'Server error');

      expect(result.content[0].text).not.toContain('Suggestion:');
    });
  });

  describe('destructiveOperationGuard', () => {
    const originalEnv = process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      } else {
        process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = originalEnv;
      }
    });

    it('should return null when PIPEDRIVE_ENABLE_DESTRUCTIVE is true', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      expect(destructiveOperationGuard()).toBeNull();
    });

    it('should return MCP error response when env var is unset', () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
      expect(result!.content[0].type).toBe('text');
      expect(result!.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should return MCP error response when env var is false', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'false';
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
    });

    it('should treat TRUE (uppercase) as disabled', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'TRUE';
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
    });

    it('should treat 1 as disabled', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = '1';
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
    });

    it('should treat yes as disabled', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'yes';
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
    });

    it('should include suggestion in error response', () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const result = destructiveOperationGuard();

      expect(result!.content[0].text).toContain('PIPEDRIVE_ENABLE_DESTRUCTIVE=true');
    });

    it('should not throw when API key is absent', () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      expect(() => destructiveOperationGuard()).not.toThrow();
      const result = destructiveOperationGuard();

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
      expect(result!.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should return null when destructive enabled regardless of API key state', () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      delete process.env.PIPEDRIVE_API_KEY;
      expect(() => destructiveOperationGuard()).not.toThrow();
      expect(destructiveOperationGuard()).toBeNull();
    });
  });
});
