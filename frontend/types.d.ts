// Type declarations for global variables

interface Recaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
  // recaptcha v2
  //render(container: HTMLElement, options: { sitekey: string, theme?: 'light' | 'dark', size?: 'normal' | 'compact' }): void;
}

declare var grecaptcha: Recaptcha;
