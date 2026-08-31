import { proxyBackendRequest } from "../../backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = proxyBackendRequest;
export const POST = proxyBackendRequest;
export const PUT = proxyBackendRequest;
export const PATCH = proxyBackendRequest;
export const DELETE = proxyBackendRequest;
