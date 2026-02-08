// Mock node-fetch before any imports that use it
jest.mock('node-fetch', () => {
  return jest.fn();
});

import { subscribe, getSubscription, updateSubscription, SubscribeRequest } from '../subscription';
import { HttpError } from '../error';
import * as captcha from '../captcha';
import { Loops } from '../loops';
import * as jwt from '../jwt';
import type { Configuration } from '../config';

jest.mock('../captcha');
jest.mock('../config');
const mockConfig: Configuration = {
  company: { name: 'Test Company', address: '123 Test St', logo: 'https://example.com/logo.png' },
  server: { numberOfProxies: 1, corsOrigin: ['https://example.com'], jwtSecret: 'test-jwt-secret', jwtExpiration: 3600 },
  loopsSo: { apiKey: 'test-loops-api-key' },
  captcha: {
    provider: 'recaptcha',
    siteKey: 'test-site-key',
    secret: 'test-recaptcha-secret',
    threshold: 0.5,
    branding: 'disclaimer',
  },
};
const LoopsMock = {
  upsertContact: jest.fn(),
  sendConfirmationMail: jest.fn(),
  findContact: jest.fn(),
  getMailingLists: jest.fn(),
  subscribeContact: jest.fn(),
  unsubscribeContact: jest.fn(),
};
jest.mock('../loops', () => ({
  Loops: jest.fn().mockImplementation(() => LoopsMock),
}));
jest.mock('../jwt');

describe('subscription', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribe', () => {
    const mockRequestBody = {
      email: 'test@example.com',
      captchaToken: 'captcha-token',
      mailingLists: ['list-1'],
      language: 'en',
      referer: 'https://example.com/page',
    } as SubscribeRequest;

    const createMockRequest = (body: SubscribeRequest = mockRequestBody) => ({
      body,
      protocol: 'https',
      hostname: 'example.com',
      ip: '192.168.1.1',
      get: jest.fn((header: string) => {
        if (header === 'host') return 'example.com';
        return undefined;
      }),
    } as any);

    it('should successfully subscribe new contact', async () => {
      (captcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      LoopsMock.upsertContact.mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: false,
        optInStatus: 'pending',
        mailingLists: { 'list-1': true },
      });
      (jwt.createToken as jest.Mock).mockReturnValue('jwt-token');

      const mockReq = createMockRequest();
      const result = await subscribe(mockConfig, mockReq);

      expect(result).toEqual({
        success: true,
        doubleOptIn: true,
        email: 'test@example.com',
      });
      expect(captcha.verifyCaptcha).toHaveBeenCalledWith(mockConfig.captcha, 'subscribe', 'captcha-token', '192.168.1.1');
      expect(LoopsMock.upsertContact).toHaveBeenCalled();
      expect(LoopsMock.sendConfirmationMail).toHaveBeenCalledWith('test@example.com', new URL('https://example.com/control-panel?token=jwt-token&lang=en'), 'en');
    });

    it('should throw HttpError when CAPTCHA verification fails', async () => {
      // Ensure the mock is set up correctly
      (captcha.verifyCaptcha as jest.Mock).mockResolvedValueOnce(false);

      const mockReq = createMockRequest();
      await expect(subscribe(mockConfig, mockReq)).rejects.toThrow();

      try {
        await subscribe(mockConfig, mockReq);
      } catch (error: any) {
        expect(error.message).toBe('Try again later');
        expect(error.statusCode).toBe(429);
        expect(error.details).toBe('Requestor categorized as bot');
      }

      // Verify verifyCaptcha was called
      expect(captcha.verifyCaptcha).toHaveBeenCalledWith(mockConfig.captcha, 'subscribe', 'captcha-token', '192.168.1.1');
    });

    it('should throw HttpError when contact has rejected optInStatus', async () => {
      (captcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      LoopsMock.upsertContact.mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: false,
        optInStatus: 'rejected',
        mailingLists: {},
      });

      const mockReq = createMockRequest();
      await expect(subscribe(mockConfig, mockReq)).rejects.toThrow(HttpError);
      try {
        await subscribe(mockConfig, mockReq);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(429);
      }
    });

    it('should not send email when contact is already subscribed to all requested lists', async () => {
      (captcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      LoopsMock.upsertContact.mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: { 'list-1': true },
      });

      const mockReq = createMockRequest();
      const result = await subscribe(mockConfig, mockReq);

      expect(result.success).toBe(true);
      expect(LoopsMock.sendConfirmationMail).not.toHaveBeenCalled();
    });

    it('should send email when contact is accepted but missing some mailing lists', async () => {
      (captcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      LoopsMock.upsertContact.mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: { 'list-1': true }, // Missing list-2
      });
      (jwt.createToken as jest.Mock).mockReturnValue('jwt-token');
      LoopsMock.sendConfirmationMail.mockResolvedValue(undefined);

      const mockReq = createMockRequest({
        ...mockRequestBody,
        mailingLists: ['list-1', 'list-2'],
      } as SubscribeRequest);

      const result = await subscribe(mockConfig, mockReq);

      expect(result.success).toBe(true);
      expect(LoopsMock.sendConfirmationMail).toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    it('should return subscription status for existing contact', async () => {
      const mockContact = {
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: { 'list-1': true },
        referer: 'https://example.com/page',
      };

      LoopsMock.findContact.mockResolvedValue(mockContact);
      LoopsMock.getMailingLists.mockResolvedValue([
        { id: 'list-1', name: 'Newsletter', description: 'Main newsletter', isPublic: true },
        { id: 'list-2', name: 'Updates', description: 'Updates', isPublic: true },
      ]);

      const result = await getSubscription(mockConfig, 'test@example.com');

      expect(result).toEqual({
        success: true,
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: [
          { id: 'list-1', name: 'Newsletter', description: 'Main newsletter', isPublic: true, subscribed: true },
          { id: 'list-2', name: 'Updates', description: 'Updates', isPublic: true, subscribed: false },
        ],
        referer: 'https://example.com/page',
      });
    });

    it('should throw HttpError when contact is not found', async () => {
      LoopsMock.findContact.mockResolvedValue(null);

      await expect(getSubscription(mockConfig, 'nonexistent@example.com')).rejects.toThrow(HttpError);
      try {
        await getSubscription(mockConfig, 'nonexistent@example.com');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(404);
        expect((error as HttpError).message).toBe('Contact not found');
      }
    });
  });

  describe('updateSubscription', () => {
    it('should subscribe contact when subscribe is true', async () => {
      LoopsMock.subscribeContact.mockResolvedValue(undefined);

      const result = await updateSubscription(mockConfig, {
        email: 'test@example.com',
        subscribe: true,
        mailingLists: { 'list-1': true },
      });

      expect(result).toEqual({
        success: true,
        email: 'test@example.com',
        subscribed: true,
      });
      expect(LoopsMock.subscribeContact).toHaveBeenCalledWith('test@example.com', { 'list-1': true });
    });

    it('should unsubscribe contact when subscribe is false', async () => {
      LoopsMock.unsubscribeContact.mockResolvedValue(undefined);

      const result = await updateSubscription(mockConfig, {
        email: 'test@example.com',
        subscribe: false,
      });

      expect(result).toEqual({
        success: true,
        email: 'test@example.com',
        subscribed: false,
      });
      expect(LoopsMock.unsubscribeContact).toHaveBeenCalledWith('test@example.com');
    });
  });
});

