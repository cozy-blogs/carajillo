import { LoopsClient, ContactProperty, Contact as LoopsContact, TransactionalEmail } from "loops";
import { Configuration, loadConfiguration } from "./config";

/**
 * Configuration required by the Loops module: API key and company data for transactional emails.
 */
export type LoopsConfiguration = Pick<Configuration, "loopsSo" | "company">;

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
   * @see README.md for details
   * @see https://loops.so/docs/contacts/double-opt-in
   */
  optInStatus: DoubleOptInStatus;
  /**
   * The URL of the page from which the subscription request was made.
   */
  referer?: string;
  /**
   * The contact's preferred language ISO 639-1 code (e.g. "en", "pl").
   */
  language?: string;
}

type MailingLists = Record<string, boolean>;
export type ContactProperties = Record<string, string | number | boolean | null>;
type DoubleOptInStatus = "pending" | "accepted" | "rejected" | null;

/**
 * Loops API wrapper.
 */
export class Loops {
  private readonly client: LoopsClient;
  private readonly company: LoopsConfiguration["company"];
  private readonly fetchTransactionalEmails: () => Promise<TransactionalEmail[]>;

  constructor(config: LoopsConfiguration) {
    this.client = new LoopsClient(config.loopsSo.apiKey);
    this.company = config.company;
    this.fetchTransactionalEmails = unpaginate(
      this.client.getTransactionalEmails.bind(this.client)
    );
  }

  /**
   * Initialize Loops — create custom properties.
   *
   * @details Creates the following properties:
   * - language - the contact's preferred language ISO 639-1 code (e.g. "en", "pl")
   * - xOptInStatus - the contact's double opt-in status ("pending", "accepted", "rejected")
   *
   * @see README.md for details
   * @see https://loops.so/docs/contacts/properties
   * @see https://loops.so/docs/api-reference/create-contact-property
   */
  async initialize(): Promise<void> {
    const properties: ContactProperty[] =
      await this.client.getCustomProperties("custom");

    const upsertProperty = async (
      name: string,
      type: "string" | "number" | "boolean" | "date"
    ) => {
      if (!properties.some((prop) => prop.key === name)) {
        console.info(`creating ${name} property`);
        await this.client.createContactProperty(name, type);
        return true;
      } else {
        console.log(`property ${name} already exists`);
        return false;
      }
    };

    await upsertProperty("language", "string");
    await upsertProperty("xOptInStatus", "string");

    console.info("loops initialized successfully");
  }

  async verifyConfiguration(): Promise<void> {
    await this.client.testApiKey();

    const transactionalEmails = await this.fetchTransactionalEmails();
    let doubleOptInEmails = 0;
    let tokenRefreshEmails = 0;
    let errors = [];
    for (const email of transactionalEmails) {
      console.log(`Transactional email ${JSON.stringify(email.name)} has data variables: ${JSON.stringify(email.dataVariables)}`);
      if (email.dataVariables.includes("xOptInUrl")) {
        doubleOptInEmails++;
      } else if (email.dataVariables.includes("xTokenRefreshUrl")) {
        tokenRefreshEmails++;
      } else {
        continue;
      }

      const language = /#[A-Z]{2}\b/.exec(email.name);
      if (language === null) {
        errors.push(`Transactional email ${JSON.stringify(email.name)} does not have language specified; use #<ISO 639-1 code> in the email name`);
      }

      const dataVariables = new Set(email.dataVariables);
      const providedVariables = new Set(['xOptInUrl', 'xTokenRefreshUrl', 'companyName', 'companyAddress', 'companyLogo']);
      if (!dataVariables.isSubsetOf(providedVariables)) {
        errors.push(`Transactional email ${JSON.stringify(email.name)} has unexpected data variables: ${dataVariables.difference(providedVariables)}`);
      }
    }

    if (doubleOptInEmails === 0) {
      errors.push("No double opt-in email configured. Define transactional email with `xOptInUrl` data variable.");
    }
    if (tokenRefreshEmails === 0) {
      errors.push("No token refresh email configured. Define transactional email with `xTokenRefreshUrl` data variable.");
    }
    if (errors.length > 0) {
      throw new Error(`Loops configuration verification failed: ${errors.join(", ")}`);
    }
  }

  /**
   * Get publicly available mailing lists.
   */
  async getMailingLists() {
    const allMailingLists = await this.client.getMailingLists();
    return allMailingLists.filter((mailingList) => mailingList.isPublic);
  }

  /**
   * Find contact by email.
   * @see https://loops.so/docs/api-reference/find-contact
   */
  async findContact(email: string): Promise<Contact | null> {
    const matchingContacts = await this.client.findContact({ email });
    if (matchingContacts.length === 0) {
      return null;
    } else {
      const found = matchingContacts[0];
      console.log(`findContact: ${JSON.stringify(found)}`);
      found.optInStatus = getDoubleOptInStatus(found);
      return found;
    }
  }

