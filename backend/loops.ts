import { LoopsClient, APIError, RateLimitExceededError } from "loops";

const API_KEY = process.env.LOOPS_SO_SECRET;

/// @todo
const companyName = process.env.COMPANY_NAME || 'Company name';
const companyAddress = process.env.COMPANY_ADDRESS || 'Address';

if (API_KEY === undefined)
  throw new Error('Configuration error');

const loops = new LoopsClient(API_KEY);

/**
 * Get publicly available mailing lists.
 */
export async function getMailingLists() {
  const allMailingLists = await loops.getMailingLists();
  return allMailingLists.filter((mailingList) => mailingList.isPublic);
}


interface Contact {
  id: string;
  email: string;
  subscribed: boolean;
  /**
   * Mailing lists the contact is subscribed to.
   * @see https://loops.so/docs/contacts/mailing-lists
   */
  mailingLists: Record<string, boolean>;
  /**
   * The contact's double opt-in status.
   * @see https://loops.so/docs/contacts/double-opt-in
   */
  optInStatus: "pending" | "accepted" | "rejected" | null;
}

type ContactProperties = Record<string, string | number | boolean | null>;

export async function upsertContact(email: string, properties: ContactProperties, mailingListsIds: string[]): Promise<Contact> {
  let contact :Contact;
  const matchingContacts = await loops.findContact({email});
  if (matchingContacts.length === 0) {
    const mailingLists = Object.fromEntries(mailingListsIds.map(listId => [listId, true]));
    const createResponse = await loops.createContact({email, properties, mailingLists});
    return {
      id: createResponse.id,
      email,
      mailingLists,
      subscribed: false,
      optInStatus: 'pending',
    };
  } else {
    return matchingContacts[0];
  }
}

export async function subscribeContact(email: string): Promise<void> {
  // @todo mailing lists
  await loops.updateContact({email, properties: {
    subscribed: true,
    optInStatus: 'accepted'
  }});
}

export async function sendConfirmationMail(email: string, confirmUrl: string, language?: string)
{
  const confirmationEmail = await findDoubleOptInEmail(language);
  loops.sendTransactionalEmail({
    email: email,
    transactionalId: confirmationEmail.id,
    dataVariables: {
      companyName,
      companyAddress,
      optInUrl: confirmUrl,
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
 * The double opt-in e-mail should have `optInUrl` in it's data variables
 * and language code in its name e.g. `#PL` if email is in polish.
 * 
 * @param language  Prefered language
 * @returns transactional email object
 */
async function findDoubleOptInEmail(language?: string) {
  const transactionalEmails = await getTransactionalEmails();
  const doubleOptInEmails = transactionalEmails.filter((email) => email.dataVariables.includes('optInUrl'));
  if (doubleOptInEmails.length === 0)
    throw new Error("No confirmation e-mail configured");

  if (language) {
    const translated = doubleOptInEmails.filter((email) => email.name.includes(`#${language.toUpperCase()}`))
    if (translated.length > 0) {
      console.log(`sending ${translated[0].name} `);
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