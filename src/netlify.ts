import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { HttpError } from './http';

interface JsonApiEntrypoint {
  (request: any): Promise<any>;
}

export function netlify(entrypoint: JsonApiEntrypoint): Handler {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Allow': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    //'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
  };

  return async (
    event: HandlerEvent,
    context: HandlerContext
  ) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {statusCode: 200, headers, body: JSON.stringify({})};
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      throw new HttpError(405, "Only POST reqeusts are allowed");
    }

    try {
      let body: any;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (error) {
        throw new HttpError(400, "Invalid JSON");
      }

      const response = await entrypoint(body);

      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify(response),
      };
    }
    catch (error) {
      return {
        statusCode: error instanceof HttpError ? error.statusCode : 500,
        headers: headers,
        body: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        })
      }
    }
  };
} 