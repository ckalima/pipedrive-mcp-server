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
  capabilityRetiredError,
  redactSecrets,
  boundErrorMessage,
  MAX_ERROR_MESSAGE_LENGTH,
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

    describe('reflected backend message is bounded and redacted (U5, F4)', () => {
      const TOKEN = 'c'.repeat(40);

      it('length-bounds an over-long backend message in the 400 branch', () => {
        const long = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH + 200);
        const result = handleApiError(400, { error: long });

        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.message).toContain('… [truncated]');
        // The whole message is "Invalid request: " + bounded body; the body itself
        // must not exceed the cap (+ marker).
        expect(result.message.length).toBeLessThanOrEqual(
          'Invalid request: '.length + MAX_ERROR_MESSAGE_LENGTH + '… [truncated]'.length
        );
      });

      it('length-bounds an over-long backend message in the default branch', () => {
        const long = 'y'.repeat(MAX_ERROR_MESSAGE_LENGTH + 200);
        const result = handleApiError(500, { error: long });

        expect(result.code).toBe('API_ERROR');
        expect(result.message).toContain('… [truncated]');
      });

      it('redacts a token-like value reflected in the 400 backend body', () => {
        const result = handleApiError(400, {
          error: `request to https://api.pipedrive.com/v1/x?api_token=${TOKEN} failed`,
        });

        expect(result.message).not.toContain(TOKEN);
        expect(result.message).toContain('[REDACTED]');
      });

      it('redacts a token-like value reflected in the default backend body', () => {
        const result = handleApiError(500, {
          error: `upstream https://api.pipedrive.com/v1/x?api_token=${TOKEN}`,
        });

        expect(result.message).not.toContain(TOKEN);
        expect(result.message).toContain('[REDACTED]');
      });

      it('strips control characters from a reflected backend body', () => {
        const result = handleApiError(400, { error: 'line1\nline2\rinjected' });

        expect(result.message).not.toMatch(/[\n\r]/);
      });

      it('leaves the fixed 401/403/404/429 strings unchanged (no reflection)', () => {
        // These branches never reflect the backend body, so a token-like or
        // over-long body must not appear and must not perturb the fixed copy.
        const noisy = { error: `api_token=${TOKEN} ` + 'z'.repeat(1000) };

        expect(handleApiError(401, noisy).message).toBe('API key is invalid or expired');
        expect(handleApiError(403, noisy).message).toBe('Access denied to this resource');
        expect(handleApiError(404, noisy).message).toBe('Resource not found');
        expect(handleApiError(429, noisy).message).toBe('Rate limit exceeded');
      });
    });
  });

  describe('redactSecrets (U2, F1)', () => {
    const TOKEN = 'a'.repeat(40);

    it('redacts the literal secret value when it appears bare', () => {
      const result = redactSecrets(`the key is ${TOKEN} ok`, TOKEN);
      expect(result).not.toContain(TOKEN);
      expect(result).toContain('[REDACTED]');
    });

    it('redacts every occurrence of the literal secret', () => {
      const result = redactSecrets(`${TOKEN} and again ${TOKEN}`, TOKEN);
      expect(result).not.toContain(TOKEN);
      expect(result.match(/\[REDACTED\]/g)).toHaveLength(2);
    });

    it('redacts the secret embedded in a v1 request URL', () => {
      const url = `https://api.pipedrive.com/v1/notes?api_token=${TOKEN}`;
      const result = redactSecrets(`request to ${url} failed`, TOKEN);
      expect(result).not.toContain(TOKEN);
      expect(result).toContain('[REDACTED]');
    });

    it('redacts the api_token= query form even without the literal secret', () => {
      const url = 'https://api.pipedrive.com/v1/notes?api_token=somethingsecret&limit=10';
      const result = redactSecrets(`request to ${url} failed`);
      expect(result).toContain('api_token=[REDACTED]');
      expect(result).not.toContain('somethingsecret');
      // Trailing query params after the token are preserved.
      expect(result).toContain('limit=10');
    });

    it('redacts an x-api-token header value even without the literal secret', () => {
      const result = redactSecrets('headers: { x-api-token: someheaderval }');
      expect(result).toContain('x-api-token');
      expect(result).not.toContain('someheaderval');
      expect(result).toContain('[REDACTED]');
    });

    it('does NOT match the v2 header name as the v1 query param', () => {
      // `x-api-token` (hyphen) must not be redacted by the `api_token=` (underscore) net.
      const result = redactSecrets('x-api-token present');
      expect(result).toContain('x-api-token present');
    });

    it('replaces control characters and newlines with spaces (no log-line forging)', () => {
      const result = redactSecrets('line1\nline2\r\ttab\x00null');
      expect(result).not.toMatch(/[\n\r\t\x00]/);
      expect(result).toBe('line1 line2  tab null');
    });

    it('is a no-op on a clean string', () => {
      expect(redactSecrets('a perfectly clean message')).toBe('a perfectly clean message');
    });

    it('handles an undefined knownSecret without throwing', () => {
      expect(() => redactSecrets('some message', undefined)).not.toThrow();
    });
  });

  describe('boundErrorMessage (U2/U5)', () => {
    const TOKEN = 'b'.repeat(40);

    it('redacts the token', () => {
      const result = boundErrorMessage(`failed with ${TOKEN}`, TOKEN);
      expect(result).not.toContain(TOKEN);
      expect(result).toContain('[REDACTED]');
    });

    it('truncates messages longer than the cap with an explicit marker', () => {
      const long = 'x'.repeat(MAX_ERROR_MESSAGE_LENGTH + 100);
      const result = boundErrorMessage(long);
      expect(result.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_LENGTH + '… [truncated]'.length);
      expect(result).toContain('… [truncated]');
    });

    it('leaves short messages unchanged (no marker)', () => {
      const result = boundErrorMessage('short message');
      expect(result).toBe('short message');
      expect(result).not.toContain('[truncated]');
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

  describe('capabilityRetiredError (U1, R6)', () => {
    it('produces a CAPABILITY_RETIRED error naming only the supplied display name', () => {
      const error = capabilityRetiredError('Notes');

      expect(error.code).toBe('CAPABILITY_RETIRED');
      expect(error.message).toContain('Notes');
      expect(error.message).toContain('no v2 equivalent');
      expect(error.suggestion).toContain('changelog');
    });

    it('does not reflect a raw endpoint string — only the display name appears', () => {
      // The builder takes a static, server-authored display name; a caller-supplied
      // endpoint path must never enter the model-facing message.
      const error = capabilityRetiredError('Leads (CRUD)');

      expect(error.message).toContain('Leads (CRUD)');
      expect(error.message).not.toContain('/leads');
      expect(error.message).not.toContain('123');
    });

    it('renders through formatErrorForMcp as code + message + suggestion', () => {
      const rendered = formatErrorForMcp(capabilityRetiredError('Mail'));

      expect(rendered).toContain('Error [CAPABILITY_RETIRED]:');
      expect(rendered).toContain('Mail');
      expect(rendered).toContain('Suggestion:');
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
