// Simple string translations for non-Lit code
export const str = {
  // Subscription messages
  subscribeForNewsletter: 'Subscribe for newsletter',
  subscriptionSuccessful: 'Subscription successful. Check your email for confirmation.',
  subscriptionFailed: (message: string) => `Subscription failed: ${message}`,
  tryLater: 'Too many signups, please try again in a little while.',
  
  // Error messages
  somethingWentWrong: 'Something went wrong.',
  cannotRetrieveCaptcha: 'Cannot retrieve reCAPTCHA site key',
  recaptchaNotLoaded: 'reCAPTCHA site key not loaded',
  missingAuthToken: 'missing authorization token',
  
  // Form placeholders
  namePlaceholder: 'Name',
  emailPlaceholder: 'Email',
};

