
import { sign, verify, JwtPayload, Algorithm, JsonWebTokenError, TokenExpiredError, NotBeforeError, SignOptions} from 'jsonwebtoken';
import { HttpError } from './error';
import { Request } from 'express';
import type { ServerConfiguration } from './config';

const ALGORITHM : Algorithm = 'HS512'; // HMAC with SHA-512 hash

export type Role = 'subscriber' | 'admin';

export type AuthenticationOptions = {
  role?: Role;
  acceptExpired?: boolean;
}

/***
 * Create Json Web Token to authorize future requests.
 *
 * @param email  User's email address
 * @see https://datatracker.ietf.org/doc/html/rfc7519
 */
export function createToken(config: ServerConfiguration, email: string, issuer: URL): string
{
  const options : SignOptions = {
      subject: email,
      issuer: issuer.hostname,
      algorithm: ALGORITHM,
      expiresIn: config.jwtExpiration,
  };
  console.debug('createToken', options);

  return sign ({}, config.jwtSecret, options);
}

export function authenticate(config: ServerConfiguration, req: Request, options?: AuthenticationOptions): string {
  const token = req.headers.authorization?.match(/Bearer ([^ ]+)/);
  if (!token)
    throw new HttpError({statusCode: 401, reason: 'missing-token', message: 'Unauthorized'});
  // @todo WWW-Authenticate header?
  // https://datatracker.ietf.org/doc/html/rfc6750#section-3

  return validateToken(config, token[1], req.hostname, options);
}

/**
 * Verify token signature.
 *
 * Throws 401 Unauthorized if verification fails.
 * @return User's email address
 */
export function validateToken(config: ServerConfiguration, jwt: string, issuer: string, options?: AuthenticationOptions): string
{
  // @todo add way rotate the server secret
  let payload: JwtPayload;

  try {
    console.debug('validateToken', jwt);
    payload = verify(jwt, config.jwtSecret, {
      algorithms: [ALGORITHM],
      complete: false,
      issuer,
      ignoreExpiration: options?.acceptExpired ?? false,
    }) as JwtPayload;
  } catch(error) {
    if (error instanceof TokenExpiredError) {
      throw new HttpError({
        statusCode: 401,
        message: 'Unauthorized',
        reason: 'expired-token',
        details: error.message,
      });
    } else if (error instanceof JsonWebTokenError || error instanceof NotBeforeError) {
      throw new HttpError({
        statusCode: 401,
        message: 'Unauthorized',
        reason: 'invalid-token',
        details: error.message,
      });
    } else {
      throw error;
    }
  }

  const roles = payload.roles ?? ['subscriber'];

  if (options?.role !== undefined && !roles.includes(options.role)) {
    throw new HttpError({
      statusCode: 403,
      reason: 'access-denied',
      message: 'Forbidden',
      details: `User does not have required role ${options.role}`,
    });
  }

  if (payload.sub === undefined) {
    throw new HttpError({
      statusCode: 401,
      reason: 'missing-subject',
      message: 'Unauthorized',
      details: 'Missing token subject'
    });
  }

  return payload.sub;
}