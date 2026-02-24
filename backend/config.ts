import * as ms from 'ms';

export interface Configuration {
  company: CompanyConfiguration;
  server: ServerConfiguration;
  captcha: CaptchaConfiguration;
  loopsSo: LoopsSoConfiguration;
}

interface PartialConfiguration {
  company?: Partial<CompanyConfiguration>;
  server?: Partial<ServerConfiguration>;
  captcha?: Partial<CaptchaConfiguration>;
  loopsSo?: Partial<LoopsSoConfiguration>;
}

const DEFAULT_CONFIGURATION = {
  server: {
    numberOfProxies: 1,
    jwtExpiration: ms.default('1 year'),
    corsOrigin: false as string[] | boolean,
    environment: 'production' as Environment,
  },
  captcha: {
    provider: 'none' as CaptchaProvider,
    threshold: 0.5,
    branding: 'disclaimer' as CaptchaBranding,
  },
};

export const configuration: Configuration = loadConfiguration();

/** @brief Company configuration.
 * @details This configuration is used to identify the company in the email templates and in the control panel.
 */
export interface CompanyConfiguration {
  /** @brief Company name. (env:COMPANY_NAME) */
  name: string;
  /** @brief Company postal address. (env:COMPANY_ADDRESS) */
  address: string;
  /** @brief Company logo URL. (env:COMPANY_LOGO) */
  logo?: string;
}

type Environment = 'production' | 'development' | 'test';

export interface ServerConfiguration {
  /** @brief Number of proxies before the backend.
   * @details This is the number from the X-forwarded-for header that should be trusted. (env:NUMBER_OF_PROXIES)
   */
  numberOfProxies: number;

  /** @brief Domains where submission forms may be created.
   * @details This is the list of origins (domains, protocols, ports) that are allowed to create submission forms.
   * (env:CORS_ORIGIN space separated list) default: false (all origins are blocked)
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin
   */
  corsOrigin: string[] | boolean;

  /**
   * @brief Secret key for JWT token signing.
   * @details (env:JWT_SECRET)
   */
  jwtSecret: string;

  /** @brief How long token in email confirmation link is valid in seconds since token is created.
   * @details After this time another confirmation email will be sent when needed. (env:JWT_EXPIRATION)
   * @see https://github.com/vercel/ms#readme for time delta syntax.
   */
  jwtExpiration: number;

  /** @brief Environment. (env:NODE_ENV)
   * @details Default: 'production'
   */
  environment: Environment;
}

/**
 * @brief Allowed CAPTCHA providers configured for backend validation.
 */
export type CaptchaProvider = 'recaptcha' | 'hcaptcha' | 'none';

/** @brief CAPTCHA branding options for frontend widget. */
export type CaptchaBranding = 'none' | 'badge' | 'inline-badge' | 'disclaimer';

/**
 * @brief Environment-derived settings for CAPTCHA handling.
 * @details Centralizes provider selection, site key, secret, and threshold resolution from environment variables so other modules do not access process.env directly.
 */
export interface CaptchaConfiguration {
  /** @brief CAPTCHA provider. (env:CAPTCHA_PROVIDER) */
  provider: CaptchaProvider;
  /** @brief CAPTCHA site key. (env:CAPTCHA_SITE_KEY) */
  siteKey: string;
  /** @brief CAPTCHA secret. (env:CAPTCHA_SECRET) */
  secret: string;
  /** @brief CAPTCHA score threshold.
   * @details in range 0.0 (more lenient) to 1.0 (more restrictive)
   * (env:CAPTCHA_THRESHOLD) default: 0.5
   */
  threshold: number;

  /** @brief CAPTCHA branding. (env:CAPTCHA_BRANDING) */
  branding: CaptchaBranding;
}

export interface LoopsSoConfiguration {
  /** @brief Loops.so API key.
   * @details This is the API key for the Loops.so API. (env:LOOPS_SO_SECRET)
   * @see https://app.loops.so/settings?page=api
   */
  apiKey: string;
}

export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): Configuration {
  return {
    company: loadCompanyEnv(env),
    captcha: loadCaptchaEnv(env),
    server: loadServerEnv(env),
    loopsSo: loadLoopsSoEnv(env),
  };
}


export function loadCompanyEnv(env: NodeJS.ProcessEnv = process.env): CompanyConfiguration {
  if (!env.COMPANY_NAME) {
    throw new Error('COMPANY_NAME is not set');
  }
  if (!env.COMPANY_ADDRESS) {
    throw new Error('COMPANY_ADDRESS is not set');
  }
  return {
    name: env.COMPANY_NAME,
    address: env.COMPANY_ADDRESS,
    logo: env.COMPANY_LOGO,
  };
}


