import { apiRoot } from "./context";
import { msg, str } from '@lit/localize';
import { html, TemplateResult } from 'lit';
import type { CaptchaConfigurationResponse } from '../backend/captcha';
import type { CaptchaProvider, CaptchaBranding } from '../backend/config';
//import '@hcaptcha/types';

export interface Captcha {
  initialize(): Promise<void>
  getToken(action: string): Promise<string>;
  branding: CaptchaBranding;
  disclaimer(): TemplateResult;
};

interface CaptchaConfiguration {
  provider: CaptchaProvider;
  siteKey: string;
  branding: CaptchaBranding;
}

async function getConfiguration(): Promise<CaptchaConfiguration> {
  const response = await fetch(`${apiRoot}/captcha`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });
  if (response.ok) {
    const data : CaptchaConfigurationResponse = await response.json();
    if (!data.success) {
      throw new Error(msg(str`Cannot retrieve CAPTCHA configuration: ${data.error}`));
    }
    if (typeof data.site_key !== 'string')
      throw new Error(msg('Cannot retrieve CAPTCHA site key'));
    return {provider: data.provider, siteKey: data.site_key, branding: data.branding};
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
      captcha = new Recaptcha(configuration);
      break;
    case 'hcaptcha':
      captcha = new Hcaptcha(configuration);
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
  get branding(): CaptchaBranding {
    return 'none';
  }
  disclaimer(): TemplateResult {
    return html``;
  }
}

class Recaptcha implements Captcha {
  constructor(configuration: CaptchaConfiguration) {
    this.configuration = configuration;
  }

  initialize(): Promise<void> {
    if (this.configuration.branding !== 'badge') {
      // https://developers.google.com/recaptcha/docs/faq#id-like-to-hide-the-recaptcha-badge.-what-is-allowed
      const style = document.createElement('style');
      style.textContent = `.grecaptcha-badge { visibility: hidden; } `;
      document.head.appendChild(style);
    }
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.addEventListener('load', () => { resolve(); });
      script.addEventListener('error', (error) => { reject(error); });
      script.src = `https://www.google.com/recaptcha/api.js?render=${this.configuration.siteKey}`;
      script.defer = true;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  getToken(action: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      grecaptcha.ready(() => {
        grecaptcha.execute(this.configuration.siteKey, {action}).then(resolve, reject);
      });
    });
  }

  get branding(): CaptchaBranding {
    return this.configuration.branding;
  }

  disclaimer(): TemplateResult {
    return msg(html`This site is protected by reCAPTCHA and its <a href="https://policies.google.com/privacy" target="_blank">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank">Terms of Service</a> apply.`);
  }

  private configuration: CaptchaConfiguration;
}

class Hcaptcha implements Captcha {
  constructor(configuration: CaptchaConfiguration) {
    this.configuration = configuration;
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
          sitekey: this.configuration.siteKey,
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

  get branding(): CaptchaBranding {
    return this.configuration.branding;
  }

  disclaimer(): TemplateResult {
    return msg(html`This site is protected by hCaptcha and its <a href="https://hcaptcha.com/privacy" target="_blank">Privacy Policy</a> and <a href="https://hcaptcha.com/terms" target="_blank">Terms of Service</a> apply.`);
  }

  private readonly configuration: CaptchaConfiguration;
  private readonly containerId: string;
  private container: HTMLElement | null = null;
  private widgetId: string | null = null;
}