
import { sign, verify, JwtPayload, Algorithm, JsonWebTokenError, TokenExpiredError, NotBeforeError, SignOptions} from 'jsonwebtoken';
import { HttpError } from './error';
import { StringValue as TimeDeltaString } from 'ms';
import { Request } from 'express';

const SECRET = process.env.JWT_SECRET;
// @todo refresh mechanizm is needed to really handle expiration
// @see https://www.npmjs.com/package/ms
const TOKEN_EXPIRATION : TimeDeltaString = process.env.JWT_EXPIRATION as TimeDeltaString || '1 year';
const ALGORITHM : Algorithm = 'HS512'; // HMAC with SHA-512 hash

/***
 * Create Json Web Token to authorize future requests.
 * 
 * @param email  User's email address
 * @see https://datatracker.ietf.org/doc/html/rfc7519
 */
export function createToken(email: string, issuer: string): string
{
  if (SECRET === undefined) {
    throw new HttpError({
      statusCode: 500,
      message: "Server configuration error",
      details: "JWT_SECRET not defined"
    });
  }

  const options : SignOptions = {
      subject: email,
      issuer: issuer,
      algorithm: ALGORITHM,
      expiresIn: TOKEN_EXPIRATION,
  };

  return sign ({}, SECRET, options);
}

export function authenticate(req: Request): string {
  // @todo https://www.npmjs.com/package/express-bearer-token?
  const token = req.headers.authorization?.match(/Bearer ([^ ]+)/);
  if (!token)
    throw new HttpError({statusCode: 401, message: 'Unauthorized'});
  // @todo WWW-Authenticate header?

  console.log(`token=${token}`);
  return validateToken(token[1], `${req.protocol}://${req.hostname}`);
}

/**
 * Verify token signature.
 * 
 * Throws 401 Unauthorized if verification fails.
 * @return User's email address
 */
export function validateToken(jwt: string, issuer: string): string
{
  if (SECRET === undefined) {
    throw new HttpError({
      statusCode: 500,
      message: "Server configuration error",
      details: "JWT_SECRET not defined"
    });
  }

  // @todo add way rotate the server secret and client token after expiration
  let payload: JwtPayload;
  
  try {
    console.log(`jwt: token=${jwt}`);
    payload = verify(jwt, SECRET, {
      algorithms: [ALGORITHM],
      complete: false,
      issuer
    }) as JwtPayload;
  } catch(error) {
    if (error instanceof TokenExpiredError) {
      throw new HttpError({
        statusCode: 401,
        message: 'Unauthorized',
        reason: 'expired-token',
        details: error.message,
      })
    } else if (error instanceof JsonWebTokenError || error instanceof NotBeforeError) {
      throw new HttpError({
        statusCode: 401,
        message: 'Unauthorized',
        reason: 'invalid-token',
        details: error.message,
      })
    } else {
      throw error;
    }
  }

  if (payload.sub === undefined) {
    throw new HttpError({statusCode: 401, message: 'Unathorized', details: 'Missing token subject'})
  }

  return payload.sub;
}