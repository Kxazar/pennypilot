import { createState, handleAppRequest } from "../server.mjs";

const state = createState();

export default async function handler(request, response) {
  await handleAppRequest(request, response, state);
}
