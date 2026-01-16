import fetch from 'node-fetch';
import { HttpError } from './error';
import { CaptchaConfiguration, CaptchaProvider, loadConfiguration } from './config';

export interface CaptchaConfigurationResponse {
  success: true;
  /** Active CAPTCHA provider. */
  provider: CaptchaProvider;
  /** Site key used by the frontend widget. */
  site_key: string;
}

export function configuration(): CaptchaConfigurationResponse {
  const config = loadConfiguration().captcha;
  return { success: true, provider: config.provider, site_key: config.siteKey };
}


export async function verifyCaptcha(action: string, token?: string, remoteIp?: string): Promise<boolean> {
  const config = loadConfiguration().captcha;
  switch (config.provider) {
    case 'recaptcha':
    case 'hcaptcha':
      const verifier = new CaptchaVerifier(config);
      verifier.verify.bind(verifier);
    case 'none':
      return true;
    default:
      throw new Error(`unsupported CAPTCHA provider: ${config.provider}`);
  }
}

/**
 * CAPTCHA response from reCAPTCHA or hCaptcha.
 */
interface CaptchaResponse {
  success: boolean;

  /**
   * reCAPTCHA human score (0.0 bot to 1.0 human) or hCaptcha enterprise risk score (0.0 human to 1.0 bot).
   */
  score?: number;

  /**
   * String representing action guarded by CAPTCHA.
   */
  action: string;
  /**
   * Timestamp of the CAPTCHA challenge.
   */
  challenge_ts: string;
  /**
   * Hostname of the site where the CAPTCHA was solved.
   */
  hostname: string;

  /**
   * List of error codes returned by the CAPTCHA provider.
   * 
   * ReCAPTCHA or hCaptcha common error codes:
   * missing-input-secret     - The secret parameter is missing.
   * invalid-input-secret     - The secret parameter is invalid or malformed.
   * missing-input-response   - The response parameter is missing.
   * invalid-input-response   - The response parameter is invalid or malformed.
   * bad-request              - The request is invalid or malformed.
   * 
   * ReCAPTCHA specific error codes:
   * timeout-or-duplicate     - The response is no longer valid: either is too old or has been used previously.
   * 
   * hCaptcha specific error codes:
   * expired-input-response   - The response parameter (verification token) is expired. (120s default)
   * already-seen-response    - The response parameter (verification token) was already verified once.
   * missing-remoteip         - The remoteip parameter is missing.
   * invalid-remoteip         - The remoteip parameter is not a valid IP address or blinded value.
   * not-using-dummy-passcode - You have used a testing sitekey but have not used its matching secret.
   * sitekey-secret-mismatch  - The sitekey is not registered with the provided secret.
   */
  'error-codes'?: string[];
}


export class CaptchaVerifier {
  private readonly provider: 'recaptcha' | 'hcaptcha';
  private readonly configuration: CaptchaConfiguration;

  constructor(configuration: CaptchaConfiguration) {
    if (configuration.provider !== 'recaptcha' && configuration.provider !== 'hcaptcha') {
      throw new Error(`unsupported CAPTCHA provider: ${configuration.provider}`);
    }
    this.provider = configuration.provider;
    this.configuration = configuration;
  }

  /**
   * Perform the backend site of reCAPTCHA token verification.
   * https://developers.google.com/recaptcha/docs/v3#site_verify_response
   * @param action String representing action guarded by CAPTCHA
   * @param token  CAPTCHA token preseneted by User Agent
   * @returns true if user passed the test (score >= CAPTCHA_THRESHOLD)
   */
  async verify(action: string, token?: string, remoteIp?: string): Promise<boolean> {
    if (!token) {
      throw new HttpError({
        statusCode: 400,
        message: 'Bad request',
        reason: 'missing-captcha-token',
        details: 'CAPTCHA token is required',
      });
    }
  
    const captcha = await this.sendVerificationRequest(token, remoteIp);
    console.info(`CAPTCHA (reCAPTCHA): score=${captcha.score} action=${captcha.action} challenge_ts=${captcha.challenge_ts} hostname=${captcha.hostname}`);
  
    if (this.provider === 'recaptcha' && captcha.action !== action) {
      console.error(`CAPTCHA action does not match: expected=${action} actual=${captcha.action}`);
      throw new HttpError({
        statusCode: 400,
        message: 'Bad request',
        reason: 'captcha-action-mismatch',
        details: "CAPTCHA error: action-mismatch"
      });
    }
  
    // @todo verify hostname, with list of CORS hosts
  
    if (captcha.score !== undefined && captcha.score < this.configuration.threshold) {
      console.warn(`CAPTCHA score below threshold ${captcha.score}`);
      return false;
    }
  
    return true;
  }
  
  /**
   * Handle CAPTCHA error codes.
   * 
   * @param provider CAPTCHA provider
   * @param errorCodes list of CAPTCHA error codes
   * 
   */
  private handleErrorCodes(errorCodes: string[]): never {
    console.error(`CAPTCHA error codes (${this.provider}): ${errorCodes.join(', ')}`);
    if (errorCodes.includes('invalid-input-response') || errorCodes.includes('missing-input-response')) {
      throw new HttpError({
        statusCode: 400,
        message: 'Bad request',
        reason: 'bad-captcha',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`,
      });
    }
    if (errorCodes.includes('timeout-or-duplicate') || errorCodes.includes('expired-input-response')) {
      throw new HttpError({
        statusCode: 429,
        message: 'Try again',
        reason: 'captcha-timeout',
        details: `CAPTCHA error: ${errorCodes.join(', ')}`,
      });
    }
    throw new HttpError({
      statusCode: 500,
      message: 'Internal server error',
      details: `CAPTCHA error: ${errorCodes.join(', ')}`,
    });
  }
  
  /**
   * Calls CAPTCHA REST API for token site verification.
   * @param provider CAPTCHA provider
   * @param token  CAPTCHA token
   * @param remoteIp IP address of the requestor
   * @return CAPTCHA REST API response
   */
  private async sendVerificationRequest(token: string, remoteIp?: string): Promise<CaptchaResponse> {
    let verifyUrl : string;
    switch (this.provider) {
      case 'recaptcha':
        verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
        break;
      case 'hcaptcha':
        verifyUrl = `https://api.hcaptcha.com/siteverify`;
        break;
    }
  
    const body = new URLSearchParams({
      secret: this.configuration.secret,
      response: token,
    });
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });
  
    if (!response.ok) {
      throw new Error(`CAPTCHA API returned status ${response.status}`);
    }
  
    const data = (await response.json()) as CaptchaResponse;

    if (data['error-codes']) {
      this.handleErrorCodes(data['error-codes']);
    }
  
    if (data.success) {
      return data;
    } else {
      console.error(`reCAPTCHA error: ${JSON.stringify(data)}`);
      throw new HttpError({
        statusCode: 500,
        message: 'Internal server error',
        details: `${this.provider} validation failed`,
      });
    }
  }
}