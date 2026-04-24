import { createState, handleAppRequest } from "../server.mjs";

const state = createState();

export default async function handler(request, response) {
  const search = request.url?.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  request.url = `/api/gateway/balance${search}`;
  await handleAppRequest(request, response, state);
}
