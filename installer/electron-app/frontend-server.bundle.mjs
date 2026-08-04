var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/routing/utils.js
function encodePathDelimiters(segment) {
  return segment.replace(PATH_DELIMITER_REGEX, (char) => encodeURIComponent(char));
}
function decodeRouteSegmentStrict(segment) {
  return encodePathDelimiters(decodeURIComponent(segment));
}
function normalizePathnameForRouteMatchStrict(pathname) {
  return pathname.split("/").map((segment) => decodeRouteSegmentStrict(segment)).join("/");
}
var PATH_DELIMITER_REGEX;
var init_utils = __esm({
  "node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/routing/utils.js"() {
    PATH_DELIMITER_REGEX = /([/#?\\]|%(2f|23|3f|5c))/gi;
  }
});

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/base-path.js
function hasBasePath(pathname, basePath) {
  if (!basePath) return false;
  return pathname === basePath || pathname.startsWith(basePath + "/");
}
function stripBasePath(pathname, basePath) {
  if (!hasBasePath(pathname, basePath)) return pathname;
  return pathname.slice(basePath.length) || "/";
}
function removeTrailingSlash(pathname) {
  if (pathname === "/") return "/";
  let end = pathname.length;
  while (end > 0 && pathname.charCodeAt(end - 1) === 47) end--;
  return end === 0 ? "/" : pathname.slice(0, end);
}
var init_base_path = __esm({
  "node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/base-path.js"() {
  }
});

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/routing/file-matcher.js
var init_file_matcher = __esm({
  "node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/routing/file-matcher.js"() {
  }
});

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/prod-server.js
init_utils();
init_base_path();

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/headers.js
var VINEXT_STATIC_FILE_HEADER = "x-vinext-static-file";
var VINEXT_MW_CTX_HEADER = "x-vinext-mw-ctx";
var VINEXT_PRERENDER_SECRET_HEADER = "x-vinext-prerender-secret";
var MIDDLEWARE_REQUEST_HEADER_PREFIX = "x-middleware-request-";
var MIDDLEWARE_OVERRIDE_HEADERS = "x-middleware-override-headers";
var MIDDLEWARE_SET_COOKIE_HEADER = "x-middleware-set-cookie";
var MIDDLEWARE_NEXT_HEADER = "x-middleware-next";
var MIDDLEWARE_REWRITE_HEADER = "x-middleware-rewrite";
var MIDDLEWARE_REDIRECT_HEADER = "x-middleware-redirect";
var MIDDLEWARE_SKIP_HEADER = "x-middleware-skip";
var INTERNAL_HEADERS = [
  MIDDLEWARE_REWRITE_HEADER,
  MIDDLEWARE_REDIRECT_HEADER,
  MIDDLEWARE_SET_COOKIE_HEADER,
  MIDDLEWARE_SKIP_HEADER,
  MIDDLEWARE_OVERRIDE_HEADERS,
  MIDDLEWARE_NEXT_HEADER,
  "x-now-route-matches",
  "x-matched-path",
  "x-nextjs-data",
  "x-next-resume-state-length"
];

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/normalize-path.js
function normalizePath(pathname) {
  if (pathname === "/" || pathname.length > 1 && pathname[0] === "/" && !pathname.includes("//") && !pathname.includes("/./") && !pathname.includes("/../") && !pathname.endsWith("/.") && !pathname.endsWith("/..")) return pathname;
  const segments = pathname.split("/");
  const resolved = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return "/" + resolved.join("/");
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/middleware-request-headers.js
var CREDENTIAL_REQUEST_HEADERS = ["authorization", "cookie"];
function getMiddlewareHeaderValue(source, key) {
  if (source instanceof Headers) return source.get(key);
  const value = source[key];
  if (value === void 0) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
function getOverrideHeaderNames(source) {
  const rawValue = getMiddlewareHeaderValue(source, MIDDLEWARE_OVERRIDE_HEADERS);
  if (rawValue === null) return null;
  return rawValue.split(",").map((key) => key.trim()).filter(Boolean);
}
function getForwardedRequestHeaders(source) {
  const forwardedHeaders = /* @__PURE__ */ new Map();
  if (source instanceof Headers) {
    for (const [key, value] of source.entries()) if (key.startsWith("x-middleware-request-")) forwardedHeaders.set(key.slice(MIDDLEWARE_REQUEST_HEADER_PREFIX.length), value);
    return forwardedHeaders;
  }
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith("x-middleware-request-")) continue;
    const normalizedValue = Array.isArray(value) ? value[0] ?? "" : value;
    forwardedHeaders.set(key.slice(MIDDLEWARE_REQUEST_HEADER_PREFIX.length), normalizedValue);
  }
  return forwardedHeaders;
}
function cloneHeaders(source) {
  const cloned = new Headers();
  for (const [key, value] of source.entries()) cloned.append(key, value);
  return cloned;
}
function buildRequestHeadersFromMiddlewareResponse(baseHeaders, middlewareHeaders, options = {}) {
  const overrideHeaderNames = getOverrideHeaderNames(middlewareHeaders);
  const forwardedHeaders = getForwardedRequestHeaders(middlewareHeaders);
  if (overrideHeaderNames === null && forwardedHeaders.size === 0) return null;
  const nextHeaders = overrideHeaderNames === null ? cloneHeaders(baseHeaders) : new Headers();
  if (overrideHeaderNames === null) {
    for (const [key, value] of forwardedHeaders) nextHeaders.set(key, value);
    return nextHeaders;
  }
  if (options.preserveCredentialHeaders) {
    const overrideHeaderNameSet = new Set(overrideHeaderNames);
    for (const key of CREDENTIAL_REQUEST_HEADERS) {
      if (overrideHeaderNameSet.has(key)) continue;
      const value = baseHeaders.get(key);
      if (value !== null) nextHeaders.set(key, value);
    }
  }
  for (const key of overrideHeaderNames) {
    const value = forwardedHeaders.get(key);
    if (value !== void 0) nextHeaders.set(key, value);
  }
  return nextHeaders;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/config/config-matchers.js
var _compiledPatternCache = /* @__PURE__ */ new Map();
var _compiledHeaderSourceCache = /* @__PURE__ */ new Map();
var _compiledConditionCache = /* @__PURE__ */ new Map();
var _compiledDestinationParamCache = /* @__PURE__ */ new Map();
function getCachedRegex(cache, key, compile) {
  let value = cache.get(key);
  if (value === void 0) {
    value = compile();
    cache.set(key, value);
  }
  return value;
}
var _LOCALE_STATIC_RE = /^\/:[\w-]+\(([^)]+)\)\?\/([a-zA-Z0-9_~.%@!$&'*+,;=:/-]+)$/;
var _redirectIndexCache = /* @__PURE__ */ new WeakMap();
function _getRedirectIndex(redirects) {
  let index = _redirectIndexCache.get(redirects);
  if (index !== void 0) return index;
  const localeStatic = /* @__PURE__ */ new Map();
  const linear = [];
  for (let i = 0; i < redirects.length; i++) {
    const redirect = redirects[i];
    const m = _LOCALE_STATIC_RE.exec(redirect.source);
    if (m) {
      const paramName = redirect.source.slice(2, redirect.source.indexOf("("));
      const alternation = m[1];
      const suffix = "/" + m[2];
      const altRe = safeRegExp("^(?:" + alternation + ")$");
      if (!altRe) {
        linear.push([i, redirect]);
        continue;
      }
      const entry = {
        paramName,
        altRe,
        redirect,
        originalIndex: i
      };
      const bucket = localeStatic.get(suffix);
      if (bucket) bucket.push(entry);
      else localeStatic.set(suffix, [entry]);
    } else linear.push([i, redirect]);
  }
  index = {
    localeStatic,
    linear
  };
  _redirectIndexCache.set(redirects, index);
  return index;
}
var HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);
var REQUEST_HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);
function stripHopByHopRequestHeaders(headers) {
  const connectionTokens = (headers.get("connection") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  for (const header of REQUEST_HOP_BY_HOP_HEADERS) headers.delete(header);
  for (const token of connectionTokens) headers.delete(token);
}
function isSafeRegex(pattern) {
  const quantifierAtDepth = [];
  let depth = 0;
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") {
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === "(") {
      depth++;
      if (quantifierAtDepth.length <= depth) quantifierAtDepth.push(false);
      else quantifierAtDepth[depth] = false;
      i++;
      continue;
    }
    if (ch === ")") {
      const hadQuantifier = depth > 0 && quantifierAtDepth[depth];
      if (depth > 0) depth--;
      const next = pattern[i + 1];
      if (next === "+" || next === "*" || next === "{") {
        if (hadQuantifier) return false;
        if (depth >= 0 && depth < quantifierAtDepth.length) quantifierAtDepth[depth] = true;
      }
      i++;
      continue;
    }
    if (ch === "+" || ch === "*") {
      if (depth > 0) quantifierAtDepth[depth] = true;
      i++;
      continue;
    }
    if (ch === "?") {
      const prev = i > 0 ? pattern[i - 1] : "";
      if (prev !== "+" && prev !== "*" && prev !== "?" && prev !== "}") {
        if (depth > 0) quantifierAtDepth[depth] = true;
      }
      i++;
      continue;
    }
    if (ch === "{") {
      let j = i + 1;
      while (j < pattern.length && /[\d,]/.test(pattern[j])) j++;
      if (j < pattern.length && pattern[j] === "}" && j > i + 1) {
        if (depth > 0) quantifierAtDepth[depth] = true;
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return true;
}
function safeRegExp(pattern, flags) {
  if (!isSafeRegex(pattern)) {
    console.warn(`[vinext] Ignoring potentially unsafe regex pattern (ReDoS risk): ${pattern}
  Patterns with nested quantifiers (e.g. (a+)+) can cause catastrophic backtracking.
  Simplify the pattern to avoid nested repetition.`);
    return null;
  }
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}
function escapeHeaderSource(source) {
  const S = "\uE000";
  const groups = [];
  const withPlaceholders = source.replace(/\(([^)]+)\)/g, (_m, inner) => {
    groups.push(inner);
    return `${S}G${groups.length - 1}${S}`;
  });
  let result = "";
  const re = new RegExp(`${S}G(\\d+)${S}|:[\\w-]+|[.+?*]|[^.+?*:\\uE000]+`, "g");
  let m;
  while ((m = re.exec(withPlaceholders)) !== null) if (m[1] !== void 0) result += `(${groups[Number(m[1])]})`;
  else if (m[0].startsWith(":")) {
    const constraintMatch = withPlaceholders.slice(re.lastIndex).match(new RegExp(`^${S}G(\\d+)${S}`));
    if (constraintMatch) {
      re.lastIndex += constraintMatch[0].length;
      result += `(${groups[Number(constraintMatch[1])]})`;
    } else result += "[^/]+";
  } else switch (m[0]) {
    case ".":
      result += "\\.";
      break;
    case "+":
      result += "\\+";
      break;
    case "?":
      result += "\\?";
      break;
    case "*":
      result += ".*";
      break;
    default:
      result += m[0];
      break;
  }
  return result;
}
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}
function requestContextFromRequest(request) {
  const url = new URL(request.url);
  return {
    headers: request.headers,
    cookies: parseCookies(request.headers.get("cookie")),
    query: url.searchParams,
    host: normalizeHost(request.headers.get("host"), url.hostname)
  };
}
function normalizeHost(hostHeader, fallbackHostname) {
  return (hostHeader ?? fallbackHostname).split(":", 1)[0].toLowerCase();
}
function applyMiddlewareRequestHeaders(middlewareHeaders, request, options = {}) {
  const nextHeaders = buildRequestHeadersFromMiddlewareResponse(request.headers, middlewareHeaders, options);
  for (const key of Object.keys(middlewareHeaders)) if (key.startsWith("x-middleware-")) delete middlewareHeaders[key];
  if (nextHeaders) request = new Request(request.url, {
    method: request.method,
    headers: nextHeaders,
    body: request.body,
    duplex: request.body ? "half" : void 0
  });
  return {
    request,
    postMwReqCtx: requestContextFromRequest(request)
  };
}
function _emptyParams() {
  return /* @__PURE__ */ Object.create(null);
}
function _matchConditionValue(actualValue, expectedValue) {
  if (expectedValue === void 0) return _emptyParams();
  const re = _cachedConditionRegex(expectedValue);
  if (re) {
    const match = re.exec(actualValue);
    if (!match) return null;
    const params = _emptyParams();
    if (match.groups) {
      for (const [key, value] of Object.entries(match.groups)) if (value !== void 0) params[key] = value;
    }
    return params;
  }
  return actualValue === expectedValue ? _emptyParams() : null;
}
function matchSingleCondition(condition, ctx) {
  switch (condition.type) {
    case "header": {
      const headerValue = ctx.headers.get(condition.key);
      if (headerValue === null) return null;
      return _matchConditionValue(headerValue, condition.value);
    }
    case "cookie": {
      const cookieValue = ctx.cookies[condition.key];
      if (cookieValue === void 0) return null;
      return _matchConditionValue(cookieValue, condition.value);
    }
    case "query": {
      const queryValue = ctx.query.get(condition.key);
      if (queryValue === null) return null;
      return _matchConditionValue(queryValue, condition.value);
    }
    case "host":
      if (condition.value !== void 0) return _matchConditionValue(ctx.host, condition.value);
      return ctx.host === condition.key ? _emptyParams() : null;
    default:
      return null;
  }
}
function _cachedConditionRegex(value) {
  return getCachedRegex(_compiledConditionCache, value, () => safeRegExp(`^${value}$`));
}
function collectConditionParams(has, missing, ctx) {
  const params = _emptyParams();
  if (has) for (const condition of has) {
    const conditionParams = matchSingleCondition(condition, ctx);
    if (!conditionParams) return null;
    Object.assign(params, conditionParams);
  }
  if (missing) {
    for (const condition of missing) if (matchSingleCondition(condition, ctx)) return null;
  }
  return params;
}
function checkHasConditions(has, missing, ctx) {
  return collectConditionParams(has, missing, ctx) !== null;
}
function extractConstraint(str, re) {
  if (str[re.lastIndex] !== "(") return null;
  const start = re.lastIndex + 1;
  let depth = 1;
  let i = start;
  while (i < str.length && depth > 0) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") depth--;
    i++;
  }
  if (depth !== 0) return null;
  re.lastIndex = i;
  return str.slice(start, i - 1);
}
function matchConfigPattern(pathname, pattern) {
  if (pattern.includes("(") || pattern.includes("\\") || /:[\w-]+[*+][^/]/.test(pattern) || /:[\w-]+\./.test(pattern)) try {
    const compiled = getCachedRegex(_compiledPatternCache, pattern, () => {
      const paramNames = [];
      let regexStr = "";
      const tokenRe = /:([\w-]+)|[.]|[^:.]+/g;
      let tok;
      while ((tok = tokenRe.exec(pattern)) !== null) if (tok[1] !== void 0) {
        const name = tok[1];
        const rest = pattern.slice(tokenRe.lastIndex);
        if (rest.startsWith("*") || rest.startsWith("+")) {
          const quantifier = rest[0];
          tokenRe.lastIndex += 1;
          const constraint = extractConstraint(pattern, tokenRe);
          paramNames.push(name);
          if (constraint !== null) regexStr += `(${constraint})`;
          else regexStr += quantifier === "*" ? "(.*)" : "(.+)";
        } else {
          const constraint = extractConstraint(pattern, tokenRe);
          paramNames.push(name);
          regexStr += constraint !== null ? `(${constraint})` : "([^/]+)";
        }
      } else if (tok[0] === ".") regexStr += "\\.";
      else regexStr += tok[0];
      const re = safeRegExp("^" + regexStr + "$");
      return re ? {
        re,
        paramNames
      } : null;
    });
    if (!compiled) return null;
    const match = compiled.re.exec(pathname);
    if (!match) return null;
    const params2 = /* @__PURE__ */ Object.create(null);
    for (let i = 0; i < compiled.paramNames.length; i++) params2[compiled.paramNames[i]] = match[i + 1] ?? "";
    return params2;
  } catch {
  }
  const catchAllMatch = pattern.match(/:([\w-]+)(\*|\+)$/);
  if (catchAllMatch) {
    const prefix = pattern.slice(0, pattern.lastIndexOf(":"));
    const paramName = catchAllMatch[1];
    const isPlus = catchAllMatch[2] === "+";
    const prefixNoSlash = prefix.replace(/\/$/, "");
    if (!pathname.startsWith(prefixNoSlash)) return null;
    const charAfter = pathname[prefixNoSlash.length];
    if (charAfter !== void 0 && charAfter !== "/") return null;
    const rest = pathname.slice(prefixNoSlash.length);
    if (isPlus && (!rest || rest === "/")) return null;
    let restValue = rest.startsWith("/") ? rest.slice(1) : rest;
    return { [paramName]: restValue };
  }
  const parts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (parts.length !== pathParts.length) return null;
  const params = /* @__PURE__ */ Object.create(null);
  for (let i = 0; i < parts.length; i++) if (parts[i].startsWith(":")) params[parts[i].slice(1)] = pathParts[i];
  else if (parts[i] !== pathParts[i]) return null;
  return params;
}
function matchRedirect(pathname, redirects, ctx) {
  if (redirects.length === 0) return null;
  const index = _getRedirectIndex(redirects);
  let localeMatch = null;
  let localeMatchIndex = Infinity;
  if (index.localeStatic.size > 0) {
    const noLocaleBucket = index.localeStatic.get(pathname);
    if (noLocaleBucket) for (const entry of noLocaleBucket) {
      if (entry.originalIndex >= localeMatchIndex) continue;
      const redirect = entry.redirect;
      const conditionParams = redirect.has || redirect.missing ? collectConditionParams(redirect.has, redirect.missing, ctx) : _emptyParams();
      if (!conditionParams) continue;
      localeMatch = {
        destination: substituteAndSanitizeDestination(redirect.destination, {
          [entry.paramName]: "",
          ...conditionParams
        }),
        permanent: redirect.permanent
      };
      localeMatchIndex = entry.originalIndex;
      break;
    }
    const slashTwo = pathname.indexOf("/", 1);
    if (slashTwo !== -1) {
      const suffix = pathname.slice(slashTwo);
      const localePart = pathname.slice(1, slashTwo);
      const localeBucket = index.localeStatic.get(suffix);
      if (localeBucket) for (const entry of localeBucket) {
        if (entry.originalIndex >= localeMatchIndex) continue;
        if (!entry.altRe.test(localePart)) continue;
        const redirect = entry.redirect;
        const conditionParams = redirect.has || redirect.missing ? collectConditionParams(redirect.has, redirect.missing, ctx) : _emptyParams();
        if (!conditionParams) continue;
        localeMatch = {
          destination: substituteAndSanitizeDestination(redirect.destination, {
            [entry.paramName]: localePart,
            ...conditionParams
          }),
          permanent: redirect.permanent
        };
        localeMatchIndex = entry.originalIndex;
        break;
      }
    }
  }
  for (const [origIdx, redirect] of index.linear) {
    if (origIdx >= localeMatchIndex) break;
    const params = matchConfigPattern(pathname, redirect.source);
    if (params) {
      const conditionParams = redirect.has || redirect.missing ? collectConditionParams(redirect.has, redirect.missing, ctx) : _emptyParams();
      if (!conditionParams) continue;
      return {
        destination: substituteAndSanitizeDestination(redirect.destination, {
          ...params,
          ...conditionParams
        }),
        permanent: redirect.permanent
      };
    }
  }
  return localeMatch;
}
function matchRewrite(pathname, rewrites, ctx) {
  for (const rewrite of rewrites) {
    const params = matchConfigPattern(pathname, rewrite.source);
    if (params) {
      const conditionParams = rewrite.has || rewrite.missing ? collectConditionParams(rewrite.has, rewrite.missing, ctx) : _emptyParams();
      if (!conditionParams) continue;
      return substituteAndSanitizeDestination(rewrite.destination, {
        ...params,
        ...conditionParams
      });
    }
  }
  return null;
}
function substituteDestinationParams(destination, params) {
  const keys = Object.keys(params);
  if (keys.length === 0) return destination;
  const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
  const cacheKey = sortedKeys.join("\0");
  let paramRe = _compiledDestinationParamCache.get(cacheKey);
  if (!paramRe) {
    const paramAlternation = sortedKeys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    paramRe = new RegExp(`:(${paramAlternation})([+*])?(?![A-Za-z0-9_])`, "g");
    _compiledDestinationParamCache.set(cacheKey, paramRe);
  }
  return destination.replace(paramRe, (_token, key) => params[key]);
}
function substituteAndSanitizeDestination(destination, params) {
  return sanitizeDestination(substituteDestinationParams(destination, params));
}
function sanitizeDestination(dest) {
  if (dest.startsWith("http://") || dest.startsWith("https://")) return dest;
  dest = dest.replace(/^[\\/]+/, "/");
  return dest;
}
function isExternalUrl(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}
async function proxyExternalRequest(request, externalUrl) {
  const originalUrl = new URL(request.url);
  const targetUrl = new URL(externalUrl);
  const destinationKeys = new Set(targetUrl.searchParams.keys());
  for (const [key, value] of originalUrl.searchParams) if (!destinationKeys.has(key)) targetUrl.searchParams.append(key, value);
  const headers = new Headers(request.headers);
  headers.set("host", targetUrl.host);
  stripHopByHopRequestHeaders(headers);
  const keysToDelete = [];
  for (const key of headers.keys()) if (key.startsWith("x-middleware-")) keysToDelete.push(key);
  for (const key of keysToDelete) headers.delete(key);
  headers.delete(VINEXT_PRERENDER_SECRET_HEADER);
  headers.delete(VINEXT_MW_CTX_HEADER);
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const init = {
    method,
    headers,
    redirect: "manual"
  };
  if (hasBody && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3e4);
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl.href, {
      ...init,
      signal: controller.signal
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error("[vinext] External rewrite proxy timeout:", targetUrl.href);
      return new Response("Gateway Timeout", { status: 504 });
    }
    console.error("[vinext] External rewrite proxy error:", e);
    return new Response("Bad Gateway", { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
  const isNodeRuntime = typeof process !== "undefined" && !!process.versions?.node;
  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    if (isNodeRuntime && (lower === "content-encoding" || lower === "content-length")) return;
    responseHeaders.append(key, value);
  });
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}
function matchHeaders(pathname, headers, ctx) {
  const result = [];
  for (const rule of headers) {
    const sourceRegex = getCachedRegex(_compiledHeaderSourceCache, rule.source, () => safeRegExp("^" + escapeHeaderSource(rule.source) + "$"));
    if (sourceRegex && sourceRegex.test(pathname)) {
      if (rule.has || rule.missing) {
        if (!checkHasConditions(rule.has, rule.missing, ctx)) continue;
      }
      result.push(...rule.headers);
    }
  }
  return result;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/http-error-responses.js
function notFoundResponse(init) {
  return new Response("Not Found", {
    status: 404,
    headers: init?.headers
  });
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/request-pipeline.js
init_base_path();
function isOpenRedirectShaped(rawPathname) {
  if (!rawPathname.startsWith("/")) return false;
  const afterSlash = rawPathname.slice(1);
  if (afterSlash.startsWith("/") || afterSlash.startsWith("\\")) return true;
  if (afterSlash.length >= 3 && afterSlash[0] === "%") {
    const encoded = afterSlash.slice(0, 3).toLowerCase();
    if (encoded === "%5c" || encoded === "%2f") return true;
  }
  return false;
}
function findHeaderRecordKey(headers, lowerName) {
  for (const key of Object.keys(headers)) if (key.toLowerCase() === lowerName) return key;
}
function appendHeaderRecord(headers, lowerName, value) {
  const key = findHeaderRecordKey(headers, lowerName) ?? lowerName;
  const existing = headers[key];
  if (existing === void 0) {
    headers[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  headers[key] = [existing, value];
}
function appendVaryHeaderRecord(headers, value) {
  const key = findHeaderRecordKey(headers, "vary") ?? "vary";
  const existing = headers[key];
  if (existing === void 0) {
    headers[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  headers[key] = existing + ", " + value;
}
function applyConfigHeadersToHeaderRecord(headers, options) {
  const matched = matchHeaders(options.pathname, options.configHeaders, options.requestContext);
  for (const header of matched) {
    const lowerName = header.key.toLowerCase();
    if (lowerName === "set-cookie") appendHeaderRecord(headers, lowerName, header.value);
    else if (lowerName === "vary") appendVaryHeaderRecord(headers, header.value);
    else if (findHeaderRecordKey(headers, lowerName) === void 0) headers[lowerName] = header.value;
  }
}
function filterInternalHeaders(headers) {
  const filtered = new Headers();
  for (const [key, value] of headers) if (!INTERNAL_HEADERS.includes(key.toLowerCase())) filtered.append(key, value);
  return filtered;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/socket-error-backstop.js
var SOCKET_BACKSTOP_FLAG = Symbol.for("vinext.socketErrorBackstop");
function peerDisconnectCode(err) {
  const code = err?.code;
  return code === "ECONNRESET" || code === "EPIPE" || code === "ECONNABORTED" ? code : void 0;
}
function installSocketErrorBackstop() {
  const proc = process;
  if (proc[SOCKET_BACKSTOP_FLAG]) return;
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") return;
  proc[SOCKET_BACKSTOP_FLAG] = true;
  const debug = process.env.VINEXT_DEBUG_SOCKET_ERRORS === "1";
  if (debug) console.warn("[vinext] socket-error backstop installed");
  process.on("uncaughtException", (err) => {
    if (process.env.VINEXT_PRERENDER === "1") throw err;
    const code = peerDisconnectCode(err);
    if (code) {
      if (debug) console.warn(`[vinext] absorbed uncaughtException ${code}`);
      return;
    }
    throw err;
  });
  process.on("unhandledRejection", (reason) => {
    if (process.env.VINEXT_PRERENDER === "1") throw reason;
    const code = peerDisconnectCode(reason);
    if (code) {
      if (debug) console.warn(`[vinext] absorbed unhandledRejection ${code}`);
      return;
    }
    throw reason;
  });
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/manifest-paths.js
function normalizeManifestFile(file) {
  return file.startsWith("/") ? file.slice(1) : file;
}
function manifestFileWithBase(file, base) {
  const normalizedFile = normalizeManifestFile(file);
  if (!base || base === "/") return normalizedFile;
  const normalizedBase = normalizeManifestFile(base).replace(/\/+$/, "");
  if (!normalizedBase) return normalizedFile;
  if (normalizedFile.startsWith(normalizedBase + "/")) return normalizedFile;
  return normalizedBase + "/" + normalizedFile;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/static-file-cache.js
import path from "node:path";
import fsp from "node:fs/promises";
var CONTENT_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".map": "application/json",
  ".rsc": "text/x-component"
};
var BUFFER_THRESHOLD = 64 * 1024;
var StaticFileCache = class StaticFileCache2 {
  entries;
  constructor(entries) {
    this.entries = entries;
  }
  /**
  * Scan the client directory and build the cache.
  *
  * Gracefully handles non-existent directories (returns an empty cache).
  */
  static async create(clientDir) {
    const entries = /* @__PURE__ */ new Map();
    const allFiles = /* @__PURE__ */ new Map();
    for await (const { relativePath, fullPath, stat } of walkFilesWithStats(clientDir)) allFiles.set(relativePath, {
      fullPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
    for (const [relativePath, fileInfo] of allFiles) {
      if (relativePath.endsWith(".br") || relativePath.endsWith(".gz") || relativePath.endsWith(".zst")) continue;
      if (relativePath.startsWith(".vite/") || relativePath === ".vite") continue;
      const ext = path.extname(relativePath);
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
      const isHashed = relativePath.startsWith("assets/");
      const cacheControl = isHashed ? "public, max-age=31536000, immutable" : "public, max-age=3600";
      const etag = isHashed && etagFromFilenameHash(relativePath, ext) || `W/"${fileInfo.size}-${Math.floor(fileInfo.mtimeMs / 1e3)}"`;
      const baseHeaders = {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        ETag: etag
      };
      const original = {
        path: fileInfo.fullPath,
        size: fileInfo.size,
        headers: {
          ...baseHeaders,
          "Content-Length": String(fileInfo.size)
        }
      };
      const entry = {
        etag,
        notModifiedHeaders: {
          ETag: etag,
          "Cache-Control": cacheControl
        },
        original
      };
      const brInfo = allFiles.get(relativePath + ".br");
      if (brInfo) entry.br = buildVariant(brInfo, baseHeaders, "br");
      const gzInfo = allFiles.get(relativePath + ".gz");
      if (gzInfo) entry.gz = buildVariant(gzInfo, baseHeaders, "gzip");
      const zstInfo = allFiles.get(relativePath + ".zst");
      if (zstInfo) entry.zst = buildVariant(zstInfo, baseHeaders, "zstd");
      if (entry.br || entry.gz || entry.zst) {
        original.headers["Vary"] = "Accept-Encoding";
        entry.notModifiedHeaders["Vary"] = "Accept-Encoding";
      }
      const pathname = "/" + relativePath;
      entries.set(pathname, entry);
      if (ext === ".html") if (relativePath.endsWith("/index.html")) {
        const dirPath = "/" + relativePath.slice(0, -11);
        if (dirPath !== "/") entries.set(dirPath, entry);
      } else {
        const withoutExt = "/" + relativePath.slice(0, -ext.length);
        entries.set(withoutExt, entry);
      }
    }
    const toBuffer = [];
    const seenEntries = /* @__PURE__ */ new Set();
    for (const entry of entries.values()) {
      if (seenEntries.has(entry)) continue;
      seenEntries.add(entry);
      for (const variant of [
        entry.original,
        entry.br,
        entry.gz,
        entry.zst
      ]) {
        if (!variant || variant.size > BUFFER_THRESHOLD) continue;
        toBuffer.push(variant);
      }
    }
    for (let i = 0; i < toBuffer.length; i += 64) await Promise.all(toBuffer.slice(i, i + 64).map(async (v) => {
      v.buffer = await fsp.readFile(v.path);
    }));
    return new StaticFileCache2(entries);
  }
  /**
  * Look up cached metadata for a URL pathname.
  *
  * Returns undefined if the file is not in the cache. The root path "/"
  * always returns undefined — index.html is served by SSR/RSC.
  */
  lookup(pathname) {
    if (pathname === "/") return void 0;
    if (pathname.startsWith("/.vite/") || pathname === "/.vite") return void 0;
    return this.entries.get(pathname);
  }
};
function etagFromFilenameHash(relativePath, ext) {
  const basename = path.basename(relativePath, ext);
  const lastDash = basename.lastIndexOf("-");
  if (lastDash === -1 || lastDash === basename.length - 1) return null;
  const suffix = basename.slice(lastDash + 1);
  return suffix.length >= 6 && suffix.length <= 12 && /^[A-Za-z0-9_-]+$/.test(suffix) ? `W/"${suffix}"` : null;
}
function buildVariant(info, baseHeaders, encoding) {
  return {
    path: info.fullPath,
    size: info.size,
    headers: {
      ...baseHeaders,
      "Content-Encoding": encoding,
      "Content-Length": String(info.size),
      Vary: "Accept-Encoding"
    }
  };
}
var STAT_BATCH_SIZE = 64;
async function* walkFilesWithStats(dir, base = dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFilesWithStats(fullPath, base);
    else if (entry.isFile()) files.push(fullPath);
  }
  for (let i = 0; i < files.length; i += STAT_BATCH_SIZE) {
    const batch = files.slice(i, i + STAT_BATCH_SIZE);
    const stats = await Promise.all(batch.map((f) => fsp.stat(f)));
    for (let j = 0; j < batch.length; j++) yield {
      relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),
      fullPath: batch[j],
      stat: {
        size: stats[j].size,
        mtimeMs: stats[j].mtimeMs
      }
    };
  }
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/image-optimization.js
var DEFAULT_DEVICE_SIZES = [
  640,
  750,
  828,
  1080,
  1200,
  1920,
  2048,
  3840
];
var DEFAULT_IMAGE_SIZES = [
  16,
  32,
  48,
  64,
  96,
  128,
  256,
  384
];
var ABSOLUTE_MAX_WIDTH = 3840;
function parseImageParams(url, allowedWidths) {
  const imageUrl = url.searchParams.get("url");
  if (!imageUrl) return null;
  const w = parseInt(url.searchParams.get("w") || "0", 10);
  const q = parseInt(url.searchParams.get("q") || "75", 10);
  if (Number.isNaN(w) || w < 0) return null;
  if (w > ABSOLUTE_MAX_WIDTH) return null;
  if (allowedWidths && w !== 0 && !allowedWidths.includes(w)) return null;
  if (Number.isNaN(q) || q < 1 || q > 100) return null;
  const normalizedUrl = imageUrl.replaceAll("\\", "/");
  if (!normalizedUrl.startsWith("/") || normalizedUrl.startsWith("//")) return null;
  try {
    const base = "https://localhost";
    if (new URL(normalizedUrl, base).origin !== base) return null;
  } catch {
    return null;
  }
  return {
    imageUrl: normalizedUrl,
    width: w,
    quality: q
  };
}
var SAFE_IMAGE_CONTENT_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/bmp",
  "image/tiff"
]);
function isSafeImageContentType(contentType, dangerouslyAllowSVG = false) {
  if (!contentType) return false;
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (SAFE_IMAGE_CONTENT_TYPES.has(mediaType)) return true;
  if (dangerouslyAllowSVG && mediaType === "image/svg+xml") return true;
  return false;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/lazy-chunks.js
function computeLazyChunks(buildManifest) {
  const eagerFiles = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const queue = [];
  for (const key of Object.keys(buildManifest)) if (buildManifest[key].isEntry) queue.push(key);
  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || visited.has(key)) continue;
    visited.add(key);
    const chunk = buildManifest[key];
    if (!chunk) continue;
    eagerFiles.add(chunk.file);
    if (chunk.css) for (const cssFile of chunk.css) eagerFiles.add(cssFile);
    if (chunk.imports) {
      for (const imp of chunk.imports) if (!visited.has(imp)) queue.push(imp);
    }
  }
  const lazyChunks = [];
  const allFiles = /* @__PURE__ */ new Set();
  for (const key of Object.keys(buildManifest)) {
    const chunk = buildManifest[key];
    if (chunk.file && !allFiles.has(chunk.file)) {
      allFiles.add(chunk.file);
      if (!eagerFiles.has(chunk.file) && chunk.file.endsWith(".js")) lazyChunks.push(chunk.file);
    }
  }
  return lazyChunks;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/safe-json-file.js
import fs from "node:fs";
function readJsonFile(filePath, options) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    options?.onError?.(err);
    return null;
  }
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/build/server-manifest.js
import path2 from "node:path";
function readPrerenderSecret(serverDir) {
  return readJsonFile(path2.join(serverDir, "vinext-server.json"))?.prerenderSecret;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/internal/als-registry.js
import { AsyncLocalStorage } from "node:async_hooks";
var _g = globalThis;
function getOrCreateAls(key) {
  const sym = Symbol.for(key);
  return _g[sym] ??= new AsyncLocalStorage();
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/unified-request-context.js
var _REQUEST_CONTEXT_ALS_KEY = Symbol.for("vinext.requestContext.als");
var _als = getOrCreateAls("vinext.unifiedRequestContext.als");

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/request-context.js
var _als2 = getOrCreateAls("vinext.requestContext.als");

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/headers.js
var _FALLBACK_KEY = Symbol.for("vinext.nextHeadersShim.fallback");
var _g2 = globalThis;
var _als3 = getOrCreateAls("vinext.nextHeadersShim.als");
var _fallbackState = _g2[_FALLBACK_KEY] ??= {
  headersContext: null,
  dynamicUsageDetected: false,
  invalidDynamicUsageError: null,
  pendingSetCookies: [],
  draftModeCookieHeader: null,
  phase: "render"
};
var EXPIRED_COOKIE_DATE = (/* @__PURE__ */ new Date(0)).toUTCString();
var _USE_CACHE_ALS_KEY = Symbol.for("vinext.cacheRuntime.contextAls");
var _UNSTABLE_CACHE_ALS_KEY = Symbol.for("vinext.unstableCache.als");
var DRAFT_MODE_EXPIRED_DATE = (/* @__PURE__ */ new Date(0)).toUTCString();

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/hash.js
function fnv1a64(input) {
  let h1 = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = h1 * 16777619 >>> 0;
  }
  let h2 = 84696351;
  for (let i = 0; i < input.length; i++) {
    h2 ^= input.charCodeAt(i);
    h2 = h2 * 16777619 >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/internal/work-unit-async-storage.js
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
var workUnitAsyncStorage = new AsyncLocalStorage2();

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/utils/cache-control-metadata.js
function isUnknownRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readRecordField(ctx, field) {
  const value = ctx?.[field];
  return isUnknownRecord(value) ? value : void 0;
}
function readCacheControlNumberField(ctx, field) {
  const value = readRecordField(ctx, "cacheControl")?.[field] ?? ctx?.[field];
  return typeof value === "number" ? value : void 0;
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/shims/cache.js
function readStringArrayField(ctx, field) {
  const value = ctx?.[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}
var MemoryCacheHandler = class {
  store = /* @__PURE__ */ new Map();
  tagRevalidatedAt = /* @__PURE__ */ new Map();
  async get(key, _ctx) {
    const entry = this.store.get(key);
    if (!entry) return null;
    for (const tag of entry.tags) {
      const revalidatedAt = this.tagRevalidatedAt.get(tag);
      if (revalidatedAt && revalidatedAt >= entry.lastModified) {
        this.store.delete(key);
        return null;
      }
    }
    for (const tag of readStringArrayField(_ctx, "softTags")) {
      const revalidatedAt = this.tagRevalidatedAt.get(tag);
      if (revalidatedAt && revalidatedAt >= entry.lastModified) return null;
    }
    if (entry.expireAt !== null && Date.now() > entry.expireAt) {
      this.store.delete(key);
      return null;
    }
    if (entry.revalidateAt !== null && Date.now() > entry.revalidateAt) return {
      lastModified: entry.lastModified,
      value: entry.value,
      cacheState: "stale",
      cacheControl: entry.cacheControl
    };
    return {
      lastModified: entry.lastModified,
      value: entry.value,
      cacheControl: entry.cacheControl
    };
  }
  async set(key, data, ctx) {
    const tagSet = /* @__PURE__ */ new Set();
    if (data && "tags" in data && Array.isArray(data.tags)) for (const t of data.tags) tagSet.add(t);
    for (const t of readStringArrayField(ctx, "tags")) tagSet.add(t);
    const tags = [...tagSet];
    let effectiveRevalidate;
    let effectiveExpire;
    effectiveRevalidate = readCacheControlNumberField(ctx, "revalidate");
    effectiveExpire = readCacheControlNumberField(ctx, "expire");
    if (data && "revalidate" in data && typeof data.revalidate === "number") effectiveRevalidate = data.revalidate;
    if (effectiveRevalidate === 0) return;
    const now = Date.now();
    const revalidateAt = typeof effectiveRevalidate === "number" && effectiveRevalidate > 0 ? now + effectiveRevalidate * 1e3 : null;
    const expireAt = typeof effectiveExpire === "number" && effectiveExpire > 0 ? now + effectiveExpire * 1e3 : null;
    const cacheControl = typeof effectiveRevalidate === "number" ? effectiveExpire === void 0 ? { revalidate: effectiveRevalidate } : {
      revalidate: effectiveRevalidate,
      expire: effectiveExpire
    } : void 0;
    this.store.set(key, {
      value: data,
      tags,
      lastModified: now,
      revalidateAt,
      expireAt,
      cacheControl
    });
  }
  async revalidateTag(tags, _durations) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    const now = Date.now();
    for (const tag of tagList) this.tagRevalidatedAt.set(tag, now);
  }
  resetRequestCache() {
  }
};
var _HANDLER_KEY = Symbol.for("vinext.cacheHandler");
var _gHandler = globalThis;
function _getActiveHandler() {
  return _gHandler[_HANDLER_KEY] ?? (_gHandler[_HANDLER_KEY] = new MemoryCacheHandler());
}
function getCacheHandler() {
  return _getActiveHandler();
}
var _resolvedIOPromise = Promise.resolve(void 0);
_resolvedIOPromise.status = "fulfilled";
_resolvedIOPromise.value = void 0;
var _FALLBACK_KEY2 = Symbol.for("vinext.cache.fallback");
var _g3 = globalThis;
var _cacheAls = getOrCreateAls("vinext.cache.als");
var _cacheFallbackState = _g3[_FALLBACK_KEY2] ??= {
  actionRevalidationKind: 0,
  requestScopedCacheLife: null,
  unstableCacheRevalidation: "foreground"
};
var _unstableCacheAls = getOrCreateAls("vinext.unstableCache.als");
var _UNSTABLE_CACHE_PENDING_REVALIDATIONS_KEY = Symbol.for("vinext.unstableCache.pendingRevalidations");

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/isr-cache.js
var _PENDING_REGEN_KEY = Symbol.for("vinext.isrCache.pendingRegenerations");
var _g4 = globalThis;
var pendingRegenerations = _g4[_PENDING_REGEN_KEY] ??= /* @__PURE__ */ new Map();
function normalizeCachePathname(pathname) {
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
}
function buildCacheKey(prefix, pathname, suffix) {
  const normalized = normalizeCachePathname(pathname);
  const suffixPart = suffix ? `:${suffix}` : "";
  const key = `${prefix}:${normalized}${suffixPart}`;
  if (key.length <= 200) return key;
  return `${prefix}:__hash:${fnv1a64(normalized)}${suffixPart}`;
}
function isrCacheKey(router, pathname, buildId) {
  return buildCacheKey(buildId ? `${router}:${buildId}` : router, pathname);
}
var MAX_REVALIDATE_ENTRIES = 1e4;
var _REVALIDATE_KEY = Symbol.for("vinext.isrCache.revalidateDurations");
var revalidateDurations = _g4[_REVALIDATE_KEY] ??= /* @__PURE__ */ new Map();
function setRevalidateDuration(key, seconds) {
  revalidateDurations.delete(key);
  revalidateDurations.set(key, seconds);
  while (revalidateDurations.size > MAX_REVALIDATE_ENTRIES) {
    const first = revalidateDurations.keys().next().value;
    if (first !== void 0) revalidateDurations.delete(first);
    else break;
  }
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/build/prerender.js
init_file_matcher();
import os from "node:os";
var DEFAULT_CONCURRENCY = Math.min(os.availableParallelism(), 8);
var RSC_CHUNK_SCRIPT_PREFIX = "self.__VINEXT_RSC_CHUNKS__=self.__VINEXT_RSC_CHUNKS__||[];";
var RSC_CHUNK_FULL_PREFIX = `${RSC_CHUNK_SCRIPT_PREFIX}self.__VINEXT_RSC_CHUNKS__.push(`;
function getOutputPath(urlPath, trailingSlash) {
  if (urlPath === "/") return "index.html";
  const clean = urlPath.replace(/^\//, "");
  if (trailingSlash) return `${clean}/index.html`;
  return `${clean}.html`;
}
function getRscOutputPath(urlPath) {
  if (urlPath === "/") return "index.rsc";
  return urlPath.replace(/^\//, "") + ".rsc";
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/seed-cache.js
import fs2 from "node:fs";
import path3 from "node:path";
async function seedMemoryCacheFromPrerender(serverDir) {
  const manifestPath = path3.join(serverDir, "vinext-prerender.json");
  if (!fs2.existsSync(manifestPath)) return 0;
  let manifest;
  try {
    manifest = JSON.parse(fs2.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.warn("[vinext] Failed to parse vinext-prerender.json, skipping cache seeding:", err);
    return 0;
  }
  const { buildId, routes } = manifest;
  if (!buildId || !Array.isArray(routes)) return 0;
  const trailingSlash = manifest.trailingSlash ?? false;
  const prerenderDir = path3.join(serverDir, "prerendered-routes");
  const handler = getCacheHandler();
  let seeded = 0;
  for (const route of routes) {
    if (route.status !== "rendered") continue;
    if (route.router !== "app") continue;
    const pathname = route.path ?? route.route;
    const baseKey = isrCacheKey("app", pathname, buildId);
    const revalidateSeconds = typeof route.revalidate === "number" ? route.revalidate : void 0;
    const expireSeconds = typeof route.expire === "number" ? route.expire : void 0;
    if (await seedHtml(handler, prerenderDir, baseKey, pathname, trailingSlash, revalidateSeconds, expireSeconds)) {
      await seedRsc(handler, prerenderDir, baseKey, pathname, revalidateSeconds, expireSeconds);
      seeded++;
    }
  }
  return seeded;
}
function revalidateCtx(revalidateSeconds, expireSeconds) {
  if (revalidateSeconds === void 0) return {};
  return expireSeconds === void 0 ? {
    cacheControl: { revalidate: revalidateSeconds },
    revalidate: revalidateSeconds
  } : {
    cacheControl: {
      revalidate: revalidateSeconds,
      expire: expireSeconds
    },
    revalidate: revalidateSeconds
  };
}
async function seedHtml(handler, prerenderDir, baseKey, pathname, trailingSlash, revalidateSeconds, expireSeconds) {
  const relPath = getOutputPath(pathname, trailingSlash);
  const fullPath = path3.join(prerenderDir, relPath);
  if (!fs2.existsSync(fullPath)) return false;
  const htmlValue = {
    kind: "APP_PAGE",
    html: fs2.readFileSync(fullPath, "utf-8"),
    rscData: void 0,
    headers: void 0,
    postponed: void 0,
    status: void 0
  };
  const key = baseKey + ":html";
  await handler.set(key, htmlValue, revalidateCtx(revalidateSeconds, expireSeconds));
  if (revalidateSeconds !== void 0) setRevalidateDuration(key, revalidateSeconds);
  return true;
}
async function seedRsc(handler, prerenderDir, baseKey, pathname, revalidateSeconds, expireSeconds) {
  const relPath = getRscOutputPath(pathname);
  const fullPath = path3.join(prerenderDir, relPath);
  if (!fs2.existsSync(fullPath)) return;
  const rscBuffer = fs2.readFileSync(fullPath);
  const rscValue = {
    kind: "APP_PAGE",
    html: "",
    rscData: rscBuffer.buffer.slice(rscBuffer.byteOffset, rscBuffer.byteOffset + rscBuffer.byteLength),
    headers: void 0,
    postponed: void 0,
    status: void 0
  };
  const key = baseKey + ":rsc";
  await handler.set(key, rscValue, revalidateCtx(revalidateSeconds, expireSeconds));
  if (revalidateSeconds !== void 0) setRevalidateDuration(key, revalidateSeconds);
}

// node_modules/.pnpm/vinext@0.0.50_@vitejs+plugi_6558342ba0b940cbd621b36b626ca262/node_modules/vinext/dist/server/prod-server.js
import fs3 from "node:fs";
import path4 from "node:path";
import fsp2 from "node:fs/promises";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { createServer } from "node:http";
import { Readable, pipeline } from "node:stream";
function readNodeStream(req) {
  return new ReadableStream({ start(controller) {
    req.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
    req.on("end", () => controller.close());
    req.on("error", (err) => controller.error(err));
  } });
}
var COMPRESSIBLE_TYPES = /* @__PURE__ */ new Set([
  "text/html",
  "text/css",
  "text/plain",
  "text/xml",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "image/svg+xml",
  "application/manifest+json",
  "application/wasm"
]);
var HAS_ZSTD = typeof zlib.createZstdCompress === "function";
function negotiateEncoding(req) {
  const accept = req.headers["accept-encoding"];
  if (!accept || typeof accept !== "string") return null;
  const lower = accept.toLowerCase();
  if (HAS_ZSTD && lower.includes("zstd")) return "zstd";
  if (lower.includes("br")) return "br";
  if (lower.includes("gzip")) return "gzip";
  if (lower.includes("deflate")) return "deflate";
  return null;
}
function createCompressor(encoding, mode = "default") {
  switch (encoding) {
    case "zstd":
      return zlib.createZstdCompress({
        ...mode === "streaming" ? { flush: zlib.constants.ZSTD_e_flush } : {},
        params: { [zlib.constants.ZSTD_c_compressionLevel]: 3 }
      });
    case "br":
      return zlib.createBrotliCompress({
        ...mode === "streaming" ? { flush: zlib.constants.BROTLI_OPERATION_FLUSH } : {},
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
      });
    case "gzip":
      return zlib.createGzip({
        level: 6,
        ...mode === "streaming" ? { flush: zlib.constants.Z_SYNC_FLUSH } : {}
      });
    case "deflate":
      return zlib.createDeflate({
        level: 6,
        ...mode === "streaming" ? { flush: zlib.constants.Z_SYNC_FLUSH } : {}
      });
  }
}
function mergeResponseHeaders(middlewareHeaders, response) {
  const merged = { ...middlewareHeaders };
  response.headers.forEach((v, k) => {
    if (k === "set-cookie") return;
    merged[k] = v;
  });
  const responseCookies = response.headers.getSetCookie?.() ?? [];
  if (responseCookies.length > 0) {
    const existing = merged["set-cookie"];
    merged["set-cookie"] = [...existing ? Array.isArray(existing) ? existing : [existing] : [], ...responseCookies];
  }
  return merged;
}
function toWebHeaders(headersRecord) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(headersRecord)) if (Array.isArray(value)) for (const item of value) headers.append(key, item);
  else headers.set(key, value);
  return headers;
}
var NO_BODY_RESPONSE_STATUSES = /* @__PURE__ */ new Set([
  204,
  205,
  304
]);
function hasHeader(headersRecord, name) {
  const target = name.toLowerCase();
  return Object.keys(headersRecord).some((key) => key.toLowerCase() === target);
}
function omitHeadersCaseInsensitive(headersRecord, names) {
  const targets = new Set(names.map((name) => name.toLowerCase()));
  const filtered = {};
  for (const [key, value] of Object.entries(headersRecord)) {
    if (targets.has(key.toLowerCase())) continue;
    filtered[key] = value;
  }
  return filtered;
}
function matchesIfNoneMatchHeader(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch === "*") return true;
  return ifNoneMatch.split(",").map((value) => value.trim()).some((value) => value === etag);
}
function stripHeaders(headersRecord, names) {
  const targets = new Set(names.map((name) => name.toLowerCase()));
  for (const key of Object.keys(headersRecord)) if (targets.has(key.toLowerCase())) delete headersRecord[key];
}
function isNoBodyResponseStatus(status) {
  return NO_BODY_RESPONSE_STATUSES.has(status);
}
function cancelResponseBody(response) {
  const body = response.body;
  if (!body || body.locked) return;
  body.cancel().catch(() => {
  });
}
function isVinextStreamedHtmlResponse(response) {
  return response.__vinextStreamedHtmlResponse === true;
}
function logProdServerStarted(host, port, purpose) {
  const url = `http://${host}:${port}`;
  if (purpose === "prerender") {
    console.log(`[vinext] Production server for prerendering running at ${url}`);
    return;
  }
  console.log(`[vinext] Production server running at ${url}`);
}
function mergeWebResponse(middlewareHeaders, response, statusOverride) {
  const filteredMiddlewareHeaders = omitHeadersCaseInsensitive(middlewareHeaders, ["content-length"]);
  const status = statusOverride ?? response.status;
  const mergedHeaders = mergeResponseHeaders(filteredMiddlewareHeaders, response);
  const shouldDropBody = isNoBodyResponseStatus(status);
  const shouldStripStreamLength = isVinextStreamedHtmlResponse(response) && hasHeader(mergedHeaders, "content-length");
  if (!Object.keys(filteredMiddlewareHeaders).length && statusOverride === void 0 && !shouldDropBody && !shouldStripStreamLength) return response;
  if (shouldDropBody) {
    cancelResponseBody(response);
    stripHeaders(mergedHeaders, [
      "content-encoding",
      "content-length",
      "content-type",
      "transfer-encoding"
    ]);
    return new Response(null, {
      status,
      statusText: status === response.status ? response.statusText : void 0,
      headers: toWebHeaders(mergedHeaders)
    });
  }
  if (shouldStripStreamLength) stripHeaders(mergedHeaders, ["content-length"]);
  return new Response(response.body, {
    status,
    statusText: status === response.status ? response.statusText : void 0,
    headers: toWebHeaders(mergedHeaders)
  });
}
function sendCompressed(req, res, body, contentType, statusCode, extraHeaders = {}, compress = true, statusText) {
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  const baseType = contentType.split(";")[0].trim();
  const encoding = compress ? negotiateEncoding(req) : null;
  const headersWithoutBodyHeaders = omitHeadersCaseInsensitive(extraHeaders, ["content-length", "content-type"]);
  const writeHead = (headers) => {
    if (statusText) res.writeHead(statusCode, statusText, headers);
    else res.writeHead(statusCode, headers);
  };
  if (encoding && COMPRESSIBLE_TYPES.has(baseType) && buf.length >= 1024) {
    const compressor = createCompressor(encoding);
    const rawVary = extraHeaders["Vary"] ?? extraHeaders["vary"];
    const existingVary = Array.isArray(rawVary) ? rawVary.join(", ") : rawVary;
    let varyValue;
    if (existingVary) varyValue = existingVary.toLowerCase().includes("accept-encoding") ? existingVary : existingVary + ", Accept-Encoding";
    else varyValue = "Accept-Encoding";
    writeHead({
      ...headersWithoutBodyHeaders,
      "Content-Type": contentType,
      "Content-Encoding": encoding,
      Vary: varyValue
    });
    compressor.end(buf);
    pipeline(compressor, res, () => {
    });
  } else {
    writeHead({
      ...headersWithoutBodyHeaders,
      "Content-Type": contentType,
      "Content-Length": String(buf.length)
    });
    res.end(buf);
  }
}
async function tryServeStatic(req, res, clientDir, pathname, compress, cache, extraHeaders, statusCode) {
  if (pathname === "/") return false;
  const responseStatus = statusCode ?? 200;
  const omitBody = isNoBodyResponseStatus(responseStatus);
  if (cache) {
    let lookupPath;
    if (pathname.includes("%")) {
      try {
        lookupPath = decodeURIComponent(pathname);
      } catch {
        return false;
      }
      if (lookupPath.startsWith("/.vite/") || lookupPath === "/.vite") return false;
    } else {
      if (pathname.startsWith("/.vite/") || pathname === "/.vite") return false;
      lookupPath = pathname;
    }
    const entry = cache.lookup(lookupPath);
    if (!entry) return false;
    const ifNoneMatch2 = req.headers["if-none-match"];
    if (responseStatus === 200 && typeof ifNoneMatch2 === "string" && matchesIfNoneMatchHeader(ifNoneMatch2, entry.etag)) {
      if (extraHeaders) res.writeHead(304, {
        ...entry.notModifiedHeaders,
        ...extraHeaders
      });
      else res.writeHead(304, entry.notModifiedHeaders);
      res.end();
      return true;
    }
    const rawAe = compress ? req.headers["accept-encoding"] : void 0;
    const ae = typeof rawAe === "string" ? rawAe.toLowerCase() : void 0;
    const variant = ae ? ae.includes("zstd") && entry.zst || ae.includes("br") && entry.br || ae.includes("gzip") && entry.gz || entry.original : entry.original;
    if (extraHeaders) res.writeHead(responseStatus, {
      ...variant.headers,
      ...extraHeaders
    });
    else res.writeHead(responseStatus, variant.headers);
    if (omitBody || req.method === "HEAD") {
      res.end();
      return true;
    }
    if (variant.buffer) res.end(variant.buffer);
    else pipeline(fs3.createReadStream(variant.path), res, (err) => {
      if (err) {
        console.warn(`[vinext] Static file stream error for ${variant.path}:`, err.message);
        res.destroy(err);
      }
    });
    return true;
  }
  const resolvedClient = path4.resolve(clientDir);
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decodedPathname.startsWith("/.vite/") || decodedPathname === "/.vite") return false;
  const staticFile = path4.resolve(clientDir, "." + decodedPathname);
  if (!staticFile.startsWith(resolvedClient + path4.sep) && staticFile !== resolvedClient) return false;
  const resolved = await resolveStaticFile(staticFile);
  if (!resolved) return false;
  const ext = path4.extname(resolved.path);
  const ct = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const isHashed = pathname.startsWith("/assets/");
  const cacheControl = isHashed ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  const etag = isHashed && etagFromFilenameHash(resolved.path, ext) || `W/"${resolved.size}-${Math.floor(resolved.mtimeMs / 1e3)}"`;
  const baseType = ct.split(";")[0].trim();
  const isCompressible = compress && COMPRESSIBLE_TYPES.has(baseType);
  const ifNoneMatch = req.headers["if-none-match"];
  if (responseStatus === 200 && typeof ifNoneMatch === "string" && matchesIfNoneMatchHeader(ifNoneMatch, etag)) {
    const notModifiedHeaders = {
      ETag: etag,
      "Cache-Control": cacheControl,
      ...isCompressible ? { Vary: "Accept-Encoding" } : void 0,
      ...extraHeaders
    };
    res.writeHead(304, notModifiedHeaders);
    res.end();
    return true;
  }
  const baseHeaders = {
    "Content-Type": ct,
    "Cache-Control": cacheControl,
    ETag: etag,
    ...extraHeaders
  };
  if (isCompressible) {
    const encoding = negotiateEncoding(req);
    if (encoding) {
      res.writeHead(responseStatus, {
        ...baseHeaders,
        "Content-Encoding": encoding,
        Vary: "Accept-Encoding"
      });
      if (omitBody || req.method === "HEAD") {
        res.end();
        return true;
      }
      const compressor = createCompressor(encoding);
      pipeline(fs3.createReadStream(resolved.path), compressor, res, (err) => {
        if (err) {
          console.warn(`[vinext] Static file stream error for ${resolved.path}:`, err.message);
          res.destroy(err);
        }
      });
      return true;
    }
  }
  res.writeHead(responseStatus, {
    ...baseHeaders,
    "Content-Length": String(resolved.size)
  });
  if (omitBody || req.method === "HEAD") {
    res.end();
    return true;
  }
  pipeline(fs3.createReadStream(resolved.path), res, (err) => {
    if (err) {
      console.warn(`[vinext] Static file stream error for ${resolved.path}:`, err.message);
      res.destroy(err);
    }
  });
  return true;
}
async function resolveStaticFile(staticFile) {
  const stat = await statIfFile(staticFile);
  if (stat) return {
    path: staticFile,
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
  const htmlFallback = staticFile + ".html";
  const htmlStat = await statIfFile(htmlFallback);
  if (htmlStat) return {
    path: htmlFallback,
    size: htmlStat.size,
    mtimeMs: htmlStat.mtimeMs
  };
  const indexFallback = path4.join(staticFile, "index.html");
  const indexStat = await statIfFile(indexFallback);
  if (indexStat) return {
    path: indexFallback,
    size: indexStat.size,
    mtimeMs: indexStat.mtimeMs
  };
  return null;
}
async function statIfFile(filePath) {
  try {
    const stat = await fsp2.stat(filePath);
    return stat.isFile() ? {
      size: stat.size,
      mtimeMs: stat.mtimeMs
    } : null;
  } catch {
    return null;
  }
}
function resolveHost(req, fallback) {
  const rawForwarded = req.headers["x-forwarded-host"];
  const hostHeader = req.headers.host;
  if (rawForwarded) {
    const forwardedHost = rawForwarded.split(",")[0].trim().toLowerCase();
    if (forwardedHost && trustedHosts.has(forwardedHost)) return forwardedHost;
  }
  return hostHeader || fallback;
}
var trustedHosts = new Set((process.env.VINEXT_TRUSTED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
var trustProxy = process.env.VINEXT_TRUST_PROXY === "1" || trustedHosts.size > 0;
function nodeToWebRequest(req, urlOverride) {
  const rawProto = trustProxy ? req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() : void 0;
  const origin = `${rawProto === "https" || rawProto === "http" ? rawProto : "http"}://${resolveHost(req, "localhost")}`;
  const url = new URL(urlOverride ?? req.url ?? "/", origin);
  const rawHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) for (const v of value) rawHeaders.append(key, v);
    else rawHeaders.set(key, value);
  }
  const headers = filterInternalHeaders(rawHeaders);
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const init = {
    method,
    headers
  };
  if (hasBody) {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}
async function sendWebResponse(webResponse, req, res, compress) {
  const status = webResponse.status;
  const statusText = webResponse.statusText || void 0;
  const writeHead = (headers) => {
    if (statusText) res.writeHead(status, statusText, headers);
    else res.writeHead(status, headers);
  };
  const nodeHeaders = {};
  webResponse.headers.forEach((value, key) => {
    const existing = nodeHeaders[key];
    if (existing !== void 0) nodeHeaders[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    else nodeHeaders[key] = value;
  });
  if (!webResponse.body) {
    writeHead(nodeHeaders);
    res.end();
    return;
  }
  const alreadyEncoded = webResponse.headers.has("content-encoding");
  const baseType = (webResponse.headers.get("content-type") ?? "").split(";")[0].trim();
  const encoding = compress && !alreadyEncoded ? negotiateEncoding(req) : null;
  const shouldCompress = !!(encoding && COMPRESSIBLE_TYPES.has(baseType));
  if (shouldCompress) {
    delete nodeHeaders["content-length"];
    delete nodeHeaders["Content-Length"];
    nodeHeaders["Content-Encoding"] = encoding;
    const existingVary = nodeHeaders["Vary"] ?? nodeHeaders["vary"];
    if (existingVary) {
      if (!String(existingVary).toLowerCase().includes("accept-encoding")) nodeHeaders["Vary"] = existingVary + ", Accept-Encoding";
    } else nodeHeaders["Vary"] = "Accept-Encoding";
  }
  writeHead(nodeHeaders);
  if (req.method === "HEAD") {
    cancelResponseBody(webResponse);
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(webResponse.body);
  if (shouldCompress) pipeline(nodeStream, createCompressor(encoding, "streaming"), res, () => {
  });
  else pipeline(nodeStream, res, () => {
  });
}
async function startProdServer(options = {}) {
  installSocketErrorBackstop();
  const { port = process.env.PORT ? parseInt(process.env.PORT) : 3e3, host = "0.0.0.0", outDir = path4.resolve("dist"), noCompression = false, purpose } = options;
  const compress = !noCompression;
  const resolvedOutDir = path4.resolve(outDir);
  const clientDir = path4.join(resolvedOutDir, "client");
  const rscEntryPath = path4.join(resolvedOutDir, "server", "index.js");
  const serverEntryPath = path4.join(resolvedOutDir, "server", "entry.js");
  const isAppRouter = fs3.existsSync(rscEntryPath);
  if (!isAppRouter && !fs3.existsSync(serverEntryPath)) {
    console.error(`[vinext] No build output found in ${outDir}`);
    console.error("Run `vinext build` first.");
    process.exit(1);
  }
  if (isAppRouter) return startAppRouterServer({
    port,
    host,
    clientDir,
    rscEntryPath,
    compress,
    purpose
  });
  return startPagesRouterServer({
    port,
    host,
    clientDir,
    serverEntryPath,
    compress,
    purpose
  });
}
function createNodeExecutionContext() {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch(() => {
      });
    },
    passThroughOnException() {
    }
  };
}
function resolveAppRouterHandler(entry) {
  if (typeof entry === "function") return (request) => Promise.resolve(entry(request));
  if (entry && typeof entry === "object" && "fetch" in entry) {
    const workerEntry = entry;
    if (typeof workerEntry.fetch === "function") return (request) => Promise.resolve(workerEntry.fetch(request, void 0, createNodeExecutionContext()));
  }
  console.error("[vinext] App Router entry must export either a default handler function or a Worker-style default export with fetch()");
  process.exit(1);
}
async function startAppRouterServer(options) {
  const { port, host, clientDir, rscEntryPath, compress, purpose } = options;
  let imageConfig;
  const imageConfigPath = path4.join(path4.dirname(rscEntryPath), "image-config.json");
  if (fs3.existsSync(imageConfigPath)) try {
    imageConfig = JSON.parse(fs3.readFileSync(imageConfigPath, "utf-8"));
  } catch {
  }
  const prerenderSecret = readPrerenderSecret(path4.dirname(rscEntryPath));
  const rscMtime = fs3.statSync(rscEntryPath).mtimeMs;
  const rscHandler = resolveAppRouterHandler((await import(`${pathToFileURL(rscEntryPath).href}?t=${rscMtime}`)).default);
  const seededRoutes = await seedMemoryCacheFromPrerender(path4.dirname(rscEntryPath));
  if (seededRoutes > 0) console.log(`[vinext] Seeded ${seededRoutes} pre-rendered route${seededRoutes !== 1 ? "s" : ""} into memory cache`);
  const staticCache = await StaticFileCache.create(clientDir);
  const handleRequest = async (req, res) => {
    const rawUrl = req.url ?? "/";
    const rawPathname = rawUrl.split("?")[0];
    if (isOpenRedirectShaped(rawPathname)) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    const normalizedRawPathname = rawPathname.replaceAll("\\", "/");
    let pathname;
    try {
      pathname = normalizePath(normalizePathnameForRouteMatchStrict(normalizedRawPathname));
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
    if (pathname === "/__vinext/prerender/static-params" || pathname === "/__vinext/prerender/pages-static-paths") {
      const secret = req.headers[VINEXT_PRERENDER_SECRET_HEADER];
      if (!prerenderSecret || secret !== prerenderSecret) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
    }
    if (pathname.startsWith("/assets/") && await tryServeStatic(req, res, clientDir, pathname, compress, staticCache)) return;
    if (pathname === "/_vinext/image") {
      const params = parseImageParams(new URL(rawUrl, "http://localhost"), [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]);
      if (!params) {
        res.writeHead(400);
        res.end("Bad Request");
        return;
      }
      if (!isSafeImageContentType(CONTENT_TYPES[path4.extname(params.imageUrl).toLowerCase()] ?? "application/octet-stream", imageConfig?.dangerouslyAllowSVG)) {
        res.writeHead(400);
        res.end("The requested resource is not an allowed image type");
        return;
      }
      const imageSecurityHeaders = {
        "Content-Security-Policy": imageConfig?.contentSecurityPolicy ?? "script-src 'none'; frame-src 'none'; sandbox;",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": imageConfig?.contentDispositionType === "attachment" ? "attachment" : "inline"
      };
      if (await tryServeStatic(req, res, clientDir, params.imageUrl, false, staticCache, imageSecurityHeaders)) return;
      res.writeHead(404);
      res.end("Image not found");
      return;
    }
    try {
      const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
      const response = await rscHandler(nodeToWebRequest(req, pathname + qs));
      const staticFileSignal = response.headers.get(VINEXT_STATIC_FILE_HEADER);
      if (staticFileSignal) {
        let staticFilePath = "/";
        try {
          staticFilePath = decodeURIComponent(staticFileSignal);
        } catch {
          staticFilePath = staticFileSignal;
        }
        const staticResponseHeaders = omitHeadersCaseInsensitive(mergeResponseHeaders({}, response), [
          VINEXT_STATIC_FILE_HEADER,
          "content-encoding",
          "content-length",
          "content-type"
        ]);
        const served = await tryServeStatic(req, res, clientDir, staticFilePath, compress, staticCache, staticResponseHeaders, response.status);
        cancelResponseBody(response);
        if (served) return;
        await sendWebResponse(notFoundResponse({ headers: toWebHeaders(staticResponseHeaders) }), req, res, compress);
        return;
      }
      await sendWebResponse(response, req, res, compress);
    } catch (e) {
      console.error("[vinext] Server error:", e);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  };
  const server = createServer((req, res) => {
    handleRequest(req, res);
  });
  await new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr2 = server.address();
      logProdServerStarted(host, typeof addr2 === "object" && addr2 ? addr2.port : port, purpose);
      resolve();
    });
  });
  const addr = server.address();
  return {
    server,
    port: typeof addr === "object" && addr ? addr.port : port
  };
}
function isPagesServerEntryPageRoute(value) {
  if (!value || typeof value !== "object" || !("pattern" in value)) return false;
  if (typeof value.pattern !== "string") return false;
  if (!("module" in value) || value.module === void 0) return true;
  const pageModule = value.module;
  if (!pageModule || typeof pageModule !== "object") return false;
  return !("getStaticPaths" in pageModule) || typeof pageModule.getStaticPaths === "function";
}
function readPagesServerEntryPageRoutes(value) {
  return Array.isArray(value) && value.every(isPagesServerEntryPageRoute) ? value : void 0;
}
async function startPagesRouterServer(options) {
  const { port, host, clientDir, serverEntryPath, compress, purpose } = options;
  const serverMtime = fs3.statSync(serverEntryPath).mtimeMs;
  const serverEntry = await import(`${pathToFileURL(serverEntryPath).href}?t=${serverMtime}`);
  const { renderPage, handleApiRoute: handleApi, runMiddleware, vinextConfig } = serverEntry;
  const matchPageRoute = typeof serverEntry.matchPageRoute === "function" ? serverEntry.matchPageRoute : void 0;
  const pageRoutes = readPagesServerEntryPageRoutes(serverEntry.pageRoutes);
  const prerenderSecret = readPrerenderSecret(path4.dirname(serverEntryPath));
  const basePath = vinextConfig?.basePath ?? "";
  const assetBase = basePath ? `${basePath}/` : "/";
  const trailingSlash = vinextConfig?.trailingSlash ?? false;
  const configRedirects = vinextConfig?.redirects ?? [];
  const configRewrites = vinextConfig?.rewrites ?? {
    beforeFiles: [],
    afterFiles: [],
    fallback: []
  };
  const configHeaders = vinextConfig?.headers ?? [];
  const allowedImageWidths = [...vinextConfig?.images?.deviceSizes ?? DEFAULT_DEVICE_SIZES, ...vinextConfig?.images?.imageSizes ?? DEFAULT_IMAGE_SIZES];
  const pagesImageConfig = vinextConfig?.images ? {
    dangerouslyAllowSVG: vinextConfig.images.dangerouslyAllowSVG,
    dangerouslyAllowLocalIP: vinextConfig.images.dangerouslyAllowLocalIP,
    contentDispositionType: vinextConfig.images.contentDispositionType,
    contentSecurityPolicy: vinextConfig.images.contentSecurityPolicy
  } : void 0;
  let ssrManifest = {};
  const manifestPath = path4.join(clientDir, ".vite", "ssr-manifest.json");
  if (fs3.existsSync(manifestPath)) ssrManifest = JSON.parse(fs3.readFileSync(manifestPath, "utf-8"));
  const buildManifestPath = path4.join(clientDir, ".vite", "manifest.json");
  if (fs3.existsSync(buildManifestPath)) try {
    const lazyChunks = computeLazyChunks(JSON.parse(fs3.readFileSync(buildManifestPath, "utf-8"))).map((file) => manifestFileWithBase(file, assetBase));
    if (lazyChunks.length > 0) globalThis.__VINEXT_LAZY_CHUNKS__ = lazyChunks;
  } catch {
  }
  const staticCache = await StaticFileCache.create(clientDir);
  const handleRequest = async (req, res) => {
    const rawUrl = req.url ?? "/";
    const rawPagesPathnameBeforeNormalize = rawUrl.split("?")[0];
    if (isOpenRedirectShaped(rawPagesPathnameBeforeNormalize)) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    const rawPagesPathname = rawPagesPathnameBeforeNormalize.replaceAll("\\", "/");
    const rawQs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
    let pathname;
    try {
      pathname = normalizePath(normalizePathnameForRouteMatchStrict(rawPagesPathname));
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
    let url = pathname + rawQs;
    if (pathname === "/__vinext/prerender/pages-static-paths") {
      const secret = req.headers[VINEXT_PRERENDER_SECRET_HEADER];
      if (!prerenderSecret || secret !== prerenderSecret) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const parsedUrl = new URL(rawUrl, "http://localhost");
      const pattern = parsedUrl.searchParams.get("pattern") ?? "";
      const localesRaw = parsedUrl.searchParams.get("locales");
      const locales = localesRaw ? JSON.parse(localesRaw) : [];
      const defaultLocale = parsedUrl.searchParams.get("defaultLocale") ?? "";
      const fn = pageRoutes?.find((r) => r.pattern === pattern)?.module?.getStaticPaths;
      if (typeof fn !== "function") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("null");
        return;
      }
      try {
        const result = await fn({
          locales,
          defaultLocale
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
      return;
    }
    const staticLookupPath = stripBasePath(pathname, basePath);
    if (staticLookupPath.startsWith("/assets/") && await tryServeStatic(req, res, clientDir, staticLookupPath, compress, staticCache)) return;
    if (pathname === "/_vinext/image" || staticLookupPath === "/_vinext/image") {
      const params = parseImageParams(new URL(rawUrl, "http://localhost"), allowedImageWidths);
      if (!params) {
        res.writeHead(400);
        res.end("Bad Request");
        return;
      }
      if (!isSafeImageContentType(CONTENT_TYPES[path4.extname(params.imageUrl).toLowerCase()] ?? "application/octet-stream", pagesImageConfig?.dangerouslyAllowSVG)) {
        res.writeHead(400);
        res.end("The requested resource is not an allowed image type");
        return;
      }
      const imageSecurityHeaders = {
        "Content-Security-Policy": pagesImageConfig?.contentSecurityPolicy ?? "script-src 'none'; frame-src 'none'; sandbox;",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": pagesImageConfig?.contentDispositionType === "attachment" ? "attachment" : "inline"
      };
      if (await tryServeStatic(req, res, clientDir, params.imageUrl, false, staticCache, imageSecurityHeaders)) return;
      res.writeHead(404);
      res.end("Image not found");
      return;
    }
    try {
      {
        const stripped = stripBasePath(pathname, basePath);
        if (stripped !== pathname) {
          url = stripped + (url.includes("?") ? url.slice(url.indexOf("?")) : "");
          pathname = stripped;
        }
      }
      if (pathname !== "/" && pathname !== "/api" && !pathname.startsWith("/api/")) {
        const hasTrailing = pathname.endsWith("/");
        if (trailingSlash && !hasTrailing) {
          const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
          res.writeHead(308, { Location: basePath + pathname + "/" + qs });
          res.end();
          return;
        } else if (!trailingSlash && hasTrailing) {
          const qs = url.includes("?") ? url.slice(url.indexOf("?")) : "";
          res.writeHead(308, { Location: basePath + removeTrailingSlash(pathname) + qs });
          res.end();
          return;
        }
      }
      const rawProtocol = trustProxy ? req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() : void 0;
      const protocol = rawProtocol === "https" || rawProtocol === "http" ? rawProtocol : "http";
      const hostHeader = resolveHost(req, `${host}:${port}`);
      const reqHeaders = filterInternalHeaders(Object.entries(req.headers).reduce((h, [k, v]) => {
        if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v);
        return h;
      }, new Headers()));
      const method = req.method ?? "GET";
      const hasBody = method !== "GET" && method !== "HEAD";
      let webRequest = new Request(`${protocol}://${hostHeader}${url}`, {
        method,
        headers: reqHeaders,
        body: hasBody ? readNodeStream(req) : void 0,
        duplex: hasBody ? "half" : void 0
      });
      const reqCtx = requestContextFromRequest(webRequest);
      if (configRedirects.length) {
        const redirect = matchRedirect(pathname, configRedirects, reqCtx);
        if (redirect) {
          const dest = sanitizeDestination(basePath && !isExternalUrl(redirect.destination) && !hasBasePath(redirect.destination, basePath) ? basePath + redirect.destination : redirect.destination);
          res.writeHead(redirect.permanent ? 308 : 307, { Location: dest });
          res.end();
          return;
        }
      }
      let resolvedUrl = url;
      const middlewareHeaders = {};
      let middlewareStatus;
      if (typeof runMiddleware === "function") {
        const result = await runMiddleware(webRequest, void 0);
        if (result.waitUntilPromises && result.waitUntilPromises.length > 0) Promise.allSettled(result.waitUntilPromises);
        if (!result.continue) {
          if (result.redirectUrl) {
            const redirectHeaders = { Location: result.redirectUrl };
            if (result.responseHeaders) for (const [key, value] of result.responseHeaders) {
              const existing = redirectHeaders[key];
              if (existing === void 0) redirectHeaders[key] = value;
              else if (Array.isArray(existing)) existing.push(value);
              else redirectHeaders[key] = [existing, value];
            }
            res.writeHead(result.redirectStatus ?? 307, redirectHeaders);
            res.end();
            return;
          }
          if (result.response) {
            const body = Buffer.from(await result.response.arrayBuffer());
            const respHeaders = {};
            result.response.headers.forEach((value, key) => {
              if (key === "set-cookie") return;
              respHeaders[key] = value;
            });
            const setCookies = result.response.headers.getSetCookie?.() ?? [];
            if (setCookies.length > 0) respHeaders["set-cookie"] = setCookies;
            if (result.response.statusText) res.writeHead(result.response.status, result.response.statusText, respHeaders);
            else res.writeHead(result.response.status, respHeaders);
            res.end(body);
            return;
          }
        }
        if (result.responseHeaders) for (const [key, value] of result.responseHeaders) if (key === "set-cookie") {
          const existing = middlewareHeaders[key];
          if (Array.isArray(existing)) existing.push(value);
          else if (existing) middlewareHeaders[key] = [existing, value];
          else middlewareHeaders[key] = [value];
        } else middlewareHeaders[key] = value;
        if (result.rewriteUrl) resolvedUrl = result.rewriteUrl;
        middlewareStatus = result.status ?? result.rewriteStatus;
      }
      const { postMwReqCtx, request: postMwReq } = applyMiddlewareRequestHeaders(middlewareHeaders, webRequest, { preserveCredentialHeaders: isExternalUrl(resolvedUrl) });
      webRequest = postMwReq;
      let resolvedPathname = resolvedUrl.split("?")[0];
      if (configHeaders.length) applyConfigHeadersToHeaderRecord(middlewareHeaders, {
        configHeaders,
        pathname,
        requestContext: reqCtx
      });
      if (isExternalUrl(resolvedUrl)) {
        await sendWebResponse(mergeWebResponse(middlewareHeaders, await proxyExternalRequest(webRequest, resolvedUrl), void 0), req, res, compress);
        return;
      }
      if (staticLookupPath !== "/" && !staticLookupPath.startsWith("/api/") && !staticLookupPath.startsWith("/assets/") && await tryServeStatic(req, res, clientDir, staticLookupPath, compress, staticCache, middlewareHeaders)) return;
      if (configRewrites.beforeFiles?.length) {
        const rewritten = matchRewrite(resolvedPathname, configRewrites.beforeFiles, postMwReqCtx);
        if (rewritten) {
          if (isExternalUrl(rewritten)) {
            await sendWebResponse(await proxyExternalRequest(webRequest, rewritten), req, res, compress);
            return;
          }
          resolvedUrl = rewritten;
          resolvedPathname = rewritten.split("?")[0];
        }
      }
      if (resolvedPathname.startsWith("/api/") || resolvedPathname === "/api") {
        let response2;
        if (typeof handleApi === "function") response2 = await handleApi(webRequest, resolvedUrl);
        else response2 = new Response("404 - API route not found", { status: 404 });
        const mergedResponse2 = mergeWebResponse(middlewareHeaders, response2, middlewareStatus);
        if (!mergedResponse2.body) {
          await sendWebResponse(mergedResponse2, req, res, compress);
          return;
        }
        const responseBody2 = Buffer.from(await mergedResponse2.arrayBuffer());
        const ct2 = mergedResponse2.headers.get("content-type") ?? "application/octet-stream";
        const responseHeaders2 = mergeResponseHeaders({}, mergedResponse2);
        const finalStatusText2 = mergedResponse2.statusText || void 0;
        sendCompressed(req, res, responseBody2, ct2, mergedResponse2.status, responseHeaders2, compress, finalStatusText2);
        return;
      }
      const pageMatch = matchPageRoute ? matchPageRoute(resolvedPathname, webRequest) : null;
      if ((!pageMatch || pageMatch.route.isDynamic) && configRewrites.afterFiles?.length) {
        const rewritten = matchRewrite(resolvedPathname, configRewrites.afterFiles, postMwReqCtx);
        if (rewritten) {
          if (isExternalUrl(rewritten)) {
            await sendWebResponse(await proxyExternalRequest(webRequest, rewritten), req, res, compress);
            return;
          }
          resolvedUrl = rewritten;
          resolvedPathname = rewritten.split("?")[0];
        }
      }
      let response;
      if (typeof renderPage === "function") {
        const middlewareResponseHeaders = toWebHeaders(middlewareHeaders);
        response = await renderPage(webRequest, resolvedUrl, ssrManifest, void 0, middlewareResponseHeaders);
        if (response && response.status === 404 && configRewrites.fallback?.length) {
          const fallbackRewrite = matchRewrite(resolvedPathname, configRewrites.fallback, postMwReqCtx);
          if (fallbackRewrite) {
            if (isExternalUrl(fallbackRewrite)) {
              await sendWebResponse(await proxyExternalRequest(webRequest, fallbackRewrite), req, res, compress);
              return;
            }
            response = await renderPage(webRequest, fallbackRewrite, ssrManifest, void 0, middlewareResponseHeaders);
          }
        }
      }
      if (!response) {
        res.writeHead(404);
        res.end("404 - Not found");
        return;
      }
      const shouldStreamPagesResponse = isVinextStreamedHtmlResponse(response);
      const mergedResponse = mergeWebResponse(middlewareHeaders, response, middlewareStatus);
      if (shouldStreamPagesResponse || !mergedResponse.body) {
        await sendWebResponse(mergedResponse, req, res, compress);
        return;
      }
      const responseBody = Buffer.from(await mergedResponse.arrayBuffer());
      const ct = mergedResponse.headers.get("content-type") ?? "text/html";
      const responseHeaders = mergeResponseHeaders({}, mergedResponse);
      const finalStatusText = mergedResponse.statusText || void 0;
      sendCompressed(req, res, responseBody, ct, mergedResponse.status, responseHeaders, compress, finalStatusText);
    } catch (e) {
      console.error("[vinext] Server error:", e);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  };
  const server = createServer((req, res) => {
    handleRequest(req, res);
  });
  await new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr2 = server.address();
      logProdServerStarted(host, typeof addr2 === "object" && addr2 ? addr2.port : port, purpose);
      resolve();
    });
  });
  const addr = server.address();
  return {
    server,
    port: typeof addr === "object" && addr ? addr.port : port
  };
}
export {
  startProdServer
};
