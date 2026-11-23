// src/lib/upload.js
// Uploads to Cloudinary built for patchy mobile networks.
//  - small files go in one request;
//  - big videos are sent in 6 MB pieces, each piece retried (with waiting) if the network drops,
//    so a bad moment doesn't restart a 90 MB upload from zero;
//  - the upload can be cancelled (AbortController) and waits while the phone is offline.
import { CLOUDINARY_CLOUD_NAME } from './cloudinary';

const PRESET = 'blink_uploads';
const CHUNK = 6 * 1024 * 1024;               // Cloudinary needs every piece except the last to be at least 5 MB
const CHUNK_FROM = 12 * 1024 * 1024;         // files up to this size are sent in one go

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abortError = () => { const e = new Error('Upload cancelled'); e.name = 'AbortError'; return e; };

async function waitOnline(signal) {
  while (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (signal && signal.aborted) throw abortError();
    await sleep(1000);
  }
}

// one HTTP request; resolves { status, data } or rejects with 'network' / AbortError
function send(url, formData, headers, onBytes, signal, maxBytes) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = 5 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (onBytes && e.lengthComputable) onBytes(Math.min(e.loaded, maxBytes || e.total)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON (e.g. a size error page) */ }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('network'));
    xhr.onabort = () => reject(abortError());
    if (signal) {
      if (signal.aborted) { reject(abortError()); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(formData);
  });
}

const message = (r) => (r.status === 413 ? 'That file is too large to upload.' : (r.data && r.data.error && r.data.error.message) || 'Upload failed. Please try again.');

async function single(file, resourceType, onProgress, signal) {
  const fd = new FormData();
  fd.append('file', file); fd.append('upload_preset', PRESET); fd.append('cloud_name', CLOUDINARY_CLOUD_NAME);
  const url = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload';
  for (let attempt = 0; ; attempt += 1) {
    try {
      await waitOnline(signal);
      const r = await send(url, fd, null, (b) => onProgress && onProgress(Math.round((b / file.size) * 100)), signal, file.size);
      if (r.data && r.data.secure_url) return r.data;
      if (r.status >= 500 && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      throw new Error(message(r));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (e.message === 'network' && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      throw new Error(e.message === 'network' ? 'Network error during upload. Check your connection and try again.' : e.message);
    }
  }
}

async function chunked(file, resourceType, onProgress, signal) {
  const url = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload';
  const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const total = file.size;
  let offset = 0;
  let last = null;
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    const piece = file.slice(offset, end);
    const fd = new FormData();
    fd.append('file', piece, file.name || 'video.mp4');
    fd.append('upload_preset', PRESET);
    fd.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    const base = offset;
    const headers = { 'X-Unique-Upload-Id': uploadId, 'Content-Range': 'bytes ' + base + '-' + (end - 1) + '/' + total };
    for (let attempt = 0; ; attempt += 1) {
      try {
        await waitOnline(signal);
        const r = await send(url, fd, headers, (b) => onProgress && onProgress(Math.round(((base + b) / total) * 100)), signal, piece.size);
        if (r.status >= 200 && r.status < 300) { last = r.data; break; }
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) throw new Error(message(r));
        throw new Error('network');                                   // 5xx / 408 / 429: try this piece again
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (e.message === 'network' && attempt < 5) { await sleep(Math.min(1000 * 2 ** attempt, 12000)); continue; }
        throw new Error(e.message === 'network' ? 'The connection kept dropping. Check your signal and try again.' : e.message);
      }
    }
    offset = end;
  }
  if (!last || !last.secure_url) throw new Error('Upload failed. Please try again.');
  return last;
}

/**
 * @param {File|Blob} file
 * @param {'image'|'video'} resourceType
 * @param {(percent:number)=>void} [onProgress]
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<object>} Cloudinary response (secure_url, duration, public_id, ...)
 */
export function uploadToCloudinary(file, resourceType = 'image', onProgress, options = {}) {
  const useChunks = resourceType === 'video' && file.size > CHUNK_FROM;
  return (useChunks ? chunked : single)(file, resourceType, onProgress, options.signal);
}
