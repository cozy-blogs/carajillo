import { Loops } from "../../backend/loops";
import { loadConfiguration } from "../../backend/config";
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'; 

export const handler :Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const config = loadConfiguration();
  const loops = new Loops(config);
  await loops.initialize();
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({success: true}),
  };
}