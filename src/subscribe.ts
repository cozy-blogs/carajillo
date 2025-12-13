import { HttpError } from './http';
import { netlify } from './netlify';
import { validate as recaptchaValidate } from './recaptcha';


interface SubscribeRequest {
  email : string;
  captcha_token: string;
};

async function subscribe(request: SubscribeRequest) {
  if (typeof request.email !== "string")
    throw new HttpError(400, "Missing email");
  if (typeof request.captcha_token !== "string")
    throw new HttpError(400, "Missing CAPTCHA token");

  const valid = captcha('subscribe', request.captcha_token);
  if (!valid) {
    throw new HttpError(429, 'Try again later');
  }

  return {success: true, req: request};
}

interface CaptchaProvider {
  (action: string, token: string): Promise<boolean>;
}
const captcha = getCaptchaProvider(process.env.CAPTCHA_PROVIDER || 'recaptcha');

function getCaptchaProvider(provider: string): CaptchaProvider {
  switch (provider) {
    case 'recaptcha':
      return recaptchaValidate;
    case 'none':
      return async (action: string, token: string) => { return true; };
    default:
      throw new Error(`unsupported CAPTCHA provider: ${provider}`);
  }
}

export const handler = netlify({POST: subscribe});