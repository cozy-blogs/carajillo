// Type declarations for global variables

interface Grecaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare var grecaptcha: Grecaptcha;
