import { apiRoot } from "./context";
import { msg, str } from '@lit/localize';

export interface Captcha {
  initialize(): Promise<void>
  getToken(action: string): Promise<string>;
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

  private siteKey: string;
}