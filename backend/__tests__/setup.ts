// Test setup file
// Mock environment variables before tests run
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-signing';
process.env.RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || 'test-recaptcha-secret';
process.env.RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || 'test-site-key';
process.env.CAPTCHA_PROVIDER = process.env.CAPTCHA_PROVIDER || 'recaptcha';
process.env.CAPTCHA_THRESHOLD = process.env.CAPTCHA_THRESHOLD || '0.5';
process.env.LOOPS_SO_SECRET = process.env.LOOPS_SO_SECRET || 'test-loops-api-key';
process.env.COMPANY_NAME = process.env.COMPANY_NAME || 'Test Company';
process.env.COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '123 Test St';
process.env.COMPANY_LOGO = process.env.COMPANY_LOGO || 'https://example.com/logo.png';
process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || '1 year';

