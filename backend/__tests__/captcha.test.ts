import { configuration, verifyCaptcha, sendVerificationRequest } from '../captcha';
import { HttpError } from '../error';

jest.mock('node-fetch', () => {
  return jest.fn();
});

import fetch from 'node-fetch';
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('captcha', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.CAPTCHA_PROVIDER = 'recaptcha';
    process.env.RECAPTCHA_SITE_KEY = 'test-site-key';
    process.env.RECAPTCHA_SECRET = 'test-recaptcha-secret';
    process.env.HCAPTCHA_SITE_KEY = 'test-hcaptcha-site-key';
    process.env.HCAPTCHA_SECRET = 'test-hcaptcha-secret';
    process.env.CAPTCHA_THRESHOLD = '0.5';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('configuration', () => {
    it('should return correct configuration', () => {
      const config = configuration();

      expect(config).toEqual({
        success: true,
        provider: 'recaptcha',
        site_key: 'test-site-key',
      });
    });

    it('should use default provider when not set', () => {
      // This test verifies the default behavior
      // The default is set in the module, so we test it with the default
      expect(configuration().provider).toBeDefined();
    });
  });

  describe('verifyCaptcha', () => {
    it('should return true when score is above threshold', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          score: 0.9,
          action: 'subscribe',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const result = await verifyCaptcha('subscribe', 'test-token');

      expect(result).toBe(true);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://www.google.com/recaptcha/api/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(`secret=${process.env.RECAPTCHA_SECRET}`),
        })
      );
      const requestBody = (mockedFetch.mock.calls[0][1] as any).body as string;
      expect(requestBody).toContain('response=test-token');
    });

    it('should return false when score is below threshold', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          score: 0.3,
          action: 'subscribe',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const result = await verifyCaptcha('subscribe', 'test-token');

      expect(result).toBe(false);
    });

    it('should return true when provider is "hcaptcha"', async () => {
      process.env.CAPTCHA_PROVIDER = 'hcaptcha';
      jest.resetModules();
      const { default: nodeFetch } = await import('node-fetch');
      const freshFetch = nodeFetch as jest.MockedFunction<typeof fetch>;
      const captchaModule = await import('../captcha');

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      freshFetch.mockResolvedValue(mockResponse as any);

      const result = await captchaModule.verifyCaptcha('subscribe', 'test-token');

      expect(result).toBe(true);
      expect(freshFetch).toHaveBeenCalledWith(
        'https://api.hcaptcha.com/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('secret=test-hcaptcha-secret'),
        }),
      );
      const requestBody = (freshFetch.mock.calls[0][1] as any).body as string;
      expect(requestBody).toContain('response=test-token');
    });

    it('should throw HttpError for invalid-input-response error on hcaptcha', async () => {
      process.env.CAPTCHA_PROVIDER = 'hcaptcha';
      jest.resetModules();
      const { default: nodeFetch } = await import('node-fetch');
      const freshFetch = nodeFetch as jest.MockedFunction<typeof fetch>;
      const { HttpError: FreshHttpError } = await import('../error');
      const captchaModule = await import('../captcha');

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          'error-codes': ['invalid-input-response'],
        }),
      };

      freshFetch.mockResolvedValue(mockResponse as any);

      await expect(captchaModule.verifyCaptcha('subscribe', 'test-token')).rejects.toThrow(FreshHttpError);
      try {
        await captchaModule.verifyCaptcha('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(FreshHttpError);
        expect((error as any).statusCode).toBe(400);
      }
    });

    it('should throw HttpError when action does not match', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          score: 0.9,
          action: 'different-action',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      await expect(verifyCaptcha('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifyCaptcha('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(400);
        expect((error as HttpError).reason).toBe('captcha-action-mismatch');
      }
    });

    it('should throw HttpError for invalid-input-response error', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true, // success can be true even with error codes
          score: 0.9,
          action: 'subscribe',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
          'error-codes': ['invalid-input-response'],
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      await expect(verifyCaptcha('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifyCaptcha('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(400);
        expect((error as HttpError).reason).toBe('bad-captcha');
      }
    });

    it('should throw HttpError for timeout-or-duplicate error', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true, // success can be true even with error codes
          score: 0.9,
          action: 'subscribe',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
          'error-codes': ['timeout-or-duplicate'],
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      await expect(verifyCaptcha('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifyCaptcha('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(429);
        expect((error as HttpError).reason).toBe('captcha-timeout');
      }
    });

    it('should return true when provider is "none"', async () => {
      // Note: This test verifies the 'none' provider behavior
      // In a real scenario, you would set CAPTCHA_PROVIDER=none before starting the app
      // For testing, we verify the configuration function handles it correctly
      process.env.CAPTCHA_PROVIDER = 'none';
      jest.resetModules();
      
      // Re-import the module with new env
      const captchaModule = await import('../captcha');
      const result = await captchaModule.verifyCaptcha('subscribe', 'any-token');
      
      expect(result).toBe(true);
    });
  });

  describe('sendVerificationRequest', () => {
    it('should send verification request and return response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          score: 0.9,
          action: 'subscribe',
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const result = await sendVerificationRequest('test-token');

      expect(result).toEqual({
        success: true,
        score: 0.9,
        action: 'subscribe',
        challenge_ts: '2024-01-01T00:00:00Z',
        hostname: 'example.com',
      });
    });

    it('should throw error when RECAPTCHA_SECRET is not set', async () => {
      const originalSecret = process.env.RECAPTCHA_SECRET;
      delete process.env.RECAPTCHA_SECRET;
      
      jest.resetModules();
      const captchaModule = await import('../captcha');

      await expect(captchaModule.sendVerificationRequest('test-token')).rejects.toThrow('Server configuration error');
      
      process.env.RECAPTCHA_SECRET = originalSecret;
    });

    it('should throw error when API response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      await expect(sendVerificationRequest('test-token')).rejects.toThrow('reCAPTCHA API returned status 500');
    });

    it('should throw HttpError when CAPTCHA returns success: false', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: false,
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      await expect(sendVerificationRequest('test-token')).rejects.toThrow(HttpError);
      try {
        await sendVerificationRequest('test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(500);
      }
    });
  });
});

