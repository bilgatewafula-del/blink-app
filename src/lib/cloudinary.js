export const CLOUDINARY_CLOUD_NAME =
  process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || 'drhsdj0re';

export const CLOUDINARY_UPLOAD_PRESET = 'blink_uploads';

// Optimized image URL
export const getImageUrl = (publicId, options = '') => {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${options}/${publicId}`;
};

// Thumbnail URL
export const getThumbnailUrl = (url, width = 400) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace(
    '/upload/',
    `/upload/f_auto,q_auto,w_${width},c_limit/`
  );
};

// Full-size URL
export const getFullUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace(
    '/upload/',
    '/upload/f_auto,q_auto,w_1080,c_limit/'
  );
};

// Upload file to Cloudinary
export const uploadToCloudinary = async (file, folder = 'posts') => {
  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);
  formData.append('quality', 'auto');
  formData.append('fetch_format', 'auto');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.secure_url;
};