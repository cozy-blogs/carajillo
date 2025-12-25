// Simple string translations for non-Lit code
export const str = {
  // Subscription messages
  subscribeForNewsletter: 'Zapisz się do newslettera',
  subscriptionSuccessful: 'Subskrypcja zakończona sukcesem. Sprawdź swoją skrzynkę e-mail w celu potwierdzenia.',
  subscriptionFailed: (message: string) => `Subskrypcja nie powiodła się: ${message}`,
  tryLater: 'Zbyt wiele prób zapisu, spróbuj ponownie za chwilę.',
  
  // Error messages
  somethingWentWrong: 'Coś poszło nie tak.',
  cannotRetrieveCaptcha: 'Nie można pobrać klucza reCAPTCHA',
  recaptchaNotLoaded: 'Klucz reCAPTCHA nie został załadowany',
  missingAuthToken: 'brakujący token autoryzacji',
  
  // Form placeholders
  namePlaceholder: 'Imię',
  emailPlaceholder: 'E-mail',
};

