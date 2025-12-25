import { LoopsClient, APIError, RateLimitExceededError, ContactProperty } from "loops";

const API_KEY = process.env.LOOPS_SO_SECRET;

/// @todo
const companyName = process.env.COMPANY_NAME || 'Company name';
const companyAddress = process.env.COMPANY_ADDRESS || 'Address';

if (API_KEY === undefined)
  throw new Error('Configuration error');

const loops = new LoopsClient(API_KEY);


/**
 * Initialize Loops — create custom properties.
 * 
 * @see https://loops.so/docs/contacts/properties
 */
export async function initialize() {
  const properties: ContactProperty[] = await loops.getCustomProperties('custom');

  const upsertProperty = async (name: string, type: "string" | "number" | "boolean" | "date") => {
    if (!properties.some((prop) => prop.key === name)) {
      console.info(`creating ${name} property`);
      loops.createContactProperty(name, type);
    } else {
      console.log(`property ${name} already exists`);
    }
  };

  // Language prefered by contact; ISO 639 code.
  upsertProperty('language', 'string');

  // Custom double opt-in status - 'pending', 'accepted' or 'rejected'.
  upsertProperty('xOptInStatus', 'string');

  // @todo fill new property with optInStatus

  console.info('loops initialized successfully');
}

/**
 * Get publicly available mailing lists.
 */
export async function getMailingLists() {
  const allMailingLists = await loops.getMailingLists();
  return allMailingLists.filter((mailingList) => mailingList.isPublic);
}


export interface Contact {
  id: string;
  email: string;
  subscribed: boolean;
  /**
   * Mailing lists the contact is subscribed to.
   * @see https://loops.so/docs/contacts/mailing-lists
   */
  mailingLists: MailingLists;
  /**
   * The contact's double opt-in status.
   * Custom `xOptInStatus` property.
   * @see See README.md for details
   * @see https://loops.so/docs/contacts/double-opt-in
   */
  optInStatus: DoubleOptInStatus;
}

type MailingLists = Record<string, boolean>;
type ContactProperties = Record<string, string | number | boolean | null>;
type DoubleOptInStatus = "pending" | "accepted" | "rejected" | null;

/**
 * Find contact by e-mail
 * @see https://loops.so/docs/api-reference/find-contact
 */
export async function findContact(email: string): Promise<Contact | null> {
  const matchingContacts = await loops.findContact({email});
  if (matchingContacts.length === 0) {
    return null;
  } else {
    const found = matchingContacts[0];
    console.log(`findContact: ${JSON.stringify(found)}`);
    found.optInStatus = found.xOptInStatus as DoubleOptInStatus;
    return found;
  }
}

/**
 * Create or update contact.
 * @param email            Contact e-mail address 
 * @param properties       Extra contact properties (firstName, lastName, userGroup etc.)
 * @param mailingListsIds  Initial mailing list
 * @see https://loops.so/docs/api-reference/create-contact
 */
export async function upsertContact(email: string, properties: ContactProperties, mailingListsIds: string[]): Promise<Contact> {
  const matchingContacts = await loops.findContact({email});
  if (matchingContacts.length === 0) {
    const mailingLists = Object.fromEntries(mailingListsIds.map(listId => [listId, true]));
    const createResponse = await loops.createContact({
      email,
      properties: {
        subscribed: false,
        xOptInStatus: 'pending',
        ...properties
      },
      mailingLists,
    });
    return {
      id: createResponse.id,
      email,
      mailingLists,
      subscribed: false,
      optInStatus: 'pending',
      ...properties
    };
  } else {
    const found = matchingContacts[0];
    found.optInStatus = found.xOptInStatus as DoubleOptInStatus;
    return found;
  }
}

export async function subscribeContact(email: string, mailingLists: MailingLists): Promise<void> {
  await loops.updateContact({
    email,
    properties: {
      subscribed: true,
      xOptInStatus: 'accepted'
    },
    mailingLists,
  });
}

export async function unsubscribeContact(email: string): Promise<void> {
  await loops.updateContact({
    email,
    properties: {
      subscribed: false,
      xOptInStatus: 'rejected'
    },
  });
}

export async function sendConfirmationMail(email: string, confirmUrl: string, language?: string)
{
  const confirmationEmail = await findDoubleOptInEmail(language);
  console.log(`Sending ${confirmationEmail.name} to ${email} with ${confirmUrl}`);
  console.log(`Data variables: ${JSON.stringify(confirmationEmail.dataVariables)}`);
  // @todo other variables? logo?
  loops.sendTransactionalEmail({
    email: email,
    transactionalId: confirmationEmail.id,
    dataVariables: {
      companyName,
      companyAddress,
      xOptInUrl: confirmUrl,
    }
  });
}

/**
 * Get the list of transactional e-mails
 * 
 * https://loops.so/docs/transactional
 * https://app.loops.so/transactional
 */
const getTransactionalEmails = unpaginate(loops.getTransactionalEmails.bind(loops));


/**
 * Find the transactional e-mail used to confirm subscripton.
 * 
 * The double opt-in e-mail should have `xOptInUrl` in it's data variables
 * and language code in its name e.g. `#PL` if email is in polish.
 * 
 * @param language  Prefered language
 * @returns transactional email object
 */
async function findDoubleOptInEmail(language?: string) {
  const transactionalEmails = await getTransactionalEmails();
  const doubleOptInEmails = transactionalEmails.filter((email) => email.dataVariables.includes('xOptInUrl'));
  if (doubleOptInEmails.length === 0)
    throw new Error("No confirmation e-mail configured");

  if (language) {
    const translated = doubleOptInEmails.filter((email) => email.name.includes(`#${language.toUpperCase()}`))
    if (translated.length > 0) {
      return translated[0];
    }
  }
  return doubleOptInEmails[0];
}


interface Iterator {
  /**
   * The next cursor (for retrieving the next page of results using the `cursor` parameter), or `null` if there are no further pages.
   */
  nextCursor: string | null;
  /**
   * The URL of the next page of results, or `null` if there are no further pages.
   */
  nextPage: string | null;
}

interface Iterable<T> {
  data: T[];
  pagination: Iterator;
}

interface Generator<T> {
  ({ perPage, cursor }: {
        perPage?: number;
        cursor?: string;
    }): Promise<Iterable<T>>;
}

function unpaginate<T>(generator: Generator<T>, perPage = 20) {
  return async () => {
    let combined : T[] = [];
    let cursor : string | null | undefined = undefined;
    do {
      const chunk = await generator({perPage, cursor});
      combined = combined.concat(chunk.data);
      cursor = chunk.pagination.nextCursor;
    } while(cursor !== null);
    return combined;
  }
}