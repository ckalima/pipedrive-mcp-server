/**
 * Integration tests for product image tools (U6)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile, realpath, stat } from 'node:fs/promises';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
} from '../../helpers/mockFetch.js';
import { MAX_IMAGE_FILE_BYTES } from '../../../src/tools/products.js';

// Mock the filesystem reads the guarded file_path path uses (preserve all other
// real exports) so the upload branch can be driven deterministically without
// touching disk. realpath + stat + readFile cover canonicalization, the size
// cap, and the byte read respectively (U10).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(), realpath: vi.fn(), stat: vi.fn() };
});

/** Identity realpath: no symlinks, so canonical path === input path. */
function realpathIdentity() {
  vi.mocked(realpath).mockImplementation(async (p) => p as unknown as string);
}

const imageFixture = {
  id: 42,
  product_id: 123,
  company_id: '1',
  public_url: 'https://example.com/images/product-123.jpg',
  add_time: '2024-01-01T00:00:00Z',
  mime_type: 'image/jpeg',
  name: 'product-123.jpg',
};

const uploadResult = {
  id: 42,
  product_id: 123,
  company_id: '1',
  add_time: '2024-01-01T00:00:00Z',
};

// "hello" base64-encoded
const HELLO_B64 = Buffer.from('hello').toString('base64');

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('product image tools (U6)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
    vi.mocked(readFile).mockReset();
    vi.mocked(realpath).mockReset();
    vi.mocked(stat).mockReset();
    // Reads are deny-by-default; each file_path test opts in explicitly.
    delete process.env.PIPEDRIVE_IMAGE_BASE_DIR;
  });

  describe('getProductImage', () => {
    it('should call GET /api/v2/products/123/images', async () => {
      const mockFn = mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      await getProductImage({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
    });

    it('should return the single image object as data with public_url round-tripped', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.public_url).toBe(imageFixture.public_url);
    });

    it('should include "Image for product 123" in summary', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Image for product 123');
    });

    it('should NOT include a pagination key', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty('pagination');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      expect(result.isError).toBe(true);
    });
  });

  describe('deleteProductImage', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to /api/v2/products/123/images (no trailing image id) when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
      expect(options.method).toBe('DELETE');
    });

    it('should NOT append an image id to the DELETE path', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      // Path must end with /images (or /images?...) and not include an extra numeric segment
      expect(url).toMatch(/\/products\/123\/images(\?|$)/);
    });

    it('should return summary "Image deleted from product 123" when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Image deleted from product 123');
    });

    it('should return the deleted image id as data when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.id).toBe(42);
    });
  });

  describe('uploadProductImage (#69 U5)', () => {
    it('should POST multipart FormData to /api/v2/products/{id}/images (base64 mode)', async () => {
      const mockFn = mockApiSuccess(uploadResult);
      const { uploadProductImage } = await getProductsTools();

      await uploadProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('should append the bytes under the "data" field and not set Content-Type: application/json', async () => {
      const mockFn = mockApiSuccess(uploadResult);
      const { uploadProductImage } = await getProductsTools();

      await uploadProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      const [, options] = mockFn.mock.calls[0];
      const fd = options.body as FormData;
      expect(fd.has('data')).toBe(true);
      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
      expect(headers['content-type']).toBeUndefined();
    });

    it('should return summary containing "uploaded"', async () => {
      mockApiSuccess(uploadResult);
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('uploaded');
      expect(parsed.summary).toContain('123');
    });

    it('should read the file server-side in file_path mode when reads are enabled (bytes never passed as base64)', async () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/imgbase';
      realpathIdentity();
      vi.mocked(stat).mockResolvedValue({ size: 5 } as Awaited<ReturnType<typeof stat>>);
      vi.mocked(readFile).mockResolvedValue(Buffer.from('hello'));
      const mockFn = mockApiSuccess(uploadResult);
      const { uploadProductImage } = await getProductsTools();

      await uploadProductImage({ id: 123, file_path: '/imgbase/p.png', file_name: 'p.png' });

      expect(vi.mocked(readFile)).toHaveBeenCalledWith('/imgbase/p.png');
      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      // No base64 string should appear anywhere in the outbound URL
      expect(url).not.toContain(HELLO_B64);
    });

    it('should return isError on API failure', async () => {
      mockApiError(413, 'Payload too large');
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateProductImage (#69 U5)', () => {
    it('should PUT multipart FormData to /api/v2/products/{id}/images', async () => {
      const mockFn = mockApiSuccess(uploadResult);
      const { updateProductImage } = await getProductsTools();

      await updateProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
      expect(options.method).toBe('PUT');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('should return summary containing "updated"', async () => {
      mockApiSuccess(uploadResult);
      const { updateProductImage } = await getProductsTools();

      const result = await updateProductImage({ id: 123, base64_data: HELLO_B64, file_name: 'p.png' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('updated');
      expect(parsed.summary).toContain('123');
    });
  });

  describe('product-image file_path gating (U10)', () => {
    it('rejects a file_path read when PIPEDRIVE_IMAGE_BASE_DIR is unset and names the enabling mechanism', async () => {
      delete process.env.PIPEDRIVE_IMAGE_BASE_DIR;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({ id: 123, file_path: '/etc/anything.png', file_name: 'p.png' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('PIPEDRIVE_IMAGE_BASE_DIR');
      // Disabled rejection happens before any filesystem call or upload.
      expect(vi.mocked(realpath)).not.toHaveBeenCalled();
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a traversal path that escapes the base dir before any filesystem call', async () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/imgbase';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({
        id: 123, file_path: '/imgbase/../etc/passwd', file_name: 'p.png',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('outside the permitted image directory');
      // Lexical containment rejects before any fs call (no realpath, no read).
      expect(vi.mocked(realpath)).not.toHaveBeenCalled();
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a path whose canonical target escapes the base dir (symlink defense)', async () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/imgbase';
      vi.mocked(realpath).mockImplementation(async (p) =>
        (p === '/imgbase' ? '/imgbase' : '/etc/passwd') as unknown as string
      );
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({
        id: 123, file_path: '/imgbase/link.png', file_name: 'p.png',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('outside the permitted image directory');
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    });

    it('rejects a file exceeding the read-size cap with a structured error and no read', async () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/imgbase';
      realpathIdentity();
      vi.mocked(stat).mockResolvedValue(
        { size: MAX_IMAGE_FILE_BYTES + 1 } as Awaited<ReturnType<typeof stat>>
      );
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({
        id: 123, file_path: '/imgbase/big.png', file_name: 'p.png',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('read limit');
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    });

    it('does not reflect the resolved path or raw fs error when a read fails', async () => {
      process.env.PIPEDRIVE_IMAGE_BASE_DIR = '/imgbase';
      realpathIdentity();
      vi.mocked(stat).mockResolvedValue({ size: 10 } as Awaited<ReturnType<typeof stat>>);
      vi.mocked(readFile).mockRejectedValue(
        Object.assign(new Error('EACCES: permission denied, open /imgbase/secret.png'), { code: 'EACCES' })
      );
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { uploadProductImage } = await getProductsTools();

      const result = await uploadProductImage({
        id: 123, file_path: '/imgbase/secret.png', file_name: 'p.png',
      });

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).not.toContain('/imgbase/secret.png');
      expect(text).not.toContain('EACCES');
      expect(text).not.toContain('permission denied');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('gates updateProductImage file_path reads identically (disabled by default)', async () => {
      delete process.env.PIPEDRIVE_IMAGE_BASE_DIR;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { updateProductImage } = await getProductsTools();

      const result = await updateProductImage({ id: 123, file_path: '/etc/anything.png', file_name: 'p.png' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('PIPEDRIVE_IMAGE_BASE_DIR');
      expect(vi.mocked(readFile)).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
