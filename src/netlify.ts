import { Handler as NetlifyHandler, HandlerEvent as NetlifyEvent, HandlerContext as NetlifyContext } from '@netlify/functions';
import { HttpError } from './http';

/**
 * Primary HTTP methods (verbs) for Json API defintions.
 * 
 * CRUD: Create (PUT), Read (GET), Update (PUT) and Delete.
 */
type CrudMethod = 'PUT' | 'GET' | 'POST' | 'DELETE';

interface MethodHandler {
  (request: any): Promise<any>;
}
type JsonApiEntrypoint = {
  [method in CrudMethod]?: MethodHandler;
};

type JsonObject = {
  [name: string]: any;
}

export function netlify(entrypoint: JsonApiEntrypoint): NetlifyHandler {
  const methods = Object.keys(entrypoint) as CrudMethod[];

  const headers = {
    // API
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Allow': [...methods, 'OPTIONS'].join(', '),
    // Allow cross origin requests
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    // do not cache responses
    'Cache-Control': 'no-store',
    // Security headers
    //'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
  };

  return async (
    event: NetlifyEvent,
    context: NetlifyContext
  ) => {
    console.log(`${event.httpMethod} ${event.rawUrl}`);
    if (event.headers.Origin)
      console.log(`Request Origin: ${event.headers.Origin}`);

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {statusCode: 200, headers, body: JSON.stringify({})};
    }

    if (!(event.httpMethod in entrypoint)) {
      throw new HttpError(405, `Only ${methods.join(', ')} reqeusts are allowed`);
    }
    const verb = event.httpMethod as CrudMethod;

    try {
      let parameters = eventParameters(event);
      const operation = entrypoint[verb] as MethodHandler;
      const response = await operation(parameters);

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

function eventParameters(event: NetlifyEvent): JsonObject {
  switch (event.httpMethod) {
    case 'GET':
      return event.queryStringParameters || {};
    case 'POST':
    case 'PUT':
    case 'DELETE':
      try {
        return JSON.parse(event.body || '{}');
      } catch (error) {
        throw new HttpError(400, 'Invalid JSON');
      }
    default:
      throw new HttpError(405, 'Method not allowed');
  }
}