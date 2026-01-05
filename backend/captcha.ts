import fetch from 'node-fetch';
import { HttpError } from './error';

const PROVIDER : Provider = (process.env.CAPTCHA_PROVIDER || 'recaptcha') as Provider;
const SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';
const SECRET = process.env.RECAPTCHA_SECRET;
const THRESHOLD = Number.parseFloat(process.env.CAPTCHA_THRESHOLD || '0.5');

export type Provider = 'recaptcha' | 'hcaptcha' | 'none';

export interface CaptchaConfiguration {
  success: true;
  provider: Provider;
  site_key: string;
}

export function configuration() : CaptchaConfiguration {
  return {success: true, provider: PROVIDER, site_key: SITE_KEY};
}

interface CaptchaProvider {
  (action: string, token?: string, remoteIp?: string): Promise<boolean>;
}
export const verifyCaptcha = getCaptchaProvider(PROVIDER);

function getCaptchaProvider(provider: Provider): CaptchaProvider {
  switch (provider) {
    case 'recaptcha':
      return verifyRecaptchaToken;
    case 'none':
      return async (action: string, token?: string, remoteIp?: string) => { return true; };
    default:
      throw new Error(`unsupported CAPTCHA provider: ${provider}`);
  }
}

interface RecaptchaResponse {
  success: boolean;
  score: number;
  action: string;
  challenge_ts: string;
  hostname: string;
  'error-codes'?: string[];
}


/**
 * Perform the backend site of reCAPTCHA token verification.
 * https://developers.google.com/recaptcha/docs/v3#site_verify_response
 * @param action String representing action guarded by CAPTCHA
 * @param token  CAPTCHA token preseneted by User Agent
 * @returns true if user passed the test (score >= CAPTCHA_THRESHOLD)
 */
async function verifyRecaptchaToken(action: string, token?: string, remoteIp?: string): Promise<boolean> {
  if (!token) {
    throw new HttpError({
      statusCode: 400,
      message: 'Bad request',
      reason: 'missing-captcha-token',
      details: 'CAPTCHA token is required',
    });
  }

  const captcha = await sendVerificationRequest(token, remoteIp);
  console.info(`CAPTCHA: score=${captcha.score} action=${captcha.action} challenge_ts=${captcha.challenge_ts} hostname=${captcha.hostname}`);

  if (captcha['error-codes']) {
    // ReCAPTCHA or hCaptcha common error codes:
    // missing-input-secret   - The secret parameter is missing.
    // invalid-input-secret   - The secret parameter is invalid or malformed.
    // missing-input-response - The response parameter is missing.
    // invalid-input-response - The response parameter is invalid or malformed.
    // bad-request            - The request is invalid or malformed.

    // ReCAPTCHA specific error codes:
    // timeout-or-duplicate   - The response is no longer valid: either is too old or has been used previously.

    // hCaptcha specific error codes:
    // expired-input-response   - The response parameter (verification token) is expired. (120s default)
    // already-seen-response    - The response parameter (verification token) was already verified once.
    // missing-remoteip         - The remoteip parameter is missing.
    // invalid-remoteip         - The remoteip parameter is not a valid IP address or blinded value.
    // not-using-dummy-passcode - You have used a testing sitekey but have not used its matching secret.
    // sitekey-secret-mismatch  - The sitekey is not registered with the provided secret.
    console.error(`CAPTCHA error codes: ${captcha['error-codes']?.join(', ')}`);
    const errorCodes :string[] = captcha['error-codes'];
    if (errorCodes.includes('invalid-input-response')) {
      throw new HttpError({
        statusCode: 400,
        message: 'Bad request',
        reason: 'bad-captcha',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`,
      });
    } else if (errorCodes.includes('timeout-or-duplicate')) {
      throw new HttpError({
        statusCode: 429,
        message: 'Try again',
        reason: 'captcha-timeout',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`,
      });
    } else {
      throw new HttpError({
        statusCode: 500,
        message: 'Internal server error',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`
      });
    }
  }

  if(captcha.action !== action) {
    console.error(`CAPTCHA action does not match: expected=${action} actual=${captcha.action}`);
    throw new HttpError({
      statusCode: 400,
      message: 'Bad request',
      reason: 'captcha-action-mismatch',
      details: "CAPTCHA error: action-mismatch"
    });
  }

  // @todo verify hostname, with list of CORS hosts 

  if(captcha.score < THRESHOLD) {
    console.warn(`CAPTCHA score below threshold ${captcha.score}`);
    return false;
  }

  return true;
}

/**
 * Calls reCAPTCHA REST API for token site verification.
 * @param token  reCAPTCHA token
 * @return reCAPTCHA REST API response
 */
export async function sendVerificationRequest(token: string, remoteIp?: string): Promise<RecaptchaResponse> {
  if (!SECRET) {
    console.error('RECAPTCHA_SECRET environment variable is not set');
    throw new Error('Server configuration error');
  }

  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
  const body = new URLSearchParams({
    secret: SECRET,
    response: token,
  });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }
  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`reCAPTCHA API returned status ${response.status}`);
  }

  const data = (await response.json()) as RecaptchaResponse;

  if (data.success) {
    return data;
  } else {
    console.error(`reCAPTCHA error: ${JSON.stringify(data)}`);
    throw new HttpError({
      statusCode: 500,
      message: 'Internal server error',
      details: "reCAPTCHA validation failed",
    });
  }
}