  /**
   * Create or update contact.
   * @param email           Contact email address
   * @param properties      Extra contact properties (firstName, lastName, userGroup etc.)
   * @param mailingListIds  Initial mailing list IDs (optional, defaults to all publicly available mailing lists)
   * @see https://loops.so/docs/api-reference/create-contact
   */
  async upsertContact(
    email: string,
    properties: ContactProperties,
    mailingListIds?: string[]
  ): Promise<Contact> {
    const contact = await this.findContact(email);
    if (contact === null) {
      if (mailingListIds === undefined || mailingListIds.length === 0) {
        mailingListIds = await this.getMailingLists().then((lists) =>
          lists.map((list) => list.id)
        );
      }
      const mailingLists = Object.fromEntries(
        mailingListIds!.map((listId) => [listId, true])
      );
      const createResponse = await this.client.createContact({
        email,
        properties: {
          subscribed: false,
          xOptInStatus: "pending",
          ...properties,
        },
        mailingLists,
      });
      return {
        id: createResponse.id,
        email,
        mailingLists,
        subscribed: false,
        optInStatus: "pending",
        ...properties,
      };
    } else {
      return contact;
    }
  }

  /**
   * Mark contact as subscribed and set double opt-in status to accepted.
   */
  async subscribeContact(
    email: string,
    mailingLists?: MailingLists
  ): Promise<void> {
    await this.client.updateContact({
      email,
      properties: {
        subscribed: true,
        xOptInStatus: "accepted",
      },
      mailingLists,
    });
  }

  /**
   * Mark contact as unsubscribed and set double opt-in status to rejected.
   */
  async unsubscribeContact(email: string): Promise<void> {
    await this.client.updateContact({
      email,
      properties: {
        subscribed: false,
        xOptInStatus: "rejected",
      },
    });
  }

  /**
   * Send the double opt-in confirmation email to the contact.
   * Uses the transactional email that has `xOptInUrl` in its data variables;
   * if @param language is provided, prefers an email whose name contains the language code (e.g. #PL).
   */
  async sendConfirmationMail(
    email: string,
    confirmUrl: URL,
    language?: string
  ): Promise<void> {
    const confirmationEmail =
      await this.findTransactionalEmail((email) => email.dataVariables.includes("xOptInUrl"), language);
    console.log(
      `Sending ${confirmationEmail.name} to ${email} with ${confirmUrl}`
    );
    console.log(
      `Data variables: ${JSON.stringify(confirmationEmail.dataVariables)}`
    );
    await this.client.sendTransactionalEmail({
      email: email,
      transactionalId: confirmationEmail.id,
      dataVariables: {
        companyName: this.company.name,
        companyAddress: this.company.address,
        companyLogo: this.company.logo ?? "",
        xOptInUrl: confirmUrl.toString(),
      },
    });
  }

  async sendTokenRefreshMail(
    email: string,
    refreshUrl: URL,
    language?: string
  ): Promise<void> {
    const tokenRefreshEmail = await this.findTransactionalEmail((email) => email.dataVariables.includes("xTokenRefreshUrl"), language);
    console.log(
      `Sending ${tokenRefreshEmail.name} to ${email} with ${refreshUrl}`
    );
    await this.client.sendTransactionalEmail({
      email: email,
      transactionalId: tokenRefreshEmail.id,
      dataVariables: {
        companyName: this.company.name,
        companyAddress: this.company.address,
        companyLogo: this.company.logo ?? "",
        xTokenRefreshUrl: refreshUrl.toString(),
      },
    });
  }

  /**
   * @brief Find the transactional email used to confirm subscription.
   *
   * The double opt-in email should have `xOptInUrl` in its data variables
   * and language code in its name e.g. `#PL` if email is in polish.
   * The token refresh email should have `xTokenRefreshUrl` in its data variables.
   *
   * @param predicate Predicate to filter transactional emails
   * @param language  Preferred language
   * @returns transactional email object
   */
  private async findTransactionalEmail(predicate: (email: TransactionalEmail) => boolean, language?: string) {
    const transactionalEmails = await this.fetchTransactionalEmails();
    const filtered = transactionalEmails.filter(predicate);
    if (filtered.length === 0)
      throw new Error("No transactional email configured");

    if (language) {
      const translatedVersion = filtered.find((email) =>
        email.name.includes(`#${language.toUpperCase()}`)
      );
      if (translatedVersion !== undefined)
        return translatedVersion;
    }
    const englishVersion = filtered.find((email) => email.name.includes("#EN"));
    if (englishVersion !== undefined)
      return englishVersion;

    return filtered[0];
  }
}

function getDoubleOptInStatus(contact: LoopsContact): DoubleOptInStatus {
  const builtInStatus = contact.optInStatus;
  const customStatus = contact.xOptInStatus as DoubleOptInStatus;
  const settledStates = new Set<DoubleOptInStatus>(["accepted", "rejected"]);
  if (settledStates.has(customStatus)) {
    return customStatus;
  } else if (settledStates.has(builtInStatus)) {
    // When custom status is not settled, use the built-in one.
    // We cannot re-send confirmation emails, if newsletter previously used
    // built-in loops double opt-in and contact accepted or rejected subscription.
    return builtInStatus;
  } else {
    return customStatus;
  }
}

interface Iterator {
  /**
   * The cursor to the next page of results, or null if there is no next page.
   */
  nextCursor: string | null;
  /**
   * The URL to the next page of results, or null if there is no next page.
   */
  nextPage: string | null;
}

interface Iterable<T> {
  data: T[];
  pagination: Iterator;
}

interface Generator<T> {
  (options: { perPage?: number; cursor?: string }): Promise<Iterable<T>>;
}

function unpaginate<T>(generator: Generator<T>, perPage = 20) {
  return async () => {
    let combined: T[] = [];
    let cursor: string | null | undefined = undefined;
    do {
      const chunk = await generator({ perPage, cursor });
      combined = combined.concat(chunk.data);
      cursor = chunk.pagination.nextCursor;
    } while (cursor !== null);
    return combined;
  };
}
