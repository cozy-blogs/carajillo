import { createToken, authenticate, validateToken } from '../jwt';
import { Request } from 'express';
import { HttpError } from '../error';
import * as jwt from 'jsonwebtoken';
import type { ServerConfiguration } from '../config';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

const testConfig: ServerConfiguration = {
  numberOfProxies: 1,
  corsOrigin: ['https://example.com'],
  jwtSecret: 'test-jwt-secret',
  jwtExpiration: 3600,
  environment: 'test',
};

describe('JWT', () => {
  const testEmail = 'test@example.com';
  const testIssuer = 'example.com';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createToken', () => {
    it('should create a token with correct parameters', () => {
      const mockSign = jwt.sign as jest.Mock;
      mockSign.mockReturnValue('mock-token');

      const issuer = new URL('https://example.com');
      const token = createToken(testConfig, testEmail, issuer);

      expect(mockSign).toHaveBeenCalledWith(
        {},
        testConfig.jwtSecret,
        expect.objectContaining({
          subject: testEmail,
          issuer: issuer.hostname,
          algorithm: 'HS512',
          expiresIn: testConfig.jwtExpiration,
        })
      );
      expect(token).toBe('mock-token');
    });
  });

  describe('validateToken', () => {
    it('should return email when token is valid', () => {
      const mockVerify = jwt.verify as jest.Mock;
      mockVerify.mockReturnValue({ sub: testEmail });

      const email = validateToken(testConfig, 'valid-token', testIssuer);

      expect(mockVerify).toHaveBeenCalledWith(
        'valid-token',
        testConfig.jwtSecret,
        expect.objectContaining({
          algorithms: ['HS512'],
          complete: false,
          issuer: testIssuer,
        })
      );
      expect(email).toBe(testEmail);
    });

    it('should throw HttpError with expired-token reason when token is expired', () => {
      const mockVerify = jwt.verify as jest.Mock;
      const expiredError = new jwt.TokenExpiredError('Token expired', new Date());
      mockVerify.mockImplementation(() => {
        throw expiredError;
      });

      expect(() => validateToken(testConfig, 'expired-token', testIssuer)).toThrow(HttpError);
      try {
        validateToken(testConfig, 'expired-token', testIssuer);
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

      expect(() => validateToken(testConfig, 'invalid-token', testIssuer)).toThrow(HttpError);
      try {
        validateToken(testConfig, 'invalid-token', testIssuer);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(401);
        expect((error as HttpError).reason).toBe('invalid-token');
      }
    });

    it('should throw HttpError when token subject is missing', () => {
      const mockVerify = jwt.verify as jest.Mock;
      mockVerify.mockReturnValue({}); // No 'sub' field

      expect(() => validateToken(testConfig, 'token', testIssuer)).toThrow(HttpError);
      try {
        validateToken(testConfig, 'token', testIssuer);
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

      const email = authenticate(testConfig, mockRequest);

      expect(email).toBe(testEmail);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should throw HttpError when Authorization header is missing', () => {
      const mockRequest = {
        headers: {},
        hostname: testIssuer,
      } as unknown as Request;

      expect(() => authenticate(testConfig, mockRequest)).toThrow(HttpError);
      try {
        authenticate(testConfig, mockRequest);
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

      expect(() => authenticate(testConfig, mockRequest)).toThrow(HttpError);
    });
  });
});

