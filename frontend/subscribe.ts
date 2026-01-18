import { apiRoot } from "./context";
import { initializeLocale } from "./localize";
import { msg, str } from '@lit/localize';
import { Captcha, createCaptcha } from "./captcha";
import { render } from "lit-html";

type SubscriptionStatus = 'expecting' | 'in-progress' | 'try-again' | 'awaiting-confirmation' | 'success' | 'failed';

let captcha: Captcha | null = null;

export async function main() {
  await domReady();
  
  try {
    await initializeLocale();
    captcha = await createCaptcha();
    await initializeForms();
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

async function initializeForms() {
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

  if (captcha !== null) {
    const captchaElement = document.createElement("div");
    captchaElement.className = "carajillo-captcha";
    form.appendChild(captchaElement);
    captcha.render(captchaElement);
  }

  form.addEventListener("submit", async function(event) {
    event.preventDefault();
    updateStatus(form, 'in-progress', document.createElement("progress"));

    const {status, message, email} = await submitSubscription(form);
    if (status === 'awaiting-confirmation' && email) {
      updateStatus(form, 'awaiting-confirmation', createConfirmationLink(email, message));
    } else {
      updateStatus(form, status, message);
    }
  });
}

async function submitSubscription(form: HTMLFormElement): Promise<{status: SubscriptionStatus; message: string; email?: string}> {
  const data = formDataObject(form);
  if (captcha !== null) {
    data.captchaToken = await captcha.getToken('subscribe');
  }

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

function createConfirmationLink(email: string, message: string): HTMLAnchorElement {
  const domain = email.replace(/.*@/, "");
  const link = document.createElement("a");
  link.href = `https://${domain}/`;
  link.target = "_blank";
  link.innerText = message;
  return link;
}

main();