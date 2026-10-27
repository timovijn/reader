import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Readable, pipeline } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { handleRequest, validateUrl, importFailure } from '../worker/index.js';
import { extractArticle } from './article-extractor.js';

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      // 192.0.0.0/24 is special-use, NOT all of 192.0.0.0/16.
      (a === 192 && ((b === 0 && c === 0) || (b === 0 && c === 2) || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1,-1);
  if (canonical.startsWith('::ffff:')) {
    const tail = canonical.slice(7).split(':');
    if (tail.length !== 2) return false;
    const value = parseInt(tail[0],16) * 65536 + parseInt(tail[1],16);
    return isPublicAddress([24,16,8,0].map(shift => (value >>> shift) & 255).join('.'));
  }
  return /^[23][0-9a-f]{3}:/i.test(canonical) && !/^2001:db8:/i.test(canonical);
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if(signal.aborted) return abort();
    signal.addEventListener('abort', abort, {once:true});
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
  });
}

export function createPublicFetch(resolve = lookup, transports = { http, https }) {
  return async function fetchPublicPage(value, options = {}) {
    const url = validateUrl(String(value));
    const signal = options.signal || AbortSignal.timeout(35000);
    let addresses;
    try {
      addresses = await abortable(resolve(url.hostname, { all: true, verbatim: true }), AbortSignal.any([signal,AbortSignal.timeout(5000)]));
    } catch(error) {
      if(signal.aborted) throw signal.reason;
      throw importFailure('dns_failed','The website address could not be resolved. Please check the link and try again.');
    }
    // Discard unsafe records and connect only to a checked address. Pinning the
    // actual socket lookup prevents both rebinding and fallback to private DNS.
    addresses = addresses.filter(({address}) => isPublicAddress(address));
    addresses.sort((a,b) => a.family - b.family);
    if (!addresses.length) throw importFailure('private_address','This link resolves to a private or reserved network address. Use a public article URL.');
    let lastError;
    for (const chosen of addresses.slice(0,4)) {
      signal.throwIfAborted();
      try {
        return await new Promise((resolveResponse, reject) => {
          const transport = url.protocol === 'https:' ? transports.https : transports.http;
          const request = transport.request(url, {
            method: 'GET', signal: AbortSignal.any([signal,AbortSignal.timeout(10000)]),
            headers: { ...options.headers, 'Accept-Encoding': 'gzip, deflate, br' },
            lookup(_host, lookupOptions, callback) {
              if (lookupOptions.all) callback(null, [chosen]);
              else callback(null, chosen.address, chosen.family);
            },
          }, response => {
            try {
              const headers = new Headers();
              for (const [name, value] of Object.entries(response.headers)) {
                if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
              }
              const status = response.statusCode || 502;
              if ([204,205,304].includes(status)) {
                response.resume();resolveResponse(new Response(null, {status, headers}));return;
              }
              const encoding = (headers.get('content-encoding')||'').trim().toLowerCase();
              const decoder = ({gzip:createGunzip,'x-gzip':createGunzip,deflate:createInflate,br:createBrotliDecompress})[encoding];
              let stream = response;
              if (decoder) {
                stream = decoder();pipeline(response,stream,()=>{});
                headers.delete('content-encoding');headers.delete('content-length');
              } else if (encoding && encoding !== 'identity') {
                response.destroy();reject(importFailure('unsupported_encoding','The website returned a compression format this reader cannot decode.'));return;
              }
              resolveResponse(new Response(Readable.toWeb(stream), {status, headers}));
            } catch(error) { response.destroy();reject(error); }
          });
          request.on('error', reject);request.end();
        });
      } catch(error) {
        lastError = error;
        if(signal.aborted) throw signal.reason;
        if(error.code === 'unsupported_encoding') throw error;
        // Try the next checked address for connection/TLS/IPv6 failures only.
      }
    }
    throw importFailure('connection_failed',lastError?.name === 'AbortError' ? 'The website took too long to connect. Please try again.' : 'Folio could not connect to this website. Please try again or paste the article text.');
  };
}

export function createVercelHandler(fetchPage = createPublicFetch()) {
  return { async fetch(request) {
    const response = await handleRequest(request, fetchPage);
    if(new URL(request.url).pathname !== '/api/article' || !response.ok) return response;
    const result = await response.json();
    try {
      return Response.json({article:extractArticle(result.html,result.url),url:result.url}, {headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    } catch(error) {
      if(error.diagnostics)console.warn('Folio extraction failed',{host:new URL(result.url).hostname,code:error.code,...error.diagnostics});
      return Response.json({error:error.message,code:error.code||'extraction_failed'}, {status:422,headers:{'cache-control':'no-store'}});
    }
  } };
}

export default createVercelHandler();
