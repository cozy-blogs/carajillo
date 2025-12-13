import { netlify } from './netlify';
import { verifyToken } from './recaptcha';

async function subscribe(request: any) {
  return {success: true, req: request};
}

export const handler = netlify(subscribe);