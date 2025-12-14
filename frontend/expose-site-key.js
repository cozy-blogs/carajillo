const fs = require('fs');
if (process.env.CAPTCHA_PROVIDER==='recaptcha') {
  if (!process.env.RECAPTCHA_SITE_KEY) {
    throw new Error('Missing RECAPTCHA_SITE_KEY configuration');
  }
  fs.mkdirSync('frontend/dist/api', {recursive: true});
  fs.writeFileSync('frontend/dist/api/recaptcha',
    JSON.stringify({success: true, recaptcha_site_key: process.env.RECAPTCHA_SITE_KEY}));
  console.log(`generated: ${process.cwd()}/frontend/dist/api/recaptcha`);
}