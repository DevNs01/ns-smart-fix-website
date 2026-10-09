const MAX_BROWSER_REPORTS = 5;
const ERROR_NAMES = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'AggregateError',
  'DOMException'
]);

function boundedInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(number)));
}

function errorCode(type, event) {
  const error = type === 'unhandled_rejection' ? event?.reason : event?.error;
  const name = String(error?.name || '');
  if (ERROR_NAMES.has(name)) return name;
  return type === 'unhandled_rejection' ? 'PromiseRejection' : 'Error';
}

function errorSource(filename, location) {
  if (!filename) return 'inline_or_unknown';
  try {
    const source = new URL(filename, location.origin);
    if (source.origin !== location.origin) return 'third_party';
    return source.pathname.slice(0, 160) || '/';
  } catch {
    return 'inline_or_unknown';
  }
}

export function createBrowserErrorReport(type, event, location) {
  return {
    type,
    page: location.pathname,
    code: errorCode(type, event),
    source: errorSource(event?.filename, location),
    line: boundedInteger(event?.lineno),
    column: boundedInteger(event?.colno)
  };
}

export function installBrowserMonitoring({
  target = window,
  location = window.location,
  fetchImpl = fetch
} = {}) {
  const reported = new Set();

  function report(type, event) {
    const body = createBrowserErrorReport(type, event, location);
    const key = `${body.type}:${body.page}:${body.code}:${body.source}:${body.line}:${body.column}`;
    if (reported.has(key) || reported.size >= MAX_BROWSER_REPORTS) return;
    reported.add(key);
    Promise.resolve(fetchImpl('/api/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'same-origin'
    })).catch(() => {});
  }

  const onError = event => report('javascript_error', event);
  const onUnhandledRejection = event => report('unhandled_rejection', event);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
