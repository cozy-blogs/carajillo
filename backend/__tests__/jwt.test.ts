import { createToken, authenticate, validateToken } from '../jwt';
import { Request } from 'express';
import { HttpError } from '../error';
import * as jwt from 'jsonwebtoken';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

describe('JWT', () => {
  const originalEnv = process.env;
  const testSecret = 'test-secret-key-for-jwt-signing';
  const testEmail = 'test@example.com';
  const testIssuer = 'example.com';

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = testSecret;
    process.env.JWT_EXPIRATION = '1 year';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('createToken', () => {
    it('should create a token with correct parameters', () => {
      const mockSign = jwt.sign as jest.Mock;
      mockSign.mockReturnValue('mock-token');

      const issuer = new URL('https://example.com');
      const token = createToken(testEmail, issuer);

      expect(mockSign).toHaveBeenCalledWith(
        {},
        testSecret,
        expect.objectContaining({
          subject: testEmail,
          issuer: issuer.hostname,
          algorithm: 'HS512',
          expiresIn: '1 year',
        })
      );
      expect(token).toBe('mock-token');
    });

    it('should throw HttpError when JWT_SECRET is not defined', async () => {
      // Note: This test verifies the error handling logic
      // In practice, JWT_SECRET is checked at module load time
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jest.resetModules();
      const jwtModule = await import('../jwt');
      const issuer = new URL('https://example.com');
      
      // The error should be thrown
      expect(() => jwtModule.createToken(testEmail, issuer)).toThrow();
      
      // Verify it's an error with the correct message
      try {
        jwtModule.createToken(testEmail, issuer);
      } catch (error: any) {
        expect(error.message).toContain('Server configuration error');
        expect(error.statusCode).toBe(500);
      }
      
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('validateToken', () => {
    it('should return email when token is valid', () => {
      const mockVerify = jwt.verify as jest.Mock;
      mockVerify.mockReturnValue({ sub: testEmail });

      const email = validateToken('valid-token', testIssuer);

      expect(mockVerify).toHaveBeenCalledWith(
        'valid-token',
        testSecret,
        expect.objectContaining({
          algorithms: ['HS512'],
          complete: false,
          issuer: testIssuer,
        })
      );
      expect(email).toBe(testEmail);
    });

    it('should throw HttpError when JWT_SECRET is not defined', async () => {
      // Note: Similar to createToken test - verify error handling logic
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jest.resetModules();
      const jwtModule = await import('../jwt');
      
      // The error should be thrown (validateToken is synchronous)
      expect(() => jwtModule.validateToken('token', testIssuer)).toThrow();
      
      // Verify it's an error with the correct message
      try {
        jwtModule.validateToken('token', testIssuer);
      } catch (error: any) {
        expect(error.message).toContain('Server configuration error');
        expect(error.statusCode).toBe(500);
      }
      
      process.env.JWT_SECRET = originalSecret;
    });

    it('should throw HttpError with expired-token reason when token is expired', () => {
      const mockVerify = jwt.verify as jest.Mock;
      const expiredError = new jwt.TokenExpiredError('Token expired', new Date());
      mockVerify.mockImplementation(() => {
        throw expiredError;
      });

      expect(() => validateToken('expired-token', testIssuer)).toThrow(HttpError);
      try {
        validateToken('expired-token', testIssuer);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(401);
        expect((error as HttpError).reason).toBe('expired-token');
      }
    });

    it('should throw HttpError with invalid-token reason when token is invalid', () => {
      const mockVerify = jwt.verify as jest.Mock;
      const invalidError = new jwt.JsonWebTokenError('Invalid token');
      mockVerify.mockImplementation(() => {
        throw invalidError;
      });

      expect(() => validateToken('invalid-token', testIssuer)).toThrow(HttpError);
      try {
        validateToken('invalid-token', testIssuer);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(401);
        expect((error as HttpError).reason).toBe('invalid-token');
      }
    });

    it('should throw HttpError when token subject is missing', () => {
      const mockVerify = jwt.verify as jest.Mock;
      mockVerify.mockReturnValue({}); // No 'sub' field

      expect(() => validateToken('token', testIssuer)).toThrow(HttpError);
      try {
        validateToken('token', testIssuer);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(401);
        expect((error as HttpError).reason).toBe('missing-subject');
      }
    });
  });

  describe('authenticate', () => {
    it('should extract and validate token from Authorization header', () => {
      const mockVerify = jwt.verify as jest.Mock;
      mockVerify.mockReturnValue({ sub: testEmail });

      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
        hostname: testIssuer,
      } as unknown as Request;

      const email = authenticate(mockRequest);

      expect(email).toBe(testEmail);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should throw HttpError when Authorization header is missing', () => {
      const mockRequest = {
        headers: {},
        hostname: testIssuer,
      } as unknown as Request;

      expect(() => authenticate(mockRequest)).toThrow(HttpError);
      try {
        authenticate(mockRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(401);
        expect((error as HttpError).reason).toBe('missing-token');
      }
    });

    it('should throw HttpError when Authorization header format is invalid', () => {
      const mockRequest = {
        headers: {
          authorization: 'InvalidFormat token',
        },
        hostname: testIssuer,
      } as unknown as Request;

      expect(() => authenticate(mockRequest)).toThrow(HttpError);
    });
  });
});

