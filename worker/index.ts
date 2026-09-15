/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "people-pulse-th-kpi.brees2539.chatgpt.site") {
      if (request.method === "GET" || request.method === "HEAD") {
        const destination = new URL("https://peoplepulse.profaiprofit.com");
        destination.pathname = url.pathname;
        destination.search = url.search;
        return secureResponse(Response.redirect(destination, 308), url);
      }
      return secureResponse(Response.json(
        { error: "โดเมนนี้ย้ายแล้ว กรุณาส่งคำขอผ่าน peoplepulse.profaiprofit.com" },
        { status: 421, headers: { "cache-control": "private, no-store" } },
      ), url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secureResponse(response, url);
    }

    return secureResponse(await handler.fetch(request, env, ctx), url);
  },
};

function secureResponse(response: Response, requestUrl: URL) {
  const headers = new Headers(response.headers);
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", "base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-permitted-cross-domain-policies", "none");
  if (requestUrl.protocol === "https:") headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (requestUrl.pathname.startsWith("/api/")) {
    headers.set("cache-control", "private, no-store, max-age=0");
    const vary = new Set((headers.get("vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
    vary.add("Cookie");
    headers.set("vary", [...vary].join(", "));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default worker;
