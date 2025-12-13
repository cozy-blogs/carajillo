import fetch from 'node-fetch';
import { netlify } from './netlify';
import { HttpError } from './http';

interface RecaptchaResponse {
  success: boolean;
  score: number;
  action: string;
  challenge_ts: string;
  hostname: string;
  'error-codes'?: string[];
}

const SITE_KEY = process.env.RECAPTCHA_SITE_KEY;
const SECRET = process.env.RECAPTCHA_SECRET;
const THRESHOLD = Number.parseFloat(process.env.CAPTCHA_THRESHOLD || '0.5');

export const handler = netlify({GET: getSiteKey});

async function getSiteKey() {
  if (!SITE_KEY) {
    console.error('RECAPTCHA_SITE_KEY environment variable is not set');
    throw new Error('Server configuration error');
  }
  return {success: true, recaptcha_site_key: SITE_KEY};
}

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
    console.error(`CAPTCHA error codes: ${captcha['error-codes']?.join(', ')}`);
    throw new HttpError(400, `CAPTCHA error: ${captcha['error-codes']?.join(', ')}`);
  }

  if(captcha.action !== action) {
    console.error(`CAPTION action does not match: expected=${action} actual=${captcha.action}`);
    throw new HttpError(400, "CAPTCHA error: action-mismatch");
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
    throw new HttpError(400, "reCAPTCHA validatation failed");
  }
}
