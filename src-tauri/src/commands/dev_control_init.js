(() => {
  if (window.__AIO_DEV_DIAGNOSTICS__) return;
  const buffer = {
    documentId:
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    cursor: 0,
    entries: [],
  };
  Object.defineProperty(window, "__AIO_DEV_DIAGNOSTICS__", { value: buffer });
  const source = (value) => {
    try {
      const url = new URL(value, location.href);
      if (["data:", "blob:"].includes(url.protocol)) return url.protocol;
      const file = url.pathname.split("/").pop();
      return /\.(js|css|svg|html)$/.test(file)
        ? file
        : url.protocol + "//" + url.host;
    } catch {
      return "";
    }
  };
  const redact = (value) =>
    String(value ?? "")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
      .replace(/([?&][^=\s]+)=([^&\s]+)/g, "$1=[redacted]")
      .replace(
        /((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi,
        "$1[redacted]"
      )
      .slice(0, 240);
  const append = (kind, message, url) => {
    buffer.entries.push({
      cursor: ++buffer.cursor,
      kind,
      message: redact(message),
      source: source(url || location.href),
      at: Date.now(),
    });
    if (buffer.entries.length > 200) buffer.entries.shift();
  };
  window.addEventListener("error", (event) =>
    append("error", event.message, event.filename)
  );
  window.addEventListener("unhandledrejection", (event) =>
    append("unhandledrejection", event.reason?.message || String(event.reason))
  );
  document.addEventListener("securitypolicyviolation", (event) =>
    append("csp", event.effectiveDirective, event.blockedURI)
  );
})();
