
import express, { Router } from "express";
import cors from "cors";
import { middleware as errorMiddleware, HttpError } from "./error";
import { middleware as openApiValidator } from "express-openapi-validator";
import { openApiSpec } from "./openapi-spec";
import { authenticate } from "./jwt";
import { subscribe, getSubscription, updateSubscription } from "./subscription"
import type { SubscribeRequest, UpdateSubscriptionRequest } from "./subscription";
import { getMailingLists } from "./loops";
import { configuration as captchaConfiguration } from "./captcha";
import rateLimit from "express-rate-limit";
import ms from "ms";

export const app = express();

// There is no need for ETag.
// API responses are non cacheable.
// Also there is no risk of "mid-air collision".
// @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag
app.set('etag', false);

// Do not expose the tech stack
app.set('x-powered-by', false);

const numberOfProxies = process.env.NUMBER_OF_PROXIES ? parseInt(process.env.NUMBER_OF_PROXIES) : 1;
// Netlify serves as proxy for the express app.
// @see https://expressjs.com/en/guide/behind-proxies.html
// @see https://express-rate-limit.mintlify.app/reference/error-codes#err-erl-permissive-trust-proxy
app.set('trust proxy', numberOfProxies);

// Workaround for Express bug where req.ip can be undefined even when req.ips is populated
// when trust proxy is set to a number. Parse X-Forwarded-For header directly.
// X-Forwarded-For format: "client_ip, proxy1_ip, proxy2_ip, ..." (leftmost is original client)
// When trusting N proxies, the client IP is the leftmost IP in the chain.
app.use((req, res, next) => {
  if (!req.ip) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string') {
      const ips = xForwardedFor.split(',').map(ip => ip.trim()).filter(ip => ip);
      if (ips.length > numberOfProxies) {
        // Client IP is always the first untrusted IP, i.e. one preceding the trusted proxies.
        const clientIP = ips[ips.length - numberOfProxies - 1];
        (req as any).ip = clientIP;
        console.debug(`Client IP: ${clientIP}`);
        console.debug(`Trusted proxies: ${ips.slice(-numberOfProxies).join(', ')}`);
      }
    }
  }
  next();
});

// Parse strings as simple key-value pairs.
app.set('query parser', 'simple');

function parseCorsOrigin(value?: string): string[] | boolean {
  const defaultValue = false;

  if (value === undefined) {
    return defaultValue;
  }
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

// Configure CORS to allow cross-origin requests
// By default cross site requests are blocked.
// Set CORS_ORIGIN to space separated list of 
// '*' to allow all origins, or to a list of allowed origins.
const corsMiddleware = cors({
  origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type'],
});

const apiSpecValidator = openApiValidator({
  apiSpec: openApiSpec,
  validateRequests: true,
  validateResponses: false, // Set to true in development for response validation
  validateSecurity: false, // We handle JWT validation manually in authenticate()
});

const router = Router();

const subscribeRateLimiter = rateLimit({
  limit: 10,
  windowMs: ms('5 minutes'),
  legacyHeaders: false,
});
const authenticateRateLimiter = rateLimit({
  limit: 500,
  windowMs: ms('30 minutes'),
  legacyHeaders: false,
});

router.get("/company", async (req, res) => {
  res.json({
    name: process.env.COMPANY_NAME || '',
    address: process.env.COMPANY_ADDRESS || '',
    logo: process.env.COMPANY_LOGO,
  });
});

router.post("/subscription", subscribeRateLimiter, async (req, res) => {
  const response = await subscribe(req);
  res.json(response);
});
router.get("/subscription", authenticateRateLimiter, async (req, res) => {
  const email = authenticate(req);
  const response = await getSubscription(email);
  res.json(response);
});
router.put("/subscription", authenticateRateLimiter, async (req, res) => {
  const email = authenticate(req);
  const request = req.body as UpdateSubscriptionRequest;
  if (request.email !== email) {
    throw new HttpError({
      statusCode: 403,
      message: "Forbidden",
      details: "Email address from request does not match JWT."
    });
  }
  const response = await updateSubscription(request);
  res.json(response);
});

// CAPTCHA settings.
// Those are prebuilt on Netlify and should not be serverd by function.
// This is just a backup in case the app is served outside of Netlify.
router.get("/captcha", async (req, res) => {
  res.json(captchaConfiguration());
});

router.get("/lists", async (req, res) => {
  const response = await getMailingLists();
  res.json(response);
});

if (process.env.NODE_ENV === "development") {
  router.get("/test/ip", async (req: express.Request, res: express.Response) => {
    res.json({
      number_of_proxies: numberOfProxies,
      ip: req.ip,
      ips: req.ips,
      url: req.originalUrl,
      protocol: req.protocol,
      hostname: req.hostname,
      baseUrl: req.baseUrl,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: req.headers,
    });
  });

  const limiter = rateLimit({
    limit: 5,
    windowMs: ms('1 minutes'),
    legacyHeaders: false,
  });
  router.get("/test/rate-limit", limiter, async (req, res) => {
    const key = req.ip ?? '';
    const info = await limiter.getKey(key);
    res.json({
      key,
      totalHits: info?.totalHits,
      resetTime: info?.resetTime?.toISOString(),
    });
  });
} else {
  router.get("/test/:endpoint", async (req, res) => {
    throw new HttpError({
      statusCode: 403,
      message: "Forbidden",
      details: "Test endpoints are not allowed in production",
    });
  });
}

router.post("/honeypot", async (req, res) => {
  console.log(`Honeypot request from ${req.ips.join(', ')}: ${req.body}`);
  res.json({ success: true });
});

app.use("/api/", corsMiddleware, express.json(), apiSpecValidator, router, errorMiddleware);
