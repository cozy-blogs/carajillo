// Mock node-fetch before any imports that use it
jest.mock('node-fetch', () => {
  return jest.fn();
});

import request from 'supertest';
import { app } from '../api';
import * as subscription from '../subscription';
import * as loops from '../loops';
import * as captcha from '../captcha';
import * as jwt from '../jwt';
import { HttpError } from '../error';

jest.mock('../subscription');
jest.mock('../loops');
jest.mock('../captcha');
jest.mock('../jwt');

describe('API routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.COMPANY_NAME = 'Test Company';
    process.env.COMPANY_ADDRESS = '123 Test St';
    process.env.COMPANY_LOGO = 'https://example.com/logo.png';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    jest.resetModules();

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET /api/company', () => {
    it('should return company information', async () => {
      const response = await request(app)
        .get('/api/company')
        .expect(200);

      expect(response.body).toEqual({
        name: 'Test Company',
        address: '123 Test St',
        logo: 'https://example.com/logo.png',
      });
    });

    it('should return empty strings when company info is not set', async () => {
      delete process.env.COMPANY_NAME;
      delete process.env.COMPANY_ADDRESS;
      delete process.env.COMPANY_LOGO;

      const response = await request(app)
        .get('/api/company')
        .expect(200);

      expect(response.body).toEqual({
        name: '',
        address: '',
        logo: undefined,
      });
    });
  });

  describe('GET /api/captcha', () => {
    it('should return CAPTCHA configuration', async () => {
      (captcha.configuration as jest.Mock).mockReturnValue({
        success: true,
        provider: 'recaptcha',
        site_key: 'test-site-key',
      });

      const response = await request(app)
        .get('/api/captcha')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        provider: 'recaptcha',
        site_key: 'test-site-key',
      });
    });
  });

  describe('GET /api/lists', () => {
    it('should return mailing lists', async () => {
      const mockLists = [
        { id: 'list-1', name: 'Newsletter', description: 'Main newsletter', isPublic: true },
      ];

      (loops.getMailingLists as jest.Mock).mockResolvedValue(mockLists);

      const response = await request(app)
        .get('/api/lists')
        .expect(200);

      expect(response.body).toEqual(mockLists);
    });
  });

  describe('POST /api/subscription', () => {
    it('should successfully subscribe', async () => {
      (subscription.subscribe as jest.Mock).mockResolvedValue({
        success: true,
        doubleOptIn: true,
        email: 'test@example.com',
      });

      const response = await request(app)
        .post('/api/subscription')
        .send({
          email: 'test@example.com',
          captchaToken: 'token',
          mailingLists: [],
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        doubleOptIn: true,
        email: 'test@example.com',
      });
    });

    it('should return 429 when CAPTCHA fails', async () => {
      (subscription.subscribe as jest.Mock).mockRejectedValue(
        new HttpError({
          statusCode: 429,
          message: 'Try again later',
          details: 'Requestor categorized as bot',
        })
      );

      await request(app)
        .post('/api/subscription')
        .send({
          email: 'test@example.com',
          captchaToken: 'token',
        })
        .expect(429);
    });
  });

  describe('GET /api/subscription', () => {
    it('should return subscription status with valid token', async () => {
      (jwt.authenticate as jest.Mock).mockReturnValue('test@example.com');
      (subscription.getSubscription as jest.Mock).mockResolvedValue({
        success: true,
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: [],
      });

      const response = await request(app)
        .get('/api/subscription')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.subscribed).toBe(true);
    });

    it('should return 401 when token is missing', async () => {
      (jwt.authenticate as jest.Mock).mockImplementation(() => {
        throw new HttpError({
          statusCode: 401,
          message: 'Unauthorized',
          reason: 'missing-token',
        });
      });

      await request(app)
        .get('/api/subscription')
        .expect(401);
    });
  });

  describe('PUT /api/subscription', () => {
    it('should update subscription with valid token', async () => {
      (jwt.authenticate as jest.Mock).mockReturnValue('test@example.com');
      (subscription.updateSubscription as jest.Mock).mockResolvedValue({
        success: true,
        email: 'test@example.com',
        subscribed: true,
      });

      const response = await request(app)
        .put('/api/subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'test@example.com',
          subscribe: true,
        })
        .expect(200);

      expect(response.body.subscribed).toBe(true);
    });

    it('should return 403 when email does not match token', async () => {
      (jwt.authenticate as jest.Mock).mockReturnValue('token@example.com');

      await request(app)
        .put('/api/subscription')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'different@example.com',
          subscribe: true,
        })
        .expect(403);
    });
  });

  describe('POST /api/honeypot', () => {
    it('should return success for honeypot requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const response = await request(app)
        .post('/api/honeypot')
        .send({ some: 'data' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/company')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      // CORS middleware should be applied - check for CORS headers
      // Note: CORS headers may vary, but origin should be set
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['vary']).toBe('Origin');
    });
  });
});

