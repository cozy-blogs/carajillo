import fetch from 'node-fetch';
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

/**
 * Perform the backend site of reCAPTCHA token verification.
 * https://developers.google.com/recaptcha/docs/v3#site_verify_response
 * @param token  reCAPTCHA token
 * @return score in range from 0 (bot) to 1 (human)
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
    console.error(`reCAPTCHA error: ${data}`);
    throw new HttpError(400, "reCAPTCHA validatation failed");
  }
}
