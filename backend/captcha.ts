import fetch from 'node-fetch';
import { HttpError } from './error';

const PROVIDER: Provider = (process.env.CAPTCHA_PROVIDER || 'recaptcha') as Provider;
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';
const HCAPTCHA_SITE_KEY = process.env.HCAPTCHA_SITE_KEY || '';
const SITE_KEY = PROVIDER === 'hcaptcha' ? HCAPTCHA_SITE_KEY : RECAPTCHA_SITE_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;
const SECRET = PROVIDER === 'hcaptcha' ? HCAPTCHA_SECRET : RECAPTCHA_SECRET;
const THRESHOLD = Number.parseFloat(process.env.CAPTCHA_THRESHOLD || '0.5');

export type Provider = 'recaptcha' | 'hcaptcha' | 'none';

export interface CaptchaConfiguration {
  success: true;
  /** Active CAPTCHA provider. */
  provider: Provider;
  /** Site key used by the frontend widget. */
  site_key: string;
}

export function configuration(): CaptchaConfiguration {
  return { success: true, provider: PROVIDER, site_key: SITE_KEY };
}

interface CaptchaProvider {
  (action: string, token?: string, remoteIp?: string): Promise<boolean>;
}
export const verifyCaptcha = getCaptchaProvider(PROVIDER);

function getCaptchaProvider(provider: Provider): CaptchaProvider {
  switch (provider) {
    case 'recaptcha':
    case 'hcaptcha':
      return verifyCaptchaToken.bind(null, provider);
    case 'none':
      return async () => true;
    default:
      throw new Error(`unsupported CAPTCHA provider: ${provider}`);
  }
}

/**
 * CAPTCHA response from reCAPTCHA or hCaptcha.
 */
interface CaptchaResponse {
  success: boolean;

  /**
   * reCAPTCHA human score (0.0 bot to 1.0 human) or hCaptcha enterprise risk score (0.0 human to 1.0 bot).
   */
  score?: number;

  /**
   * String representing action guarded by CAPTCHA.
   */
  action: string;
  /**
   * Timestamp of the CAPTCHA challenge.
   */
  challenge_ts: string;
  /**
   * Hostname of the site where the CAPTCHA was solved.
   */
  hostname: string;

  /**
   * List of error codes returned by the CAPTCHA provider.
   * 
   * ReCAPTCHA or hCaptcha common error codes:
   * missing-input-secret     - The secret parameter is missing.
   * invalid-input-secret     - The secret parameter is invalid or malformed.
   * missing-input-response   - The response parameter is missing.
   * invalid-input-response   - The response parameter is invalid or malformed.
   * bad-request              - The request is invalid or malformed.
   * 
   * ReCAPTCHA specific error codes:
   * timeout-or-duplicate     - The response is no longer valid: either is too old or has been used previously.
   * 
   * hCaptcha specific error codes:
   * expired-input-response   - The response parameter (verification token) is expired. (120s default)
   * already-seen-response    - The response parameter (verification token) was already verified once.
   * missing-remoteip         - The remoteip parameter is missing.
   * invalid-remoteip         - The remoteip parameter is not a valid IP address or blinded value.
   * not-using-dummy-passcode - You have used a testing sitekey but have not used its matching secret.
   * sitekey-secret-mismatch  - The sitekey is not registered with the provided secret.
   */
  'error-codes'?: string[];
}

interface HCaptchaResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}


/**
 * Perform the backend site of reCAPTCHA token verification.
 * https://developers.google.com/recaptcha/docs/v3#site_verify_response
 * @param action String representing action guarded by CAPTCHA
 * @param token  CAPTCHA token preseneted by User Agent
 * @returns true if user passed the test (score >= CAPTCHA_THRESHOLD)
 */
async function verifyCaptchaToken(provider: 'recaptcha' | 'hcaptcha', action: string, token?: string, remoteIp?: string): Promise<boolean> {
  if (!token) {
    throw new HttpError({
      statusCode: 400,
      message: 'Bad request',
      reason: 'missing-captcha-token',
      details: 'CAPTCHA token is required',
    });
  }

  const captcha = await sendVerificationRequest(provider, token, remoteIp);
  console.info(`CAPTCHA (reCAPTCHA): score=${captcha.score} action=${captcha.action} challenge_ts=${captcha.challenge_ts} hostname=${captcha.hostname}`);

  if (captcha['error-codes']) {
    handleErrorCodes('recaptcha', captcha['error-codes']);
  }

  if (provider === 'recaptcha' && captcha.action !== action) {
    console.error(`CAPTCHA action does not match: expected=${action} actual=${captcha.action}`);
    throw new HttpError({
      statusCode: 400,
      message: 'Bad request',
      reason: 'captcha-action-mismatch',
      details: "CAPTCHA error: action-mismatch"
    });
  }

  // @todo verify hostname, with list of CORS hosts

  if (captcha.score !== undefined && captcha.score < THRESHOLD) {
    console.warn(`CAPTCHA score below threshold ${captcha.score}`);
    return false;
  }

  return true;
}

/**
 * Handle CAPTCHA error codes.
 * 
 * @param provider CAPTCHA provider
 * @param errorCodes list of CAPTCHA error codes
 * 
 */
function handleErrorCodes(provider: Provider, errorCodes: string[]): never {
  console.error(`CAPTCHA error codes (${provider}): ${errorCodes.join(', ')}`);
  if (errorCodes.includes('invalid-input-response') || errorCodes.includes('missing-input-response')) {
    throw new HttpError({
      statusCode: 400,
      message: 'Bad request',
      reason: 'bad-captcha',
      details: `CAPTCHA error: ${errorCodes.join(', ')}`,
    });
  }
  if (errorCodes.includes('timeout-or-duplicate') || errorCodes.includes('expired-input-response')) {
    throw new HttpError({
      statusCode: 429,
      message: 'Try again',
      reason: 'captcha-timeout',
      details: `CAPTCHA error: ${errorCodes.join(', ')}`,
    });
  }
  throw new HttpError({
    statusCode: 500,
    message: 'Internal server error',
    details: `CAPTCHA error: ${errorCodes.join(', ')}`,
  });
}

/**
 * Calls CAPTCHA REST API for token site verification.
 * @param provider CAPTCHA provider
 * @param token  CAPTCHA token
 * @param remoteIp IP address of the requestor
 * @return CAPTCHA REST API response
 */
export async function sendVerificationRequest(provider: 'recaptcha' | 'hcaptcha', token: string, remoteIp?: string): Promise<CaptchaResponse> {
  if (!SECRET) {
    console.error(`${provider.toUpperCase()}_SECRET environment variable is not set`);
    throw new Error('Server configuration error');
  }
  let verifyUrl : string;
  switch (provider) {
    case 'recaptcha':
      verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
      break;
    case 'hcaptcha':
      verifyUrl = `https://api.hcaptcha.com/siteverify`;
      break;
  }

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
    throw new Error(`CAPTCHA API returned status ${response.status}`);
  }

  const data = (await response.json()) as CaptchaResponse;

  if (data.success) {
    return data;
  } else {
    console.error(`reCAPTCHA error: ${JSON.stringify(data)}`);
    throw new HttpError({
      statusCode: 500,
      message: 'Internal server error',
      details: `${provider} validation failed`,
    });
  }
}
