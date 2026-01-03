import { apiRoot } from "./context";
import { initializeLocale } from "./localize";
import { msg, str } from '@lit/localize';

let recaptchaSiteKey: string | null = null;
type SubscriptionStatus = 'expecting' | 'in-progress' | 'try-again' | 'awaiting-confirmation' | 'success' | 'failed';

export async function main() {
  await domReady();
  await initializeLocale();
  
  try {
    recaptchaSiteKey = await getCaptchaSiteKey();
    await loadCaptcha(recaptchaSiteKey);
    await initialize();
  } catch (error) {
    document.querySelectorAll<HTMLFormElement>("form.carajillo").forEach((form) => {
      const message = (error instanceof Error) ? error.message : msg('Something went wrong. Try again later.');
      updateStatus(form, 'failed', message);
    });
  }
}

function domReady() {
  return new Promise((resolve) => {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => { resolve(document); })
    else
      resolve(document);
  });
}

async function initialize() {
  document.querySelectorAll<HTMLFormElement>("form.carajillo").forEach(function(form) {
    initSubscriptionForm(form);
  });
}

function initSubscriptionForm(form: HTMLFormElement) {
  if (form.dataset.status) {
    console.debug('form already initialized', form, form.dataset.status);
    return;
  }
  form.dataset.status = 'expecting';

  form.addEventListener("submit", async function(event) {
    event.preventDefault();
    updateStatus(form, 'in-progress', document.createElement("progress"));

    const {status, message, email} = await submitSubscription(form);
    if (status === 'awaiting-confirmation' && email) {
      updateStatus(form, 'awaiting-confirmation', createConfirmationLink(email));
    } else {
      updateStatus(form, status, message);
    }
  });
}

async function submitSubscription(form: HTMLFormElement): Promise<{status: SubscriptionStatus; message: string; email?: string}> {
  const data = formDataObject(form);
  data.captchaToken = await getCaptchaToken('subscribe');

  try {
    const response = await fetch(`${apiRoot}/subscription`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
    });
    if (response.status == 429) {
      return {status: 'try-again', message: msg(`⏳ Too many signups, please try again in a little while.`)};
    }
    const result = await response.json();
    if (result.success) {
      if (result.doubleOptIn) {
        return {status: 'awaiting-confirmation', message: msg(`📨 Almost there! We sent you a confirmation email. Check spam folder if you don't see it.`), email: data.email as string};
      } else {
        return {status: 'success', message: msg(`✉️ Subscription successful.`), email: data.email as string};
      }
    } else {
      return {status: 'failed', message: msg(str`❌ Subscription failed: ${result.error}`)};
    }
  } catch(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {status: 'failed', message: msg(str`❌ Subscription failed: ${errorMessage}`)};
  }
}

function formDataObject(form: HTMLFormElement): Record<string, string | string[]> {
  const formData = new FormData(form);
  const entries: [string, string | string[]][] = [];
  formData.forEach((value, key) => {
    if (typeof value !== 'string') {
      return; // skip blobs (files)
    } else if (key === 'mailingLists') {
      const mailingLists = value.split(',').map(list => list.trim()).filter(list => list !== '');
      if (mailingLists.length > 0) {
        entries.push(['mailingLists', mailingLists]);
      }
    } else {
      entries.push([key, value]);
    }
  });
  return Object.fromEntries(entries);
}

async function getCaptchaSiteKey(): Promise<string> {
  const response = await fetch(`${apiRoot}/captcha`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });
  if (response.ok) {
    const data : {success: boolean; provider: string, site_key: string} = await response.json();
    if (typeof data.site_key !== 'string')
      throw new Error(msg('Cannot retrieve reCAPTCHA site key'));
    return data.site_key;
  } else {
    throw new Error(msg('Cannot retrieve reCAPTCHA site key'));
  }
}

function loadCaptcha(siteKey: string) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.addEventListener('load', resolve);
    script.addEventListener('error', reject);
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.defer = true;
    script.async = true;
    document.head.appendChild(script);
  });
}

function getCaptchaToken(action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!recaptchaSiteKey) {
      reject(new Error(msg('reCAPTCHA site key not loaded')));
      return;
    }
    grecaptcha.ready(() => {
      grecaptcha.execute(recaptchaSiteKey!, {action}).then(resolve, reject);
    });
  });
}

function updateStatus(form: HTMLFormElement, status: SubscriptionStatus, message: string | HTMLElement | null): HTMLElement {
  form.dataset.status = status;
  let statusElement = form.querySelector<HTMLElement>(".subscribe-status");
  if (statusElement === null) {
    statusElement = document.createElement("div");
    statusElement.className = "subscribe-status";
    form.appendChild(statusElement);
  }
  if (message instanceof HTMLElement) {
    statusElement.replaceChildren(message);
  } else if (typeof message === 'string') {
    statusElement.innerText = message;
  } else {
    statusElement.replaceChildren();
  }
  return statusElement;
}

function createConfirmationLink(email: string): HTMLAnchorElement {
  const domain = email.replace(/.*@/, "");
  const link = document.createElement("a");
  link.href = `https://${domain}/`;
  link.target = "_blank";
  link.innerText = msg(`Confirm subscription`);
  return link;
}

main();