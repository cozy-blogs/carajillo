* [x] xOptInStatus
* [x] Use express? https://docs.netlify.com/build/frameworks/framework-setup-guides/express/
  - [x] remove backend/netlify
  - [x] remove subscription netlify function
* [x] json schema for request validation https://www.npmjs.com/package/express-openapi-validator
* [-] use https://www.netlify.com/blog/introducing-netlify-functions-2-0/
* [-] GET response caching (mailing lists etc.)
* [ ] hcaptcha?
* [x] API redirection
* [x] rename src=>backend dist=>frontend
* [x] minimize function call - captcha site key file should be generated at build time
* [x] webpack for frontend
* [x] typescript for frontend
* [-] https://lit.dev/docs/tools/production/#modern-only-build ?
* [x] localization
* [ ] token refresh
  - [ ] due to server secret rotation
  - [ ] due to token expiration
* [x] rename backend subscribe -> subscription
* [x] backend/honeypot: form action to catch spammers
* [x] company info, logo
* [x] referer
* [x] autosubscribe using visibilityState/visibilitychange event
* [x] confetti https://www.npmjs.com/package/js-confetti or https://confettijs.org/
* [x] move xliff, remove generated translation from repo
* [x] automatic tests
* [x] handle initial mailing list in form
* [ ] update name in control panel
* [ ] error handling - functions to create errors, http headers
* [x] rename 'caffè corretto/carajillo'? move to github
* [x] optimize assets (before: control-panel.js 492 KiB => 133 KiB)
* [ ] form detection (carajillo class)

# external
* [ ] honeypot service
