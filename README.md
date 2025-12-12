# Netlify reCAPTCHA Validator

A TypeScript serverless function for validating reCAPTCHA tokens on Netlify.

## Features

- ✅ TypeScript support
- ✅ Serverless function for reCAPTCHA v2/v3 validation
- ✅ CORS enabled
- ✅ Error handling
- ✅ Environment variable configuration

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure reCAPTCHA Secret Key

Set your reCAPTCHA secret key as an environment variable in Netlify:

**Via Netlify Dashboard:**
1. Go to your site's settings
2. Navigate to "Environment variables"
3. Add `RECAPTCHA_SECRET_KEY` with your secret key value

**Via Netlify CLI:**
```bash
netlify env:set RECAPTCHA_SECRET_KEY "your-secret-key-here"
```

**For Local Development:**
Create a `.env` file in the root directory:
```
RECAPTCHA_SECRET_KEY=your-secret-key-here
```

### 3. Build

```bash
npm run build
```

### 4. Deploy

```bash
netlify deploy --prod
```

Or use the Netlify CLI to deploy:
```bash
netlify deploy
```

## Local Development

Run the Netlify development server:

```bash
npm run dev
```

The function will be available at: `http://localhost:8888/.netlify/functions/validate-recaptcha`

## Usage

### Endpoint

`POST /.netlify/functions/validate-recaptcha`

### Request Body

```json
{
  "token": "reCAPTCHA-response-token-from-client"
}
```

### Success Response

```json
{
  "success": true,
  "message": "reCAPTCHA validation successful",
  "challenge_ts": "2024-01-01T12:00:00Z",
  "hostname": "example.com"
}
```

### Error Response

```json
{
  "success": false,
  "error": "reCAPTCHA validation failed",
  "error-codes": ["invalid-input-response"]
}
```

### Example Client-Side Usage

```javascript
// Get the reCAPTCHA token from the client
grecaptcha.ready(function() {
  grecaptcha.execute('YOUR_SITE_KEY', {action: 'submit'}).then(function(token) {
    // Send token to your Netlify function
    fetch('/.netlify/functions/validate-recaptcha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: token })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('reCAPTCHA validated successfully!');
        // Proceed with form submission
      } else {
        console.error('reCAPTCHA validation failed:', data['error-codes']);
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
  });
});
```

### Architecture

Principles:

1. It has to prevent bots from subscribing to e-mails: CAPTCHA + confirmation e-mail
2. Should we relax the requirement for e-mail confirmation when CAPTCHA score is high?
3. The agent should be stateless. The user flow should be authorized by time limited [JWT](https://datatracker.ietf.org/doc/html/rfc7519)

```mermaid
sequenceDiagram
  actor User
  participant UserAgent
  participant reCAPTCHAv3
  participant mailer
  participant Loops
  participant MailServer 

  UserAgent -->>+ User: Show subscripton form

  User ->>- UserAgent: Submit subscription form
  activate UserAgent
  UserAgent ->>+ reCAPTCHAv3: get reCAPTCHA token
  reCAPTCHAv3 -->>- UserAgent: reCAPTCHA token
  UserAgent ->> mailer: Form data + reCAPTCHA token
  deactivate UserAgent

    activate mailer
    mailer ->>+ reCAPTCHAv3: Verify token
    reCAPTCHAv3 -->>- mailer: CAPTCHA score
    rect rgb(100, 0, 0)
      break when score below threashold
        mailer -->> UserAgent: I smell 🤖
      end
    end

    alt Contact does not exist
      mailer ->>+ Loops: Find contact by e-mail
      Loops -->>- mailer: empty contact list
      mailer ->>+ Loops: 🆕 Create contact (e-mail, language, captcha score...)
      Loops -->>- mailer: New contact id
    else Contact exists
      mailer ->>+ Loops: Find contact by e-mail
      Loops -->>- mailer: contact id + optInStatus (one of: "pending", "accepted", "rejected" or null)
    end
    mailer ->>+ Loops: 📨 Send confirmation e-mail<br/>transactionalId, JWT
    Loops ->> MailServer: 📨 Confirmation e-mail
    activate MailServer
    Loops -->>- mailer: e-mail sent

  mailer -->> UserAgent: OK
  deactivate mailer
  UserAgent ->>+ User: Prompt to check e-mail

  User ->>- MailServer: Open e-mail, click confirmation link
  MailServer ->> UserAgent: 🔗 Confirmation link
  deactivate MailServer
  activate UserAgent
  UserAgent ->>+ mailer: Confirm subscription
    mailer ->>+ Loops: Update contact (subscribed=true)
    Loops -->>- mailer: Contact subscribed
  mailer -->>- UserAgent: Show subscription status page<br/>along with token to change subscription
  UserAgent ->> User: 🐵
  deactivate UserAgent

  rect rgb(100, 0, 0)
    opt Change subscription settings
      User ->>+ UserAgent: That was a mistake!
      UserAgent ->>+ mailer: Unsubscribe
      mailer ->>+ Loops: Update contact (subscribed=false)
      Loops -->>- mailer: Contact updated
      mailer -->>- UserAgent: OK
      UserAgent -->>- User: That's fine
    end
  end
```

### sample JWT

```json
{
  "iss": "newsletter@domain.org",
  "sub": "subcriber@example.com",
  "aud": "mailer.domain.org",
  "exp": Date.now()/1000 + 600 
}
```

## API Reference

### Error Codes

Common reCAPTCHA error codes:
- `missing-input-secret`: The secret parameter is missing
- `invalid-input-secret`: The secret parameter is invalid or malformed
- `missing-input-response`: The response parameter is missing
- `invalid-input-response`: The response parameter is invalid or malformed
- `bad-request`: The request is invalid or malformed
- `timeout-or-duplicate`: The response is no longer valid (either too old or has been used previously)

## Project Structure

```
.
├── src/
│   └── validate-recaptcha.ts    # Serverless function source
├── dist/                        # Publish directory
│── netlify/functions/           # Compiled functions (generated)
├── netlify.toml                 # Netlify configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
└── README.md                    # This file
```

## License

MIT

