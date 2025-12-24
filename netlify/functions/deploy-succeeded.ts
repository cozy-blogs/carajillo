import { initialize } from "../../backend/loops";
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'; 

export const handler :Handler = async (event: HandlerEvent, context: HandlerContext) => {
  await initialize();
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({success: true}),
  };
}