/**
 * @brief Resolve CAPTCHA configuration from environment variables.
 */
function loadCaptchaEnv(env: NodeJS.ProcessEnv = process.env): CaptchaConfiguration {
  const provider = parseProvider(env.CAPTCHA_PROVIDER);
  return {
    provider,
    siteKey: pickCaptchaSiteKey(provider, env),
    secret: pickCaptchaSecret(provider, env),
    threshold: parseCaptchaThreshold(env.CAPTCHA_THRESHOLD),
    branding: parseCaptchaBranding(env.CAPTCHA_BRANDING),
  };
}

function parseProvider(provider?: string): CaptchaProvider {
  switch (provider) {
    case 'recaptcha':
    case 'hcaptcha':
    case 'none':
      return provider;
    case undefined:
      return DEFAULT_CONFIGURATION.captcha.provider;
    default:
      throw new Error(`Unsupported CAPTCHA provider: ${provider}`);
  }
}

function pickCaptchaSiteKey(provider: CaptchaProvider, env: NodeJS.ProcessEnv): string {
  switch (provider) {
    case 'hcaptcha':
      if (!env.HCAPTCHA_SITE_KEY) {
        throw new Error('HCAPTCHA_SITE_KEY is not set');
      }
      return env.HCAPTCHA_SITE_KEY;
    case 'recaptcha':
      if (!env.RECAPTCHA_SITE_KEY) {
        throw new Error('RECAPTCHA_SITE_KEY is not set');
      }
      return env.RECAPTCHA_SITE_KEY;
    case 'none':
      return '';
  }
}

function pickCaptchaSecret(provider: CaptchaProvider, env: NodeJS.ProcessEnv): string {
  switch (provider) {
    case 'hcaptcha':
      if (!env.HCAPTCHA_SECRET) {
        throw new Error('HCAPTCHA_SECRET is not set');
      }
      return env.HCAPTCHA_SECRET;
    case 'recaptcha':
      if (!env.RECAPTCHA_SECRET) {
        throw new Error('RECAPTCHA_SECRET is not set');
      }
      return env.RECAPTCHA_SECRET;
    case 'none':
      return '';
  }
}

function parseCaptchaBranding(value?: string): CaptchaBranding {
  if (value === undefined) {
    return DEFAULT_CONFIGURATION.captcha.branding;
  }
  switch (value) {
    case 'none':
    case 'badge':
    case 'inline-badge':
    case 'disclaimer':
      return value;
    default:
      throw new Error(`Unsupported CAPTCHA branding: ${value}`);
  }
}

function parseCaptchaThreshold(value?: string): number {
  if (value === undefined) {
    return DEFAULT_CONFIGURATION.captcha.threshold;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`CAPTCHA threshold must be a number: ${value}`);
  }
  if (parsed < 0.0 || parsed > 1.0) {
    throw new Error(`CAPTCHA threshold must be between 0.0 and 1.0: ${value}`);
  }
  return parsed;
}


function loadServerEnv(env: NodeJS.ProcessEnv = process.env): ServerConfiguration {
  const numberOfProxies = parseNumberOfProxies(env.NUMBER_OF_PROXIES);
  const corsOrigin = parseCorsOrigin(env.CORS_ORIGIN);
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  const jwtExpiration = parseJwtExpiration(env.JWT_EXPIRATION);
  const environment = parseEnvironment(env.NODE_ENV);
  return {
    numberOfProxies,
    corsOrigin,
    jwtSecret: env.JWT_SECRET,
    jwtExpiration,
    environment,
  };
}

function parseNumberOfProxies(value?: string): number {
  if (value === undefined) {
    return DEFAULT_CONFIGURATION.server.numberOfProxies;
  }
  const parsed = Number.parseInt(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`NUMBER_OF_PROXIES must be a number: ${value}`);
  }
  return parsed;
}

