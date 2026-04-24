import { createState, handleAppRequest } from "../server.mjs";

const state = createState();

export default async function handler(request, response) {
  request.url = "/api/gateway/batch-facts";
  await handleAppRequest(request, response, state);
}
