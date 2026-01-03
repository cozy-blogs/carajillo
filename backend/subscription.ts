import { Request } from 'express';
import { HttpError } from './error';
import { verifyCaptcha } from './recaptcha';
import { findContact, upsertContact, sendConfirmationMail, subscribeContact, unsubscribeContact, getMailingLists } from './loops';
import { createToken } from './jwt';

export type SubscribeRequest = {
  email : string;
  language?: string;
  captchaToken: string;
  mailingLists: string[];
  referer?: string;
} & Record<string, string>;

/**
 * First step of email subscrition.
 *
 * At this stage email is not confirmed to be valid.
 * It sends confirmation email (if it does not exist already)
 * and protects the entry with CAPTCHA mechanism.
 */
export async function subscribe(req: Request) {
  const request = req.body as SubscribeRequest;
  console.info(`subscribe: ${JSON.stringify(request)}`);
  
  const rootUrl = new URL(`${req.protocol}://${req.hostname}`);
  /// @todo make captcha_token optional

  const {email, mailingLists, captchaToken, ...properties} = request;
  /// @todo set default language from the Accept-Language header

  const valid = await verifyCaptcha('subscribe', captchaToken);
  if (!valid) {
    throw new HttpError({
      statusCode: 429,
      message: 'Try again later',
      details: 'Requestor categorized as bot'
    });
  }

  const contact = await upsertContact(email, properties, mailingLists);
  if (contact.optInStatus == 'rejected') {
    throw new HttpError({
      statusCode: 429,
      message: 'Try again later',
      details: `Contact rejected subscription before ${contact.email}`
    });
  } else if (contact.optInStatus == 'accepted') {
    console.info(`Contact already subscribed: ${contact.email}`);
    if (mailingLists.every((requestedMailingList) => contact.mailingLists[requestedMailingList]))
    {
      console.info('Already subscribed for all requested mailing lists - do not send email');
      return {success: true, doubleOptIn: true, email};
    }
  }

  const token = createToken(contact.email, rootUrl);
  const params = new URLSearchParams({token});
  if (properties.language !== undefined) {
    params.set('lang', properties.language)
  }
  await sendConfirmationMail(contact.email, new URL(`/control-panel?${params}`, rootUrl), properties.language);

  return {success: true, doubleOptIn: true, email};
}


export interface MailingList {
    /**
     * The ID of the list.
     */
    id: string;

    /**
     * The name of the list.
     */
    name: string;

    /**
     * The list's description.
     */
    description: string | null;

    subscribed: boolean;
}

export interface SubscriptionStatus {
  success: true;
  email: string;
  subscribed: boolean;
  optInStatus: 'accepted' | 'rejected' | 'pending' | null;
  mailingLists: MailingList[];
  referer?: string;
}

export async function getSubscription(email: string): Promise<SubscriptionStatus> {
  const contact = await findContact(email);
  if (contact === null) {
    throw new HttpError({statusCode: 404, message: 'Contact not found'});
  }
  const availableMailingLists = await getMailingLists();
  return {
    success: true,
    email: contact.email,
    subscribed: contact.subscribed,
    optInStatus: contact.optInStatus,
    mailingLists: availableMailingLists.map((list) => ({
      subscribed: contact.mailingLists[list.id] || false,
      ...list
    })),
    referer: contact.referer
  };
}


export interface UpdateSubscriptionRequest {
  email: string;

  /**
   * Subscribes (true) or unsubscribes (false) contact.
   * @see https://loops.so/docs/contacts/properties#subscribed
   */
  subscribe: boolean;

  /**
   * Individual mailing list subscription.
   * @see https://loops.so/docs/contacts/mailing-lists
   */
  mailingLists?: Record<string, boolean>;
}

export async function updateSubscription({email, subscribe, mailingLists}: UpdateSubscriptionRequest) {
  if (subscribe) {
    await subscribeContact(email, mailingLists);   
  } else {
    await unsubscribeContact(email);
  }
  return {success: true, email, subscribed: subscribe};
}