
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

export const app = express();

// There is no need for ETag.
// API responses are non cacheable.
// Also there is no risk of "mir-air collision".
// @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag
app.set('etag', false);

// Do not expose the tech stack
app.set('x-powered-by', false);

// Netlify serves as proxy for the express app.
// @see https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', true);

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

router.post("/subscription", async (req, res) => {
  const response = await subscribe(req.body as SubscribeRequest);
  res.json(response);
});
router.get("/subscription", async (req, res) => {
  const email = authenticate(req);
  const response = await getSubscription(email);
  res.json(response);
});
router.put("/subscription", async (req, res) => {
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
  router.get("/test", apiSpecValidator, async (req: express.Request, res: express.Response) => {
    res.json({
      hostname: req.hostname,
      url: req.originalUrl,
      ip: req.ip,
      ips: req.ips,
    });
  });
}

router.post("/honeypot", async (req, res) => {
  console.log(`Honeypot request from ${req.ips.join(', ')}: ${req.body}`);
  res.json({ success: true });
});

app.use("/api/", corsMiddleware, express.json(), apiSpecValidator, router, errorMiddleware);
