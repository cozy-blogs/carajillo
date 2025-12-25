import { apiRoot } from "./context";
import { setLocale } from "./localize";
import { msg, str } from '@lit/localize';

let recaptchaSiteKey: string | null = null;

async function initializeLocale() {
  const locale = document.documentElement.lang || new URLSearchParams(window.location.search).get('lang') || 'en';
  await setLocale(locale);
}

export async function main() {
  await domReady();
  await initializeLocale();
  
  try {
    recaptchaSiteKey = await getCaptchaSiteKey();
    await loadCaptcha(recaptchaSiteKey);
    await subscribe();
  } catch (error) {
    document.querySelectorAll<HTMLElement>(".subscribe-form .subscribe-status").forEach((status) => {
        const message = (error instanceof Error) ? error.message : msg('Something went wrong.');
        status.innerText = `🙈 ${message}`;
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

async function subscribe() {
  document.querySelectorAll<HTMLFormElement>(".subscribe-form").forEach(function(form) {
    //if (new URL(form.action).hostname === "app.loops.so") 
      loopsSubscribeForm(form);
  });
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

function loopsSubscribeForm(form: HTMLFormElement) {
  const status = form.querySelector<HTMLElement>(".subscribe-status");
  form.addEventListener("submit", async function(event) {
    event.preventDefault();
    form.dataset.status = "in-progress";
    if (status) {
      status.innerHTML = "<progress/>";
    }


    const {success, message, email} = await loopsSubscribe(form);
    if (success && email) {
      form.dataset.status = "successful";
      if (status) {
        const confirmationLink = document.createElement("a");
        confirmationLink.href = confirmLink(email);
        confirmationLink.target = "_blank";
        confirmationLink.innerText = message;
        status.replaceChildren(confirmationLink);

      }
    } else {
      form.dataset.status = "failed";
      if (status)
        status.innerText = message;
    }
  });
}

function formDataObject(form: HTMLFormElement): Record<string, string> {
  const formData = new FormData(form);
  const entries: [string, string][] = [];
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      entries.push([key, value]);
    }
  });
  return Object.fromEntries(entries);
}

// https://loops.so/docs/forms/custom-form
async function loopsSubscribe(form: HTMLFormElement): Promise<{success: boolean; message: string; email?: string}> {
  const data = formDataObject(form);
  data.captcha_token = await getCaptchaToken('subscribe');

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: JSON.stringify(data),
      //body: new URLSearchParams(new FormData(form)),
      headers: {
        //"Content-Type": "application/x-www-form-urlencoded",
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
    });
    if (response.status == 429) {
      return {success: false, message: msg(`⏳ Too many signups, please try again in a little while.`)};
    }
    const result = await response.json();
    if (result.success) {
      return {success: true, message: msg(`📨 Subscription successful. Check your email for confirmation.`), email: data.email as string};
    } else {
      return {success: false, message: msg(str`❌ Subscription failed: ${result.error}`)};
    }
  } catch(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {success: false, message: msg(str`❌ Subscription failed: ${errorMessage}`)};
  }
}

function confirmLink(email: string): string {
  const domain = email.replace(/.*@/, "");
  return `https://${domain}/`;
}

main();