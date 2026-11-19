import { timingSafeEqual } from "node:crypto";
import { RPC_PATH } from "@task-tracker/contracts";
import { Effect, type Scope } from "effect";
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http";

type RpcResponse = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | Scope.Scope
>;

interface RpcAccess {
  readonly host: string;
  readonly rendererOrigin: string;
  readonly credential: string;
}

/** Gates RPC and browser preflights before the RPC decoder reads a body. */
export function guardRpcRequest(rpc: RpcResponse, access: RpcAccess): RpcResponse {
  const expected = Buffer.from(`Bearer ${access.credential}`);
  const cors = {
    "access-control-allow-origin": access.rendererOrigin,
    "cache-control": "no-store",
    vary: "Origin",
  };
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (request.url !== RPC_PATH) {
      return HttpServerResponse.empty({ status: 404 });
    }
    if (request.headers.host !== access.host || request.headers.origin !== access.rendererOrigin) {
      return HttpServerResponse.empty({ status: 403, headers: { vary: "Origin, Host" } });
    }
    if (request.method === "OPTIONS") {
      return preflight(request, cors);
    }
    if (request.method !== "POST") {
      return HttpServerResponse.empty({
        status: 405,
        headers: { ...cors, allow: "POST, OPTIONS" },
      });
    }
    const authorization = Buffer.from(request.headers.authorization ?? "");
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      return HttpServerResponse.empty({ status: 401, headers: cors });
    }

    const authenticated = request.modify({
      headers: Headers.remove(request.headers, "authorization"),
    });
    return yield* rpc.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, authenticated),
      Effect.map(HttpServerResponse.setHeaders(cors)),
    );
  });
}

function preflight(request: HttpServerRequest.HttpServerRequest, cors: Headers.Input) {
  if (request.headers["access-control-request-method"] !== "POST") {
    return HttpServerResponse.empty({ status: 403, headers: { vary: "Origin" } });
  }
  return HttpServerResponse.empty({
    status: 204,
    headers: Headers.merge(
      Headers.fromInput(cors),
      Headers.fromInput({
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "authorization, content-type",
      }),
    ),
  });
}
