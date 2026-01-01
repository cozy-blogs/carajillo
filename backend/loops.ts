import { LoopsClient, ContactProperty, Contact as LoopsContact } from "loops";

const API_KEY = process.env.LOOPS_SO_SECRET;

const companyName = process.env.COMPANY_NAME;
const companyAddress = process.env.COMPANY_ADDRESS;
const companyLogo = process.env.COMPANY_LOGO;

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
      await loops.createContactProperty(name, type);
      return true;
    } else {
      console.log(`property ${name} already exists`);
      return false;
    }
  };

  // Language preferred by contact; ISO 639 code.
  await upsertProperty('language', 'string');

  // Custom double opt-in status - 'pending', 'accepted' or 'rejected'.
  await upsertProperty('xOptInStatus', 'string');

  // @todo verify double opt-in email exists and has all required data variables

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
  /**
   * The URL of the page from which the subscription request was made.
   */
  referer?: string;
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
    found.optInStatus = getDoubleOptInStatus(found);
    return found;
  }
}

function getDoubleOptInStatus(contact: LoopsContact): DoubleOptInStatus {
  const builtInStatus = contact.optInStatus;
  const customStatus = contact.xOptInStatus as DoubleOptInStatus;
  const settledStates = new Set<DoubleOptInStatus>(['accepted', 'rejected']);
  if (settledStates.has(customStatus)) {
    return customStatus;
  } else if (settledStates.has(builtInStatus)) {
    // When custom status is not settled, use the built-in one.
    // We cannot re-send confirmation e-mails, if newsletter used
    // built-in loops double opt-in and contact accepted or rejected subscription.
    return builtInStatus;
  } else {
    return customStatus;
  }
}


/**
 * Create or update contact.
 * @param email           Contact e-mail address 
 * @param properties      Extra contact properties (firstName, lastName, userGroup etc.)
 * @param mailingListIds  Initial mailing list IDs (optional, defaults to all publicly available mailing lists)
 * @see https://loops.so/docs/api-reference/create-contact
 */
export async function upsertContact(email: string, properties: ContactProperties, mailingListIds?: string[]): Promise<Contact> {
  const contact = await findContact(email);
  if (contact === null) {
    if (mailingListIds === undefined || mailingListIds.length === 0) {
      mailingListIds = await getMailingLists().then(lists => lists.map(list => list.id));
    }
    const mailingLists = Object.fromEntries(mailingListIds!.map(listId => [listId, true]));
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
    // @todo update properties if needed
    return contact;
  }
}

export async function subscribeContact(email: string, mailingLists?: MailingLists): Promise<void> {
  await loops.updateContact({
    email,
    properties: {
      subscribed: true,
      xOptInStatus: 'accepted',
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

export async function sendConfirmationMail(email: string, confirmUrl: URL, language?: string)
{
  const confirmationEmail = await findDoubleOptInEmail(language);
  console.log(`Sending ${confirmationEmail.name} to ${email} with ${confirmUrl}`);
  console.log(`Data variables: ${JSON.stringify(confirmationEmail.dataVariables)}`);
  await loops.sendTransactionalEmail({
    email: email,
    transactionalId: confirmationEmail.id,
    dataVariables: {
      companyName: companyName || '',
      companyAddress: companyAddress || '',
      companyLogo: companyLogo || '',
      xOptInUrl: confirmUrl.toString(),
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
 * Find the transactional e-mail used to confirm subscription.
 * 
 * The double opt-in e-mail should have `xOptInUrl` in its data variables
 * and language code in its name e.g. `#PL` if email is in polish.
 * 
 * @param language  Preferred language
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