function parseCorsOrigin(value?: string): string[] | boolean {
  const defaultValue = DEFAULT_CONFIGURATION.server.corsOrigin;

  if (value === undefined) {
    return defaultValue;
  }
  // @todo verify correct format, strip /
  const origins = value.trim().split(/\s+/).filter(origin => origin);
  if (origins.length === 0) {
    return defaultValue;
  } else if (origins.includes('*')) {
    // Cors middleware won't process ['*'] correctly. It has to be '*' or true.
    // '*' would mean to set Access-Control-Allow-Origin response header literally to '*'.
    // true would mean to set Access-Control-Allow-Origin to the request origin.
    // First option (Access-Control-Allow-Origin: *) in conjunction with Access-Control-Allow-Credentials: true
    // is blocked by browsers for security reasons (so called wildcard exception).
    // Second option (reflecting the request origin) is removing the safety guard.
    // It should be fine though since credentials are not sent through cookies and responses are not cached (Cache-Control: no-store)
    // and not shared across domains (Vary: Origin).
    // Still, it is better to be explicit and allow only the domains that are allowed to create submission forms.
    // Read more:
    // * https://github.com/expressjs/cors/issues/333
    // * https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#credentialed_requests_and_wildcards
    // * https://jub0bs.com/posts/2023-02-08-fearless-cors/
    console.warn('CORS_ORIGIN is set to "*". This is not recommended. Use CORS_ORIGIN to allow only the domains that are allowed to create submission forms.');

    return true;
  }
  return origins;
}

function parseJwtExpiration(value?: string): number {
  if (value === undefined) {
    return DEFAULT_CONFIGURATION.server.jwtExpiration;
  }
  const parsed = ms.default(value as ms.StringValue);
  if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
    throw new Error(`JWT_EXPIRATION must be a valid time delta: ${value}`);
  }
  return Math.round(parsed / 1000);
}

function parseEnvironment(value?: string): Environment {
  if (value === undefined) {
    return DEFAULT_CONFIGURATION.server.environment;
  }
  switch (value) {
    case 'production':
    case 'development':
    case 'test':
      return value;
    default:
      throw new Error(`Unsupported environment: ${value}`);
  }
}

function loadLoopsSoEnv(env: NodeJS.ProcessEnv = process.env): LoopsSoConfiguration {
  if (!env.LOOPS_SO_SECRET) {
    throw new Error('LOOPS_SO_SECRET is not set');
  }
  return {
    apiKey: env.LOOPS_SO_SECRET,
  };
}

export function generateEnvFile(config: Configuration): string {
  let captchaProviderSpecific : string;
  switch (config.captcha.provider) {
    case 'none':
      captchaProviderSpecific = '';
      break;
    case 'recaptcha':
      captchaProviderSpecific = `# reCAPTCHA site key, secret key
# https://console.cloud.google.com/security/recaptcha/
RECAPTCHA_SITE_KEY=${config.captcha.siteKey}
RECAPTCHA_SECRET=${config.captcha.secret}`;
      break;
    case 'hcaptcha':
      captchaProviderSpecific = `# hCaptcha site key
# https://dashboard.hcaptcha.com/sites
HCAPTCHA_SITE_KEY=${config.captcha.siteKey}
# hCaptcha secret key
# https://dashboard.hcaptcha.com/settings/secrets
HCAPTCHA_SECRET=${config.captcha.secret}`;
      break;
  }

  return `
# Company information for email templates
COMPANY_NAME=${config.company.name}
COMPANY_ADDRESS=${config.company.address}
COMPANY_LOGO=${config.company.logo}

# Domains where submission forms may be created
CORS_ORIGIN=${Array.isArray(config.server.corsOrigin) ? config.server.corsOrigin.join(' ') : config.server.corsOrigin ? '*' : ''}

# Number of proxies to trust
# @see https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues
# @see https://expressjs.com/en/guide/behind-proxies.html
NUMBER_OF_PROXIES=${config.server.numberOfProxies}

# Secret key for JWT token signing
JWT_SECRET=${config.server.jwtSecret}

# How long token in email confirmation link is valid
# After this time another confirmation email will be sent when needed
# See: https://github.com/vercel/ms#readme for time delta syntax
JWT_EXPIRATION=${ms.default(config.server.jwtExpiration, { long: true })}

# CAPTCHA provider (none|recaptcha|hcaptcha)
CAPTCHA_PROVIDER=${config.captcha.provider}
# CAPTCHA score threshold in range 0.0 (more lenient) to 1.0 (more restrictive)
# default: 0.5
CAPTCHA_THRESHOLD=${config.captcha.threshold.toFixed(1)}

CAPTCHA_BRANDING=${config.captcha.branding}

${captchaProviderSpecific}

# Loops.so API key
# https://app.loops.so/settings?page=api
LOOPS_SO_SECRET=${config.loopsSo.apiKey}
`;
}