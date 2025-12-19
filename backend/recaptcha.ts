import fetch from 'node-fetch';
import { HttpError } from './http';
import { error } from 'node:console';

interface RecaptchaResponse {
  success: boolean;
  score: number;
  action: string;
  challenge_ts: string;
  hostname: string;
  'error-codes'?: string[];
}

// const SITE_KEY = process.env.RECAPTCHA_SITE_KEY;
const SECRET = process.env.RECAPTCHA_SECRET;
const THRESHOLD = Number.parseFloat(process.env.CAPTCHA_THRESHOLD || '0.5');

/**
 * Perform the backend site of reCAPTCHA token verification.
 * https://developers.google.com/recaptcha/docs/v3#site_verify_response
 * @param action String representing action guarded by CAPTCHA
 * @param token  CAPTCHA token preseneted by User Agent
 * @returns true if user passed the test (score >= CAPTCHA_THRESHOLD)
 */
export async function validate(action: string, token: string): Promise<boolean> {
  const captcha = await verifyToken(token);
  console.log(`CAPTCHA: score=${captcha.score} action=${captcha.action} challenge_ts=${captcha.challenge_ts} hostname=${captcha.hostname}`);

  if (captcha['error-codes']) {
    // missing-input-secret   - The secret parameter is missing.
    // invalid-input-secret   - The secret parameter is invalid or malformed.
    // missing-input-response - The response parameter is missing.
    // invalid-input-response - The response parameter is invalid or malformed.
    // bad-request            - The request is invalid or malformed.
    // timeout-or-duplicate   - The response is no longer valid: either is too old or has been used previously.
    console.error(`CAPTCHA error codes: ${captcha['error-codes']?.join(', ')}`);
    const errorCodes :string[] = captcha['error-codes'];
    if (errorCodes.includes('invalid-input-response')) {
      throw new HttpError({
        statusCode: 400,
        reason: 'bad-captcha',
        message: 'Bad request',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`,
      });
    } else if (errorCodes.includes('timeout-or-duplicate')) {
      throw new HttpError({
        statusCode: 429,
        reason: 'captcha-timeout',
        message: 'Try again',
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
    console.error(`CAPTION action does not match: expected=${action} actual=${captcha.action}`);
    throw new HttpError({
      statusCode: 400,
      reason: 'captcha-action-mismatch',
      message: 'Bad reqeust',
      details: "CAPTCHA error: action-mismatch"
    });
  }

  if(captcha.score < THRESHOLD) {
    console.warn(`CAPTCHA score below threshold ${captcha.score}`);
    return false;
  }

  return true;
}

/**
 * Calls reCAPTCHA REST API for token site verification.
 * @param token  reCAPTCHA token
 * @return reCAPTCHA REST API resoponse
 */
export async function verifyToken(token: string): Promise<RecaptchaResponse> {
  if (!SECRET) {
    console.error('RECAPTCHA_SECRET environment variable is not set');
    throw new Error('Server configuration error');
  }

  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: `secret=${SECRET}&response=${token}`,
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
      details: "reCAPTCHA validatation failed",
    });
  }
}
