export const CLOUDINARY_CLOUD_NAME = 'drhsdj0re';
export const CLOUDINARY_UPLOAD_PRESET = 'blink_uploads';

// Get optimized image URL with auto format and quality
export const getImageUrl = (publicId, options = '') => {
  return 'https://res.cloudinary.com/drhsdj0re/image/upload/f_auto,q_auto/' + options + '/' + publicId;
};

// Get thumbnail URL — smaller for feed
export const getThumbnailUrl = (url, width = 400) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_' + width + ',c_limit/');
};

// Get full size URL — for post detail
export const getFullUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_1080,c_limit/');
};

export const uploadToCloudinary = async (file, folder = 'posts') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'blink_uploads');
  formData.append('folder', folder);
  // Auto compress on upload
  formData.append('quality', 'auto');
  formData.append('fetch_format', 'auto');

  const res = await fetch(
    'https://api.cloudinary.com/v1_1/drhsdj0re/image/upload',
    { method: 'POST', body: formData }
  );
  const data = await res.json();
  return data.secure_url;
};