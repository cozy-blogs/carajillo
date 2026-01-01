// Mock node-fetch before any imports that use it
jest.mock('node-fetch', () => {
  return jest.fn();
});

import { subscribe, getSubscription, updateSubscription, SubscribeRequest } from '../subscription';
import { HttpError } from '../error';
import * as recaptcha from '../recaptcha';
import * as loops from '../loops';
import * as jwt from '../jwt';

jest.mock('../recaptcha');
jest.mock('../loops');
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
      get: jest.fn((header: string) => {
        if (header === 'host') return 'example.com';
        return undefined;
      }),
    } as any);

    it('should successfully subscribe new contact', async () => {
      (recaptcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      (loops.upsertContact as jest.Mock).mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: false,
        optInStatus: 'pending',
        mailingLists: { 'list-1': true },
      });
      (jwt.createToken as jest.Mock).mockReturnValue('jwt-token');
      (loops.sendConfirmationMail as jest.Mock).mockResolvedValue(undefined);

      const mockReq = createMockRequest();
      const result = await subscribe(mockReq);

      expect(result).toEqual({
        success: true,
        doubleOptIn: true,
        email: 'test@example.com',
      });
      expect(recaptcha.verifyCaptcha).toHaveBeenCalledWith('subscribe', 'captcha-token');
      expect(loops.upsertContact).toHaveBeenCalled();
      expect(loops.sendConfirmationMail).toHaveBeenCalledWith('test@example.com', new URL('https://example.com/control-panel?token=jwt-token&lang=en'), 'en');
    });

    it('should throw HttpError when CAPTCHA verification fails', async () => {
      // Ensure the mock is set up correctly
      (recaptcha.verifyCaptcha as jest.Mock).mockResolvedValueOnce(false);

      const mockReq = createMockRequest();
      await expect(subscribe(mockReq)).rejects.toThrow();
      
      try {
        await subscribe(mockReq);
      } catch (error: any) {
        expect(error.message).toBe('Try again later');
        expect(error.statusCode).toBe(429);
        expect(error.details).toBe('Requestor categorized as bot');
      }
      
      // Verify verifyCaptcha was called
      expect(recaptcha.verifyCaptcha).toHaveBeenCalledWith('subscribe', 'captcha-token');
    });

    it('should throw HttpError when contact has rejected optInStatus', async () => {
      (recaptcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      (loops.upsertContact as jest.Mock).mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: false,
        optInStatus: 'rejected',
        mailingLists: {},
      });

      const mockReq = createMockRequest();
      await expect(subscribe(mockReq)).rejects.toThrow(HttpError);
      try {
        await subscribe(mockReq);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(429);
      }
    });

    it('should not send email when contact is already subscribed to all requested lists', async () => {
      (recaptcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      (loops.upsertContact as jest.Mock).mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: { 'list-1': true },
      });

      const mockReq = createMockRequest();
      const result = await subscribe(mockReq);

      expect(result.success).toBe(true);
      expect(loops.sendConfirmationMail).not.toHaveBeenCalled();
    });

    it('should send email when contact is accepted but missing some mailing lists', async () => {
      (recaptcha.verifyCaptcha as jest.Mock).mockResolvedValue(true);
      (loops.upsertContact as jest.Mock).mockResolvedValue({
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        optInStatus: 'accepted',
        mailingLists: { 'list-1': true }, // Missing list-2
      });
      (jwt.createToken as jest.Mock).mockReturnValue('jwt-token');
      (loops.sendConfirmationMail as jest.Mock).mockResolvedValue(undefined);

      const mockReq = createMockRequest({
        ...mockRequestBody,
        mailingLists: ['list-1', 'list-2'],
      } as SubscribeRequest);

      const result = await subscribe(mockReq);

      expect(result.success).toBe(true);
      expect(loops.sendConfirmationMail).toHaveBeenCalled();
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

      (loops.findContact as jest.Mock).mockResolvedValue(mockContact);
      (loops.getMailingLists as jest.Mock).mockResolvedValue([
        { id: 'list-1', name: 'Newsletter', description: 'Main newsletter', isPublic: true },
        { id: 'list-2', name: 'Updates', description: 'Updates', isPublic: true },
      ]);

      const result = await getSubscription('test@example.com');

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
      (loops.findContact as jest.Mock).mockResolvedValue(null);

      await expect(getSubscription('nonexistent@example.com')).rejects.toThrow(HttpError);
      try {
        await getSubscription('nonexistent@example.com');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(404);
        expect((error as HttpError).message).toBe('Contact not found');
      }
    });
  });

  describe('updateSubscription', () => {
    it('should subscribe contact when subscribe is true', async () => {
      (loops.subscribeContact as jest.Mock).mockResolvedValue(undefined);

      const result = await updateSubscription({
        email: 'test@example.com',
        subscribe: true,
        mailingLists: { 'list-1': true },
      });

      expect(result).toEqual({
        success: true,
        email: 'test@example.com',
        subscribed: true,
      });
      expect(loops.subscribeContact).toHaveBeenCalledWith('test@example.com', { 'list-1': true });
    });

    it('should unsubscribe contact when subscribe is false', async () => {
      (loops.unsubscribeContact as jest.Mock).mockResolvedValue(undefined);

      const result = await updateSubscription({
        email: 'test@example.com',
        subscribe: false,
      });

      expect(result).toEqual({
        success: true,
        email: 'test@example.com',
        subscribed: false,
      });
      expect(loops.unsubscribeContact).toHaveBeenCalledWith('test@example.com');
    });
  });
});

