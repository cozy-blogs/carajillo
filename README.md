# Carajillo

Newsletter subscription management for loops.so

## Features

- ✅ Deployable as netlify functions
- ✅ reCAPTCHA v2/v3 validation
- ✅ Double opt-in subscription
- ✅ CORS enabled
- ✅ localization support

## Setup

### Deploy on Netlify
```
npm install
./scripts/generate-env.bash >.env.production.local
$EDITOR .env.production.local
npx netlify site:create
./scripts/netlify-import-env.bash .env.production.local
```

### Local Development

```bash
npm install
./scripts/generate-env.bash >.env.development.local
ln -s .env.development.local .env
npm run dev
```

Sample subscription form will be available at: `http://localhost:8888/`

## Usage

### Double opt-in on loops
As of right now (December 2025), the built-in loops mechanism for e-mail confirmation ([Double opt-in](https://loops.so/docs/contacts/double-opt-in)) is only supported when subscribing through forms.
API can read the `optInStatus` but cannot update it.

Check https://loops.so/docs/api-reference/changelog

Instead, carajillo will use its own mechanism with custom `xOptInStatus` property.
It will search for transactional e-mail with `xOptInUrl` data variable.
You can translate confirmation emails into multiple languages.
Carajillo will try to find the right translation by email name.

Go to https://app.loops.so/transactional and create confirmation e-mails for each language you need supported.
Add a tag with the language code in the email. For example, for English name the email `Double Opt-In #EN`.
Use following data variables:
 - `xOptInUrl` (required) — for button to confirm the subscription,
 - `companyName`
 - `companyAddress`
 - `companyLogo`.

### Including form

```html
<form class="subscribe-form" action="https://carajillo.example.com/api/honeypot">
  <input type="text" name="firstName" placeholder="Name">
  <input type="email" name="email" placeholder="Email" required>
  <input type="hidden" name="mailingLists" value="comma, delimited, mailingListIds">
  <input type="hidden" name="language" value="en">
  <input type="submit" value="Submit">
  <div class="subscribe-status"></div>
  <noscript><p>Enable Javascript in your browser to subscribe.</p></noscript>
</form>
<script src="https://carajillo.example.com/subscribe.js"></script>
```

## Architecture

Principles:

1. It has to prevent bots from subscribing to e-mails: CAPTCHA + confirmation e-mail
2. Should we relax the requirement for e-mail confirmation when CAPTCHA score is high?
3. The agent should be stateless. The user flow should be authorized by time-limited [JWT](https://datatracker.ietf.org/doc/html/rfc7519)

### Use cases

```mermaid
---
title: Subscription sequence diagram 
---
sequenceDiagram
  actor User
  participant UserAgent
  participant reCAPTCHAv3
  participant carajillo
  participant Loops
  participant MailServer

  UserAgent ->>+ carajillo: Get reCAPTCHA site key
  carajillo -->>- UserAgent: reCAPTCHA site key
  UserAgent ->> reCAPTCHAv3: get reCAPTCHA script
  note over User,UserAgent: start user/bot verification in background

  UserAgent -->>+ User: Show subscription form

  User ->>- UserAgent: Submit subscription form
  activate UserAgent
  UserAgent ->>+ reCAPTCHAv3: get reCAPTCHA token
  reCAPTCHAv3 -->>- UserAgent: reCAPTCHA token
  UserAgent ->> carajillo: Form data + reCAPTCHA token + initial mailing list set
  deactivate UserAgent

    activate carajillo
    carajillo ->>+ reCAPTCHAv3: Verify token
    reCAPTCHAv3 -->>- carajillo: CAPTCHA score
    rect rgb(100, 0, 0)
      break when score below threshold
        carajillo -->> UserAgent: I smell 🤖
      end
    end

    alt Contact does not exist
      carajillo ->>+ Loops: Find contact by e-mail
      Loops -->>- carajillo: empty contact list
      carajillo ->>+ Loops: 🆕 Create contact (e-mail, language, captcha score...)
      Loops -->>- carajillo: New contact id
    else Contact exists
      carajillo ->>+ Loops: Find contact by e-mail
      Loops -->>- carajillo: contact id + optInStatus (one of: "pending", "accepted", "rejected" or null)
    end
    carajillo ->>+ Loops: 📨 Send confirmation e-mail<br/>transactionalId, JWT
    Loops ->> MailServer: 📨 Confirmation e-mail
    activate MailServer
    Loops -->>- carajillo: e-mail sent

  carajillo -->> UserAgent: OK
  deactivate carajillo
  UserAgent ->>+ User: Prompt to check e-mail

  User ->>- MailServer: Open e-mail, click confirmation link
  MailServer ->> UserAgent: 🔗 Confirmation link
  deactivate MailServer
  activate UserAgent
  UserAgent ->>+ carajillo: Confirm subscription
    carajillo ->>+ Loops: Update contact (subscribed=true)
    Loops -->>- carajillo: Contact subscribed
  carajillo -->>- UserAgent: Show subscription status page<br/>along with token to change subscription
  UserAgent ->> User: 🐵
  deactivate UserAgent

  rect rgb(100, 0, 0)
    opt Change subscription settings
      User ->>+ UserAgent: That was a mistake!
      UserAgent ->>+ carajillo: Unsubscribe
      carajillo ->>+ Loops: Update contact (subscribed=false)
      Loops -->>- carajillo: Contact updated
      carajillo -->>- UserAgent: OK
      UserAgent -->>- User: That's fine
    end
  end
```

---

```mermaid
---
title: Control panel state diagram 
---
stateDiagram-v2
  classdef stable font-weight: bold
  classdef temporary  font-style:italic
  classdef good fill:#030
  classdef bad fill:#300
  classdef ugly fill:#330
  class Pending, Accepted, Rejected  stable
  class Subscribing, Error temporary
  class Accepted good
  class Error bad
  class Pending, Rejected ugly
  Fetching: Fetching subscription data

  [*] --> Fetching
  Fetching --> Pending: First click
  Pending --> Subscribing: Window visible or button clicked
  Subscribing --> Accepted: 🥳 Confetti
  Fetching --> Accepted: Previously accepted
  Fetching --> Rejected: Previously rejected
  Accepted --> Rejected: Unsubscribe
  Rejected --> Accepted: Resubscribe
  Fetching --> Error: Token expired
  Error --> [*]: Refresh token
```

## Project Structure

```
.
├── package.json                 # Dependencies
├── frontend/                    # Frontend source code
│   ├── locales/                 # Directory with translations (generated)
│   └── dist/                    # Publish directory (generated)
├── backend/                     # Serverless backend source code
├── translation/*.xlf            # Translation files in XLIFF format
├── netlify/functions/           # Netlify functions
├── netlify.toml                 # Netlify configuration
├── webpack.config.js            # Webpack configuration — used to generate frontend/dist
├── tsconfig.json                # TypeScript configuration (frontend & backend)
├── lit-localize.json            # Translation settings
└── README.md                    # This file
```
