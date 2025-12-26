#!/bin/bash
IFS=$'\t\n'
set -xeuo pipefail
npx netlify link
npx netlify env:import ${1:-.env}
npx netlify env:set JWT_SECRET --secret --force
npx netlify env:set RECAPTCHA_SECRET --secret --force
npx netlify env:set LOOPS_SO_SECRET --secret --force
