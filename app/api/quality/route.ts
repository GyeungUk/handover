import { proxyBackendRequest } from "../../backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A model-backed route waits on a reasoning model, which takes minutes on a real document
// rather than the seconds an ordinary proxy hop takes. This is the ceiling every Vercel
// plan allows; past it the platform kills the function and the browser sees a 504 rather
// than the backend's own Korean message.
export const maxDuration = 300;

export const GET = proxyBackendRequest;
export const POST = proxyBackendRequest;
export const PUT = proxyBackendRequest;
export const PATCH = proxyBackendRequest;
export const DELETE = proxyBackendRequest;
