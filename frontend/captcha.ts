import { apiRoot } from "./context";
import { msg, str } from '@lit/localize';
import { html, TemplateResult } from 'lit';
//import '@hcaptcha/types';

export interface Captcha {
  initialize(): Promise<void>
  getToken(action: string): Promise<string>;
  disclaimer(): TemplateResult;
};

interface CaptchaConfiguration {
  provider: string;
  siteKey: string;
}

async function getConfiguration(): Promise<CaptchaConfiguration> {
  const response = await fetch(`${apiRoot}/captcha`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });
  if (response.ok) {
    const data : {success: boolean; error?: string; provider: string, site_key: string} = await response.json();
    if (!data.success) {
      throw new Error(msg(str`Cannot retrieve CAPTCHA configuration: ${data.error}`));
    }
    if (typeof data.site_key !== 'string')
      throw new Error(msg('Cannot retrieve CAPTCHA site key'));
    return {provider: data.provider, siteKey: data.site_key};
  } else {
    throw new Error(msg('Cannot retrieve CAPTCHA configuration'));
  }
}

export async function createCaptcha(): Promise<Captcha> {
  const configuration = await getConfiguration();
  let captcha: Captcha | null = null;

  switch (configuration.provider) {
    case 'none':
      captcha = new NoCaptcha();
      break;
    case 'recaptcha':
      captcha = new Recaptcha(configuration.siteKey);
      break;
    case 'hcaptcha':
      captcha = new Hcaptcha(configuration.siteKey);
      break;
    default:
      throw new Error(`Unsupported CAPTCHA provider: ${configuration.provider}`);
  }
  await captcha.initialize();
  return captcha;
}

class NoCaptcha implements Captcha {
  initialize(): Promise<void> {
    return Promise.resolve();
  }
  getToken(action: string): Promise<string> {
    return Promise.resolve(action);
  }
  disclaimer(): TemplateResult {
    return html``;
  }
}

class Recaptcha implements Captcha {
  constructor(siteKey: string) {
    this.siteKey = siteKey;
  }
  initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.addEventListener('load', () => { resolve(); });
      script.addEventListener('error', (error) => { reject(error); });
      script.src = `https://www.google.com/recaptcha/api.js?render=${this.siteKey}`;
      script.defer = true;
      script.async = true;
      document.head.appendChild(script);
    });
  }
  getToken(action: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.siteKey) {
        reject(new Error(msg('reCAPTCHA site key not loaded')));
        return;
      }
      grecaptcha.ready(() => {
        grecaptcha.execute(this.siteKey, {action}).then(resolve, reject);
      });
    });
  }
  disclaimer(): TemplateResult {
    return msg(html`This site is protected by reCAPTCHA and its <a href="https://policies.google.com/privacy" target="_blank">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank">Terms of Service</a> apply.`);
  }
  private siteKey: string;
}

class Hcaptcha implements Captcha {
  constructor(siteKey: string) {
    this.siteKey = siteKey;
    this.containerId = `hcaptcha-container-${Math.random().toString(36).substring(2)}`;
  }

  initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.addEventListener('load', () => {
        this.container = document.createElement('div');
        this.container.id = this.containerId;
        this.container.style.display = 'none';
        document.body.appendChild(this.container);
        this.widgetId = hcaptcha.render(this.container, {
          sitekey: this.siteKey,
          size: 'invisible',
        });
        resolve();
      });
      script.addEventListener('error', (error) => { reject(error); });
      script.src = `https://js.hcaptcha.com/1/api.js?render=explicit`;
      script.defer = true;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  async getToken(action: string): Promise<string> {
    if (!this.widgetId) {
      throw new Error(msg('hCaptcha widget not initialized'));
    }
    const response = await hcaptcha.execute(this.widgetId, { async: true, rqdata: action }) as HCaptchaResponse;
    console.log('hCaptcha response:', response);
    return response.response;
  }

  disclaimer(): TemplateResult {
    return msg(html`This site is protected by hCaptcha and its <a href="https://hcaptcha.com/privacy" target="_blank">Privacy Policy</a> and <a href="https://hcaptcha.com/terms" target="_blank">Terms of Service</a> apply.`);
  }

  private widgetId: string | null = null;
  private siteKey: string;
  private containerId: string;
  private container: HTMLElement | null = null;
}