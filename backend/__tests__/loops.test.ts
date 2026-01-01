// Create a shared mock instance that we can access in tests
const mockLoopsClientInstance = {
  findContact: jest.fn(),
  createContact: jest.fn(),
  updateContact: jest.fn(),
  getMailingLists: jest.fn(),
  getCustomProperties: jest.fn(),
  createContactProperty: jest.fn(),
  getTransactionalEmails: jest.fn(),
  sendTransactionalEmail: jest.fn(),
};

// Mock loops before importing the module that uses it
jest.mock('loops', () => {
  return {
    LoopsClient: jest.fn().mockImplementation(() => mockLoopsClientInstance),
  };
});

import {
  findContact,
  upsertContact,
  subscribeContact,
  unsubscribeContact,
  sendConfirmationMail,
  getMailingLists,
  initialize,
} from '../loops';

describe('loops', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOOPS_SO_SECRET = 'test-api-key';
    process.env.COMPANY_NAME = 'Test Company';
    process.env.COMPANY_ADDRESS = '123 Test St';
    process.env.COMPANY_LOGO = 'https://example.com/logo.png';

    // Clear all mocks
    Object.values(mockLoopsClientInstance).forEach(mockFn => {
      if (jest.isMockFunction(mockFn)) {
        mockFn.mockClear();
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('findContact', () => {
    it('should return null when contact is not found', async () => {
      mockLoopsClientInstance.findContact.mockResolvedValue([]);

      const result = await findContact('test@example.com');

      expect(result).toBeNull();
      expect(mockLoopsClientInstance.findContact).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('should return contact with custom optInStatus when found', async () => {
      const mockContact = {
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        mailingLists: { 'list-1': true },
        optInStatus: 'accepted',
        xOptInStatus: 'accepted', // Settled custom status
      };

      mockLoopsClientInstance.findContact.mockResolvedValue([mockContact] as any);

      const result = await findContact('test@example.com');

      expect(result).toEqual({
        ...mockContact,
        optInStatus: 'accepted', // Custom status takes precedence when settled
      });
    });

    it('should use built-in optInStatus when custom is not settled', async () => {
      const mockContact = {
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        mailingLists: { 'list-1': true },
        optInStatus: 'accepted',
        xOptInStatus: null,
      };

      mockLoopsClientInstance.findContact.mockResolvedValue([mockContact] as any);

      const result = await findContact('test@example.com');

      expect(result?.optInStatus).toBe('accepted');
    });
  });

  describe('upsertContact', () => {
    it('should create new contact when not found', async () => {
      mockLoopsClientInstance.findContact.mockResolvedValue([]);
      mockLoopsClientInstance.getMailingLists.mockResolvedValue([
        { id: 'list-1', name: 'Newsletter', isPublic: true },
      ] as any);
      mockLoopsClientInstance.createContact.mockResolvedValue({ id: 'new-contact-123' } as any);

      const result = await upsertContact('new@example.com', { firstName: 'John' }, ['list-1']);

      expect(result.email).toBe('new@example.com');
      expect(result.optInStatus).toBe('pending');
      expect(result.subscribed).toBe(false);
      expect(mockLoopsClientInstance.createContact).toHaveBeenCalledWith({
        email: 'new@example.com',
        properties: {
          subscribed: false,
          xOptInStatus: 'pending',
          firstName: 'John',
        },
        mailingLists: { 'list-1': true },
      });
    });

    it('should use all public mailing lists when none specified', async () => {
      mockLoopsClientInstance.findContact.mockResolvedValue([]);
      mockLoopsClientInstance.getMailingLists.mockResolvedValue([
        { id: 'list-1', name: 'Newsletter', isPublic: true },
        { id: 'list-2', name: 'Updates', isPublic: true },
      ] as any);
      mockLoopsClientInstance.createContact.mockResolvedValue({ id: 'new-contact-123' } as any);

      const result = await upsertContact('new@example.com', {});

      expect(mockLoopsClientInstance.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          mailingLists: { 'list-1': true, 'list-2': true },
        })
      );
    });

    it('should return existing contact when found', async () => {
      const mockContact = {
        id: 'contact-123',
        email: 'existing@example.com',
        subscribed: true,
        mailingLists: { 'list-1': true },
        optInStatus: 'accepted',
        xOptInStatus: 'accepted',
      };

      mockLoopsClientInstance.findContact.mockResolvedValue([mockContact] as any);

      const result = await upsertContact('existing@example.com', { firstName: 'Jane' });

      expect(result).toEqual({
        ...mockContact,
        optInStatus: 'accepted',
      });
      expect(mockLoopsClientInstance.createContact).not.toHaveBeenCalled();
    });
  });

  describe('subscribeContact', () => {
    it('should update contact to subscribed with accepted optInStatus', async () => {
      await subscribeContact('test@example.com', { 'list-1': true });

      expect(mockLoopsClientInstance.updateContact).toHaveBeenCalledWith({
        email: 'test@example.com',
        properties: {
          subscribed: true,
          xOptInStatus: 'accepted',
        },
        mailingLists: { 'list-1': true },
      });
    });

    it('should update contact without mailing lists when not provided', async () => {
      await subscribeContact('test@example.com');

      expect(mockLoopsClientInstance.updateContact).toHaveBeenCalledWith({
        email: 'test@example.com',
        properties: {
          subscribed: true,
          xOptInStatus: 'accepted',
        },
        mailingLists: undefined,
      });
    });
  });

  describe('unsubscribeContact', () => {
    it('should update contact to unsubscribed with rejected optInStatus', async () => {
      await unsubscribeContact('test@example.com');

      expect(mockLoopsClientInstance.updateContact).toHaveBeenCalledWith({
        email: 'test@example.com',
        properties: {
          subscribed: false,
          xOptInStatus: 'rejected',
        },
      });
    });
  });

  describe('getMailingLists', () => {
    it('should return only public mailing lists', async () => {
      const mockLists = [
        { id: 'list-1', name: 'Public List', isPublic: true },
        { id: 'list-2', name: 'Private List', isPublic: false },
        { id: 'list-3', name: 'Another Public', isPublic: true },
      ];

      mockLoopsClientInstance.getMailingLists.mockResolvedValue(mockLists as any);

      const result = await getMailingLists();

      expect(result).toEqual([
        { id: 'list-1', name: 'Public List', isPublic: true },
        { id: 'list-3', name: 'Another Public', isPublic: true },
      ]);
    });
  });

  describe('sendConfirmationMail', () => {
    it('should send confirmation email with correct data variables', async () => {
      const mockTransactionalEmails = [
        {
          id: 'email-123',
          name: 'Double Opt-In #EN',
          dataVariables: ['xOptInUrl', 'companyName', 'companyAddress', 'companyLogo'],
        },
      ];

      // Mock the paginated response structure - unpaginate calls it until nextCursor is null
      mockLoopsClientInstance.getTransactionalEmails.mockResolvedValue({
        data: mockTransactionalEmails,
        pagination: { nextCursor: null, nextPage: null },
      } as any);
      mockLoopsClientInstance.sendTransactionalEmail.mockResolvedValue(undefined as any);

      await sendConfirmationMail('test@example.com', new URL('https://example.com/confirm?token=abc'), 'en');

      expect(mockLoopsClientInstance.sendTransactionalEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        transactionalId: 'email-123',
        dataVariables: {
          companyName: 'Test Company',
          companyAddress: '123 Test St',
          companyLogo: 'https://example.com/logo.png',
          xOptInUrl: 'https://example.com/confirm?token=abc',
        },
      });
    });

    it('should find email by language code', async () => {
      const mockTransactionalEmails = [
        {
          id: 'email-123',
          name: 'Double Opt-In #EN',
          dataVariables: ['xOptInUrl'],
        },
        {
          id: 'email-456',
          name: 'Double Opt-In #PL',
          dataVariables: ['xOptInUrl'],
        },
      ];

      mockLoopsClientInstance.getTransactionalEmails.mockResolvedValue({
        data: mockTransactionalEmails,
        pagination: { nextCursor: null, nextPage: null },
      } as any);

      await sendConfirmationMail('test@example.com', new URL('https://example.com/confirm'), 'pl');

      expect(mockLoopsClientInstance.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionalId: 'email-456',
        })
      );
    });

    it('should throw error when no confirmation email is found', async () => {
      mockLoopsClientInstance.getTransactionalEmails.mockResolvedValue({
        data: [],
        pagination: { nextCursor: null, nextPage: null },
      } as any);

      await expect(
        sendConfirmationMail('test@example.com', new URL('https://example.com/confirm'), 'en')
      ).rejects.toThrow('No confirmation e-mail configured');
    });
  });

  describe('initialize', () => {
    it('should create custom properties if they do not exist', async () => {
      mockLoopsClientInstance.getCustomProperties.mockResolvedValue([] as any);
      mockLoopsClientInstance.createContactProperty.mockResolvedValue(undefined as any);

      await initialize();

      expect(mockLoopsClientInstance.createContactProperty).toHaveBeenCalledWith('language', 'string');
      expect(mockLoopsClientInstance.createContactProperty).toHaveBeenCalledWith('xOptInStatus', 'string');
    });

    it('should not create properties that already exist', async () => {
      mockLoopsClientInstance.getCustomProperties.mockResolvedValue([
        { key: 'language', type: 'string' },
        { key: 'xOptInStatus', type: 'string' },
      ] as any);

      await initialize();

      expect(mockLoopsClientInstance.createContactProperty).not.toHaveBeenCalled();
    });
  });
});

