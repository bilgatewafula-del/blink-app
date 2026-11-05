// src/lib/imageUtils.js
// Client-side image preparation + Cloudinary delivery helpers.
import { uploadToCloudinary } from './cloudinary';

/* Shrink + (optionally) square-crop an image BEFORE upload. A 4 MB phone
   photo becomes ~60-150 KB, so uploads finish in a second or two even on
   slow mobile data, and everything downstream loads faster. */
export async function compressImage(file, { maxSize = 1080, quality = 0.84, square = false } = {}) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file;
    if (file.type === 'image/gif') return file; // keep animation

    let bitmap;
    if (window.createImageBitmap) {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } else {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    const sw = bitmap.width, sh = bitmap.height;
    let sx = 0, sy = 0, sSize = null, w, h;
    if (square) {
      sSize = Math.min(sw, sh);
      sx = Math.floor((sw - sSize) / 2);
      sy = Math.floor((sh - sSize) / 2);
      w = h = Math.min(maxSize, sSize);
    } else {
      const scale = Math.min(1, maxSize / Math.max(sw, sh));
      w = Math.round(sw * scale);
      h = Math.round(sh * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (square) ctx.drawImage(bitmap, sx, sy, sSize, sSize, 0, 0, w, h);
    else ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // already small
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // never block an upload because compression failed
  }
}

/* Upload with a timeout and one retry (flaky mobile networks). */
export async function uploadImage(file, folder = 'posts') {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await Promise.race([
        uploadToCloudinary(file, folder),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Upload timed out. Check your connection and try again.')), 45000)),
      ]);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/* Cloudinary delivery transforms (f_auto = WebP/AVIF, q_auto = smart quality).
   Safe on non-Cloudinary or already-transformed URLs. */
const isPlainCloudinary = (url) =>
  typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/upload/') &&
  !/\/upload\/[a-z]{1,3}_[^/]*\//.test(url);

export function avatarUrl(url, px = 80) {
  if (!isPlainCloudinary(url)) return url;
  const s = Math.min(512, Math.round(px * 2));
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,g_auto,w_${s},h_${s}/`);
}

export function feedImageUrl(url, width = 800) {
  if (!isPlainCloudinary(url)) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}

export function thumbUrl(url, width = 360) {
  if (!isPlainCloudinary(url)) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,w_${width},h_${width}/`);
}
