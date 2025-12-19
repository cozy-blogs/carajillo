
import { sign, verify, Jwt, Algorithm, JsonWebTokenError, TokenExpiredError, NotBeforeError} from 'jsonwebtoken';
import { HttpError } from './http';

const SECRET = process.env.JWT_SECRET;
const ALGORITHM : Algorithm = 'HS512'; // HMAC with SHA-512 hash

/// Create Json Web Token
/// https://datatracker.ietf.org/doc/html/rfc7519
export function createToken(email: string): string
{
  if (SECRET === undefined)
    throw new HttpError({statusCode: 500, message: "Server configuration error", details: "JWT_SECRET not defined"});
  return sign ({}, SECRET,
    {
      subject: email,
      // @todo
      // issuer: newsletter address
      // audience: server domain
      algorithm: ALGORITHM,
      expiresIn: '7 days',
    }
  );
}

/// Verifies token signature.
//  Throws 401 Unauthorized if verification fails.
/// @return User's email address
export function validateToken(jwt: string): string
{
  if (SECRET === undefined)
    throw new HttpError({statusCode: 500, message: "Server configuration error", details: "JWT_SECRET not defined"});

  // @todo how to rotate the secret?
  let decoded: Jwt;
  
  try {
    decoded = verify(jwt, SECRET, {
      algorithms: [ALGORITHM],
      complete: true,
      // @todo verify audience & issuer
    });
  } catch(error) {
    if (error instanceof TokenExpiredError) {
      throw new HttpError({
        statusCode: 401,
        reason: 'expired-token',
        message: 'Unauthorized',
        details: error.message,
      })
    } else if (error instanceof JsonWebTokenError || error instanceof NotBeforeError) {
      throw new HttpError({
        statusCode: 401,
        reason: 'invalid-token',
        message: 'Unauthorized',
        details: error.message,
      })
    } else {
      throw error;
    }
  }

  if (decoded.payload.sub === undefined) {
    throw new HttpError({statusCode: 401, message: 'Unathorized', details: 'Missing token subject'})
  }

  return decoded.payload['sub'];
}