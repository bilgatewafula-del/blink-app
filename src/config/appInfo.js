// src/config/appInfo.js
// Public, non-personal app information. Contact channels are optional and
// come from environment variables, so nothing personal is baked into the code.
export const APP_NAME = 'B-Link';
export const APP_TAGLINE = "Africa's GenZ social platform";
export const APP_VERSION = '2.1';
export const COMPANY = 'B-Link';
export const SUPPORT_EMAIL = process.env.REACT_APP_SUPPORT_EMAIL || '';
export const SUPPORT_WHATSAPP = (process.env.REACT_APP_SUPPORT_WHATSAPP || '').replace(/[^\d]/g, ''); // digits only, e.g. 2547XXXXXXXX
export const LEGAL_UPDATED = 'November 2026';
