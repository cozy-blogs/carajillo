import { HttpError } from './http';
import { netlify } from './netlify';
import { verifyToken } from './recaptcha';

const CAPTCHA_THRESHOLD = 0.5;

interface SubscribeRequest {
  email : string;
  captcha_token: string;
};

async function subscribe(request: SubscribeRequest) {
  if (typeof request.email !== "string")
    throw new HttpError(400, "Missing email");
  if (typeof request.captcha_token !== "string")
    throw new HttpError(400, "Missing CAPTCHA token");

  const captcha = await verifyToken(request.captcha_token);
  console.log(`CAPTCHA: score=${captcha.score} action=${captcha.action} challenge_ts=${captcha.challenge_ts} hostname=${captcha.hostname}`);
  if (captcha['error-codes']) {
    console.error(`CAPTCHA error codes: ${captcha['error-codes']?.join(', ')}`);
  }

  if(captcha.action !== "subscribe")
    throw new HttpError(400, "CAPTCHA error");

  if(captcha.score < CAPTCHA_THRESHOLD) {
    console.warn(`CAPTCHA score below threshold ${captcha.score}`);
  }

  return {success: true, req: request};
}

export const handler = netlify({POST: subscribe});