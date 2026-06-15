/**
 * Tests for config.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { getConfig, validateConfig, getImageReadBaseDir } from '../../src/config.js';
import { VALID_API_KEY, testApiKeys, clearApiKey, setupEnvWithApiKey } from '../helpers/mockEnv.js';

describe('config', () => {
  beforeEach(() => {
    clearApiKey();
  });

  describe('getConfig', () => {
    it('should return valid config when API key is correct length', () => {
      setupEnvWithApiKey(VALID_API_KEY);

      const config = getConfig();

      expect(config.apiKey).toBe(VALID_API_KEY);
      expect(config.baseUrlV1).toBe('https://api.pipedrive.com/v1');
      expect(config.baseUrlV2).toBe('https://api.pipedrive.com/api/v2');
    });

    it('should throw error when API key is missing', () => {
      clearApiKey();

      expect(() => getConfig()).toThrow('PIPEDRIVE_API_KEY environment variable is required');
    });

    it('should throw error when API key is too short', () => {
      setupEnvWithApiKey(testApiKeys.tooShort);

      expect(() => getConfig()).toThrow(/expected a 40-character key/);
    });

    it('should throw error when API key is too long', () => {
      setupEnvWithApiKey(testApiKeys.tooLong);

      expect(() => getConfig()).toThrow(/expected a 40-character key/);
    });

    it('should not reveal the provided key length in the error', () => {
      setupEnvWithApiKey(testApiKeys.tooShort);

      expect(() => getConfig()).not.toThrow(/got \d/);
    });

    it('should throw error when API key is empty', () => {
      setupEnvWithApiKey(testApiKeys.empty);

      expect(() => getConfig()).toThrow('PIPEDRIVE_API_KEY environment variable is required');
    });

    it('should include helpful suggestion in error message', () => {
      clearApiKey();

      expect(() => getConfig()).toThrow(/Personal preferences > API/);
    });

    it('should return enableDestructive false when env var is unset', () => {
      setupEnvWithApiKey(VALID_API_KEY);
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;

      const config = getConfig();

      expect(config.enableDestructive).toBe(false);
    });

    it('should return enableDestructive true when env var is "true"', () => {
      setupEnvWithApiKey(VALID_API_KEY);
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';

      const config = getConfig();

      expect(config.enableDestructive).toBe(true);
    });

    it('should return enableDestructive false for non-"true" values', () => {
      setupEnvWithApiKey(VALID_API_KEY);

      ['TRUE', '1', 'yes', 'false'].forEach((value) => {
        process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = value;
        const config = getConfig();
        expect(config.enableDestructive).toBe(false);
      });
    });
  });

  describe('getImageReadBaseDir (U10)', () => {
    beforeEach(() => {
      delete process.env.PIPEDRIVE_IMAGE_BASE_DIR;
    });

    it('returns null when the var is unset (reads disabled by default)', () => {
      expect(getImageReadBaseDir()).toBeNull();
    });

    it('returns null when the var is blank or whitespace', () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '   ';
      expect(getImageReadBaseDir()).toBeNull();
    });

    it('returns the resolved absolute base dir when set', () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/srv/images';
      expect(getImageReadBaseDir()).toBe('/srv/images');
    });

    it('resolves a relative base dir against the cwd', () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = 'images';
      expect(getImageReadBaseDir()).toBe(resolve('images'));
    });
  });

  describe('validateConfig', () => {
    it('should return valid: true when config is correct', () => {
      setupEnvWithApiKey(VALID_API_KEY);

      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid: false with error message when API key is missing', () => {
      clearApiKey();

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('PIPEDRIVE_API_KEY');
    });

    it('should return valid: false with error message when API key is wrong length', () => {
      setupEnvWithApiKey(testApiKeys.tooShort);

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expected a 40-character key');
    });

    it('should not throw errors, only return validation result', () => {
      clearApiKey();

      expect(() => validateConfig()).not.toThrow();
    });
  });
});
