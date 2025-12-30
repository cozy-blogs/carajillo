import { HttpError, middleware } from '../error';
import { Request, Response, NextFunction } from 'express';

describe('HttpError', () => {
  it('should create an HttpError with all properties', () => {
    const error = new HttpError({
      statusCode: 400,
      message: 'Bad Request',
      reason: 'validation-error',
      details: 'Missing required field',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad Request');
    expect(error.reason).toBe('validation-error');
    expect(error.details).toBe('Missing required field');
    expect(error.name).toBe('HttpError');
  });

  it('should create an HttpError with minimal properties', () => {
    const error = new HttpError({
      statusCode: 500,
      message: 'Internal Server Error',
    });

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Internal Server Error');
    expect(error.reason).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('should respond with correct JSON format', () => {
    const error = new HttpError({
      statusCode: 401,
      message: 'Unauthorized',
      reason: 'invalid-token',
      details: 'Token expired',
    });

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    error.respond(mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized',
      reason: 'invalid-token',
    });
  });

  it('should respond without reason when not provided', () => {
    const error = new HttpError({
      statusCode: 500,
      message: 'Internal Server Error',
    });

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    error.respond(mockResponse);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal Server Error',
      reason: undefined,
    });
  });
});

describe('error middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRequest = {};
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  it('should handle HttpError instances', () => {
    const error = new HttpError({
      statusCode: 404,
      message: 'Not Found',
      reason: 'not-found',
    });

    middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Not Found',
      reason: 'not-found',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle generic Error instances', () => {
    const error = new Error('Generic error message');

    middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Generic error message',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle non-Error objects', () => {
    const error = { message: 'String error' };

    middleware(error as unknown as Error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Unknown error occurred',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });
});

