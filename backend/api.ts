
import express, { Router } from "express";
import cors from "cors";
import { middleware as errorMiddleware, HttpError } from "./error";
import { middleware as openApiValidator } from "express-openapi-validator";
import { openApiSpec } from "./openapi-spec";
import { authenticate } from "./jwt";
import { subscribe, getSubscription, updateSubscription } from "./subscription"
import type { SubscribeRequest, UpdateSubscriptionRequest } from "./subscription";
import { getMailingLists } from "./loops";
import { configuration as captchaConfiguration } from "./recaptcha";
import rateLimit from "express-rate-limit";
import ms from "ms";

export const app = express();

// There is no need for ETag.
// API responses are non cacheable.
// Also there is no risk of "mir-air collision".
// @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag
app.set('etag', false);

// Do not expose the tech stack
app.set('x-powered-by', false);

const numberOfProxies = process.env.NUMBER_OF_PROXIES ? parseInt(process.env.NUMBER_OF_PROXIES) : 1;
// Netlify serves as proxy for the express app.
// @see https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', numberOfProxies);

// Parse strings as simple key-value pairs.
app.set('query parser', 'simple');

// Configure CORS to allow cross-origin requests
// Allow all origins by default, or restrict via CORS_ORIGIN environment variable
const corsMiddleware = cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.trim().split(/\s+/) : true,
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
  const response = await subscribe(req.body as SubscribeRequest);
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
      details: "E-mail address from request does not match JWT."
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
  router.get("/test/ip", apiSpecValidator, async (req: express.Request, res: express.Response) => {
    res.json({
      hostname: req.hostname,
      url: req.originalUrl,
      ip: req.ip,
      ips: req.ips,
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
    limiter(req, res, async () => {
      res.json({
        key,
        totalHits: info?.totalHits,
        resetTime: info?.resetTime?.toISOString(),
      });
    });
  });
}

router.post("/honeypot", async (req, res) => {
  console.log(`Honeypot request from ${req.ips.join(', ')}: ${req.body}`);
  res.json({ success: true });
});

app.use("/api/", corsMiddleware, express.json(), apiSpecValidator, router, errorMiddleware);
