#!/bin/bash
IFS=$'\t\n'
set -euo pipefail
cat <<EOF
# Sample carajillo configuration.
# See README.md for more details.

# Company information for email templates
COMPANY_NAME=Company Name # optional
COMPANY_ADDRESS=Company Address # optional
COMPANY_LOGO=https://example.com/logo.png # optional

# Domains where submission forms may be created
CORS_ORIGIN=example.com other.example.com # default: all submissions are accepted

# Number of proxies to trust
# @see https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues
# @see https://expressjs.com/en/guide/behind-proxies.html
NUMBER_OF_PROXIES=1 # default: 1

# Secret key for JWT token signing
JWT_SECRET=$(dd count=1 ibs=32 if=/dev/random status=none | base64) # required
# How long token in email confirmation link is valid
# After this time another confirmation email will be sent when needed
# See: https://github.com/vercel/ms#readme for time delta syntax
JWT_EXPIRATION=1 year # default: 1 year

# Loops.so API key
# https://app.loops.so/settings?page=api
LOOPS_SO_SECRET=your-secret-key-here # required

# CAPTCHA provider (recaptcha|none)
CAPTCHA_PROVIDER=recaptcha # default: 'recaptcha'
# CAPTCHA score threshold
CAPTCHA_THRESHOLD=0.5 # default: 0.5

# reCAPTCHA site key, secret key
# https://console.cloud.google.com/security/recaptcha/
RECAPTCHA_SITE_KEY=your-site-key # required for recaptcha
RECAPTCHA_SECRET=your-secret-key-here # required for recaptcha
EOF
