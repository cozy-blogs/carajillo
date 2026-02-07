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

jest.mock('loops', () => {
  return {
    LoopsClient: jest.fn().mockImplementation(() => mockLoopsClientInstance),
  };
});

const mockLoopsConfig = {
  loopsSo: { apiKey: 'test-api-key' },
  company: {
    name: 'Test Company',
    address: '123 Test St',
    logo: 'https://example.com/logo.png',
  },
};

jest.mock('../config', () => {
  const actual = jest.requireActual('../config');
  return {
    ...actual,
    loadConfiguration: jest.fn(() => mockLoopsConfig),
  };
});

import { Loops } from '../loops';

describe('loops', () => {
  const loops = new Loops(mockLoopsConfig);

  beforeEach(() => {
    Object.values(mockLoopsClientInstance).forEach((mockFn) => {
      if (jest.isMockFunction(mockFn)) {
        mockFn.mockClear();
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findContact', () => {
    it('should return null when contact is not found', async () => {
      mockLoopsClientInstance.findContact.mockResolvedValue([]);

      const result = await loops.findContact('test@example.com');

      expect(result).toBeNull();
      expect(mockLoopsClientInstance.findContact).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    it('should return contact with custom optInStatus when found', async () => {
      const mockContact = {
        id: 'contact-123',
        email: 'test@example.com',
        subscribed: true,
        mailingLists: { 'list-1': true },
        optInStatus: 'accepted',
        xOptInStatus: 'accepted',
      };

      mockLoopsClientInstance.findContact.mockResolvedValue([mockContact] as any);

      const result = await loops.findContact('test@example.com');

      expect(result).toEqual({
        ...mockContact,
        optInStatus: 'accepted',
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

      const result = await loops.findContact('test@example.com');

      expect(result?.optInStatus).toBe('accepted');
    });
  });

  describe('upsertContact', () => {
    it('should create new contact when not found', async () => {
      mockLoopsClientInstance.findContact.mockResolvedValue([]);
      mockLoopsClientInstance.getMailingLists.mockResolvedValue([
        { id: 'list-1', name: 'Newsletter', isPublic: true },
      ] as any);
      mockLoopsClientInstance.createContact.mockResolvedValue({
        id: 'new-contact-123',
      } as any);

      const result = await loops.upsertContact(
        'new@example.com',
        { firstName: 'John' },
        ['list-1']
      );

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
      mockLoopsClientInstance.createContact.mockResolvedValue({
        id: 'new-contact-123',
      } as any);

      const result = await loops.upsertContact('new@example.com', {});

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

      const result = await loops.upsertContact('existing@example.com', {
        firstName: 'Jane',
      });

      expect(result).toEqual({
        ...mockContact,
        optInStatus: 'accepted',
      });
      expect(mockLoopsClientInstance.createContact).not.toHaveBeenCalled();
    });
  });

  describe('subscribeContact', () => {
    it('should update contact to subscribed with accepted optInStatus', async () => {
      await loops.subscribeContact('test@example.com', { 'list-1': true });

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
      await loops.subscribeContact('test@example.com');

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
      await loops.unsubscribeContact('test@example.com');

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

      const result = await loops.getMailingLists();

      expect(result).toEqual([
        { id: 'list-1', name: 'Public List', isPublic: true },
        { id: 'list-3', name: 'Another Public', isPublic: true },
      ]);
    });
  });

  describe('sendConfirmationMail', () => {
    it('should send confirmation email with company data from config', async () => {
      const mockTransactionalEmails = [
        {
          id: 'email-123',
          name: 'Double Opt-In #EN',
          dataVariables: ['xOptInUrl', 'companyName', 'companyAddress', 'companyLogo'],
        },
      ];

      mockLoopsClientInstance.getTransactionalEmails.mockResolvedValue({
        data: mockTransactionalEmails,
        pagination: { nextCursor: null, nextPage: null },
      } as any);
      mockLoopsClientInstance.sendTransactionalEmail.mockResolvedValue(
        undefined as any
      );

      await loops.sendConfirmationMail(
        'test@example.com',
        new URL('https://example.com/confirm?token=abc'),
        'en'
      );

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

      await loops.sendConfirmationMail(
        'test@example.com',
        new URL('https://example.com/confirm'),
        'pl'
      );

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
        loops.sendConfirmationMail(
          'test@example.com',
          new URL('https://example.com/confirm'),
          'en'
        )
      ).rejects.toThrow('No confirmation email configured');
    });

    it('should use company data from passed configuration', async () => {
      const customConfig = {
        loopsSo: { apiKey: 'other-key' },
        company: {
          name: 'Other Company',
          address: '456 Other St',
          logo: 'https://other.com/logo.png',
        },
      };
      const loopsWithCustomConfig = new Loops(customConfig);

      mockLoopsClientInstance.getTransactionalEmails.mockResolvedValue({
        data: [
          {
            id: 'email-789',
            name: 'Double Opt-In #EN',
            dataVariables: ['xOptInUrl'],
          },
        ],
        pagination: { nextCursor: null, nextPage: null },
      } as any);

      await loopsWithCustomConfig.sendConfirmationMail(
        'user@example.com',
        new URL('https://example.com/confirm')
      );

      expect(mockLoopsClientInstance.sendTransactionalEmail).toHaveBeenCalledWith({
        email: 'user@example.com',
        transactionalId: 'email-789',
        dataVariables: {
          companyName: 'Other Company',
          companyAddress: '456 Other St',
          companyLogo: 'https://other.com/logo.png',
          xOptInUrl: 'https://example.com/confirm',
        },
      });
    });
  });

  describe('initialize', () => {
    it('should create custom properties if they do not exist', async () => {
      mockLoopsClientInstance.getCustomProperties.mockResolvedValue([] as any);
      mockLoopsClientInstance.createContactProperty.mockResolvedValue(
        undefined as any
      );

      await loops.initialize();

      expect(mockLoopsClientInstance.createContactProperty).toHaveBeenCalledWith(
        'language',
        'string'
      );
      expect(mockLoopsClientInstance.createContactProperty).toHaveBeenCalledWith(
        'xOptInStatus',
        'string'
      );
    });

    it('should not create properties that already exist', async () => {
      mockLoopsClientInstance.getCustomProperties.mockResolvedValue([
        { key: 'language', type: 'string' },
        { key: 'xOptInStatus', type: 'string' },
      ] as any);

      await loops.initialize();

      expect(mockLoopsClientInstance.createContactProperty).not.toHaveBeenCalled();
    });
  });
});
