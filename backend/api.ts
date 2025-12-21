
import express, { Router } from "express";
import { middleware as errorMiddleware, HttpError } from "./error";

import { authenticate } from "./jwt";
import { subscribe, getSubscription, setSubscription } from "./subscribe"
import { SubscribeRequest, SetSubscriptionRequest } from "./subscribe";
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

const router = Router();

router.post("/subscribe", async (req, res) => {
  const response = await subscribe(req.body as SubscribeRequest);
  res.json(response);
});
router.get("/subscribe", async (req, res) => {
  const email = authenticate(req);
  const response = await getSubscription(email);
  res.json(response);
});
router.put("/subscribe", async (req, res) => {
  const email = authenticate(req);
  const request = req.body as SetSubscriptionRequest;
  if (request.email !== email) {
    throw new HttpError({
      statusCode: 403,
      message: "Forbidden",
      details: "E-mail address from request does not match JWT."
    });
  }
  const response = await setSubscription(request);
  res.json(response);
});

// CAPTCHA settings.
// Those are prebuilt on Netlify and should not be serverd by function.
// This is just a backup in case the app is served outside of Netlify.
router.get("/captcha", async (req, res) => {
  res.json({success: true, ...captchaConfiguration(), generated: true});
});

router.get("/lists", async (req, res) => {
  const response = await getMailingLists();
  res.json(response);
});
router.get("/test", async (req, res) => {
  res.json({
    hostname: req.hostname,
    url: req.originalUrl,
    ip: req.ip,
    ips: req.ips,
  });
});

// @todo set headers Cache-Control...
// @todo use cors https://expressjs.com/en/resources/middleware/cors.html
app.use("/api/", express.json(), router, errorMiddleware);