import { HttpError } from './error';
import { verifyCaptcha } from './recaptcha';
import { findContact, upsertContact, sendConfirmationMail, subscribeContact, unsubscribeContact, getMailingLists } from './loops';
import { createToken } from './jwt';

// @todo this env is netlify specific
// https://docs.netlify.com/build/configure-builds/environment-variables/#deploy-urls-and-metadata
const rootUrl = process.env.URL;

export interface SubscribeRequest {
  email : string;
  language?: string;
  captcha_token: string;
  mailing_lists: string[];
  // @todo extra properties
};

/**
 * First step of e-mail subscrition.
 *
 * At this stage email is not confirmed to be valid.
 * It sends confirmation e-mail (if it does not exist already)
 * and protects the entry with CAPTCHA mechanism.
 */
export async function subscribe(request: SubscribeRequest) {
  console.info(`subscribe: ${JSON.stringify(request)}`);
  if (rootUrl === undefined) {
    throw new HttpError({statusCode: 500, message: "Internal Server error", details: 'missing URL env'});
  }
  if (typeof request.email !== "string")
    throw new HttpError({statusCode: 400, message: "Missing email"});
  /// @todo make captcha_token optional
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

  const valid = verifyCaptcha('subscribe', captcha_token);
  if (!valid) {
    throw new HttpError({
      statusCode: 429,
      message: 'Try again later',
      details: 'Requestor categorized as bot'
    });
  }

  const contact = await upsertContact(email, properties, mailing_lists);
  if (contact.optInStatus == 'rejected') {
    throw new HttpError({
      statusCode: 429,
      message: 'Try again later',
      details: `Contact rejected subscription before ${contact.email}`
    });
  } else if (contact.optInStatus == 'accepted') {
    console.info(`Contact already subscribed: ${contact.email}`);
    if (mailing_lists.every((requestedMailingList) => contact.mailingLists[requestedMailingList]))
    {
      console.info('Already subscribed for all requested mailing lists - do not send e-mail');
      return {success: true, email};
    }
  }

  const token = createToken(contact.email, new URL(rootUrl));
  const params = new URLSearchParams({token});
  if (properties.language !== undefined) {
    params.set('lang', properties.language)
  }
  await sendConfirmationMail(contact.email, `${rootUrl}/control-panel?${params}`, properties.language);

  return {success: true, email};
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
  mailingLists: MailingList[];
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
    mailingLists: availableMailingLists.map((list) => ({
      subscribed: contact.mailingLists[list.id] || false,
      ...list
    }))
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
  mailingLists: Record<string, boolean>;
}

export async function updateSubscription({email, subscribe, mailingLists}: UpdateSubscriptionRequest) {
  if (subscribe) {
    await subscribeContact(email, mailingLists);   
  } else {
    await unsubscribeContact(email);
  }
  return {success: true, email, subscribed: subscribe};
}