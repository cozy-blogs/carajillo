import { CaptchaVerifier, configuration } from '../captcha';
import { HttpError } from '../error';
import * as config from '../config';
import fetch from 'node-fetch';

jest.mock('node-fetch', () => {
  return jest.fn();
});
const mockedFetch = jest.mocked(fetch);

jest.mock('../config');

describe('captcha', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('configuration', () => {
    it('should return correct configuration', () => {
      jest.mocked(config.loadConfiguration).mockReturnValue({
        company: { name: 'Test Company', address: '123 Test St', logo: 'https://example.com/logo.png' },
        server: { numberOfProxies: 1, corsOrigin: ['https://example.com'], jwtSecret: 'test-jwt-secret', jwtExpiration: 3600 },
        loopsSo: { apiKey: 'test-loops-api-key' },
        captcha: { provider: 'hcaptcha', siteKey: 'hcaptcha-site-key', secret: 'hcaptcha-secret', threshold: 0.5, branding: 'disclaimer' },
      });

      const configResponse = configuration();
      expect(configResponse).toEqual({
        success: true,
        provider: 'hcaptcha',
        site_key: 'hcaptcha-site-key',
        branding: 'disclaimer',
      });
    });
  });

  describe('CaptchaVerifier', () => {
    const recaptchaConfiguration: config.CaptchaConfiguration = {
      provider: 'recaptcha',
      siteKey: 'test-site-key',
      secret: 'test-recaptcha-secret',
      threshold: 0.5,
      branding: 'badge',
    };

    const hcaptchaConfiguration: config.CaptchaConfiguration = {
      provider: 'hcaptcha',
      siteKey: 'test-hcaptcha-site-key',
      secret: 'test-hcaptcha-secret',
      threshold: 0.5,
      branding: 'disclaimer',
    };

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

      const verifier = new CaptchaVerifier(recaptchaConfiguration);
      const result = await verifier.verify('subscribe', 'test-token');

      expect(result).toBe(true);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://www.google.com/recaptcha/api/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('secret=') && expect.stringContaining('&response=test-token'),
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

      const verifier = new CaptchaVerifier(recaptchaConfiguration);
      const result = await verifier.verify('subscribe', 'test-token');

      expect(result).toBe(false);
    });

    it('should return true when provider is "hcaptcha"', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          challenge_ts: '2024-01-01T00:00:00Z',
          hostname: 'example.com',
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const verifier = new CaptchaVerifier(hcaptchaConfiguration);
      const result = await verifier.verify('subscribe', 'test-token');

      expect(result).toBe(true);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.hcaptcha.com/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('secret=test-hcaptcha-secret'),
        }),
      );
      const requestBody = (mockedFetch.mock.calls[0][1] as any).body as string;
      expect(requestBody).toContain('response=test-token');
    });

    it('should throw HttpError for invalid-input-response error on hcaptcha', async () => {

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          'error-codes': ['invalid-input-response'],
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const verifier = new CaptchaVerifier(hcaptchaConfiguration);
      await expect(verifier.verify('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifier.verify('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
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

      const verifier = new CaptchaVerifier(recaptchaConfiguration);
      await expect(verifier.verify('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifier.verify('subscribe', 'test-token');
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

      const verifier = new CaptchaVerifier(recaptchaConfiguration);
      await expect(verifier.verify('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifier.verify('subscribe', 'test-token');
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
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
      };

      mockedFetch.mockResolvedValue(mockResponse as any);

      const verifier = new CaptchaVerifier(recaptchaConfiguration);
      await expect(verifier.verify('subscribe', 'test-token')).rejects.toThrow(HttpError);
      try {
        await verifier.verify('subscribe', 'test-token');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(429);
        expect((error as HttpError).reason).toBe('captcha-timeout');
      }
    });
  });
});

