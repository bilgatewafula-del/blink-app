const Avatar = ({ url, name, size = 10, className = '' }) => {
  const initials = name?.charAt(0)?.toUpperCase() || 'B';
  const px = {
    8: 'w-8 h-8 text-sm',
    9: 'w-9 h-9 text-sm',
    10: 'w-10 h-10 text-base',
    12: 'w-12 h-12 text-lg',
    14: 'w-14 h-14 text-xl',
    16: 'w-16 h-16 text-xl',
    20: 'w-20 h-20 text-2xl',
    24: 'w-24 h-24 text-3xl',
  };

  const sizeClass = px[size] || 'w-10 h-10 text-base';

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
};

export default Avatar;