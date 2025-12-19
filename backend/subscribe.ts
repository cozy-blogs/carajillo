import { HttpError } from './http';
import { validate as recaptchaValidate } from './recaptcha';
import { upsertContact, sendConfirmationMail } from './loops';
import { createToken } from './jwt';

const rootUrl = process.env.URL;

interface SubscribeRequest {
  email : string;
  language?: string;
  captcha_token: string;
  mailing_lists: string[];
};

export async function subscribe(request: SubscribeRequest) {
  if (typeof request.email !== "string")
    throw new HttpError({statusCode: 400, message: "Missing email"});
  if (typeof request.captcha_token !== "string")
    throw new HttpError({statusCode: 400, message: "Missing CAPTCHA token"});

  if (request.mailing_lists === undefined) {
    request.mailing_lists = [];
  }
  if (!Array.isArray(request.mailing_lists)) {
    throw new HttpError({statusCode: 400, message: "Malformed request"});
  }
  if (!request.mailing_lists.every((id) => typeof id === 'string')) {
    throw new HttpError({statusCode: 400, message: "Malformed request"});
  }

  const {email, mailing_lists, captcha_token, ...properties} = request;

  const valid = captcha('subscribe', captcha_token);
  if (!valid) {
    throw new HttpError({statusCode: 429, message: 'Try again later'});
  }

  const contact = await upsertContact(email, properties, mailing_lists);
  if (contact.subscribed) {
    console.warn(`contact already subscribed: ${contact.email}`);
    /// @todo check mailing lists
    return {success: true, contact};
  }

  const token = createToken(contact.email);
  await sendConfirmationMail(contact.email, `${rootUrl}/subscribe?token=${token}`, properties.language);
  return {success: true};
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
