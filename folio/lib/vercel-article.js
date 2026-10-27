import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { handleRequest, validateUrl } from '../worker/index.js';

// Node can reach private networks. Restrict DNS results as well as URL syntax,
// then pin the socket lookup to the checked address (including on redirects).
export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  return family === 6 && /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:0?db8:/i.test(address);
}

export function createPublicFetch(resolve = lookup, transports = { http, https }) {
  return async function fetchPublicPage(value, options = {}) {
    const url = validateUrl(String(value));
    const addresses = await resolve(url.hostname, { all: true, verbatim: true });
    options.signal?.throwIfAborted();
    if (!addresses.length || addresses.some(({address}) => !isPublicAddress(address))) {
      throw Error('Please use an article hosted on a public website.');
    }
    const chosen = addresses[0];
    const transport = url.protocol === 'https:' ? transports.https : transports.http;
    return new Promise((resolveResponse, reject) => {
      const request = transport.request(url, {
        method: 'GET', signal: options.signal,
        headers: { ...options.headers, 'Accept-Encoding': 'identity' },
        lookup(_host, lookupOptions, callback) {
          if (lookupOptions.all) callback(null, [chosen]);
          else callback(null, chosen.address, chosen.family);
        },
      }, response => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        const status = response.statusCode || 502;
        if ([204,205,304].includes(status)) {
          response.resume();
          resolveResponse(new Response(null, {status, headers}));
        } else {
          resolveResponse(new Response(Readable.toWeb(response), {status, headers}));
        }
      });
      request.on('error', reject);
      request.end();
    });
  };
}

export function createVercelHandler(fetchPage = createPublicFetch()) {
  return { fetch(request) { return handleRequest(request, fetchPage); } };
}

export default createVercelHandler();
