// Shimmer animation base
const Shimmer = ({ className }) => (
  <div
    className={'animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded-xl ' + className}
    style={{
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }}
  />
);

// Post card skeleton
export const PostCardSkeleton = () => (
  <div className="bg-white border-b border-[#E2E8F0] py-4 px-4">
    {/* Header */}
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 rounded-full bg-[#F1F5F9] animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-[#F1F5F9] rounded-full animate-pulse w-32" />
        <div className="h-2.5 bg-[#F8FAFC] rounded-full animate-pulse w-24" />
      </div>
      <div className="h-7 w-16 bg-[#F8FAFC] rounded-full animate-pulse" />
    </div>
    {/* Caption lines */}
    <div className="space-y-2 mb-3">
      <div className="h-3 bg-[#F1F5F9] rounded-full animate-pulse w-full" />
      <div className="h-3 bg-[#F1F5F9] rounded-full animate-pulse w-4/5" />
      <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-2/3" />
    </div>
    {/* Image placeholder */}
    <div className="aspect-square bg-[#F8FAFC] rounded-none animate-pulse mb-3" />
    {/* Action bar */}
    <div className="flex items-center gap-5 mt-2">
      <div className="h-5 w-12 bg-[#F8FAFC] rounded-full animate-pulse" />
      <div className="h-5 w-12 bg-[#F8FAFC] rounded-full animate-pulse" />
      <div className="h-5 w-12 bg-[#F8FAFC] rounded-full animate-pulse" />
      <div className="h-5 w-8 bg-[#F8FAFC] rounded-full animate-pulse" />
    </div>
  </div>
);

// Profile skeleton
export const ProfileSkeleton = () => (
  <div className="min-h-screen bg-[#E6E9F6]">
    {/* Cover */}
    <div className="h-36 bg-[#F8FAFC] animate-pulse" />
    {/* Avatar */}
    <div className="px-4 mt-[-48px] mb-14">
      <div className="w-24 h-24 rounded-full bg-[#F1F5F9] animate-pulse border-4 border-[#E2E8F0]" />
    </div>
    {/* Info */}
    <div className="px-4 space-y-3 mt-2">
      <div className="h-5 bg-[#F1F5F9] rounded-full animate-pulse w-40" />
      <div className="h-3.5 bg-[#F8FAFC] rounded-full animate-pulse w-28" />
      <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-full" />
      <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-3/4" />
      <div className="flex gap-6 pt-2">
        {[1,2,3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-5 w-10 bg-[#F1F5F9] rounded-full animate-pulse mx-auto" />
            <div className="h-3 w-14 bg-[#F8FAFC] rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
    {/* Grid */}
    <div className="grid grid-cols-3 gap-0.5 mt-6">
      {Array(9).fill(0).map((_, i) => (
        <div key={i} className="aspect-square bg-[#F8FAFC] animate-pulse" />
      ))}
    </div>
  </div>
);

// Chat list skeleton
export const ChatListSkeleton = () => (
  <div className="divide-y divide-[#E2E8F0]">
    {Array(6).fill(0).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-4">
        <div className="w-12 h-12 rounded-full bg-[#F1F5F9] animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-[#F1F5F9] rounded-full animate-pulse w-32" />
          <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-48" />
        </div>
        <div className="h-3 w-10 bg-[#F8FAFC] rounded-full animate-pulse" />
      </div>
    ))}
  </div>
);

// Notification skeleton
export const NotificationSkeleton = () => (
  <div className="divide-y divide-[#E2E8F0]">
    {Array(7).fill(0).map((_, i) => (
      <div key={i} className="flex items-start gap-3 px-4 py-4">
        <div className="w-10 h-10 rounded-full bg-[#F1F5F9] animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 bg-[#F1F5F9] rounded-full animate-pulse w-3/4" />
          <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

// Discover skeleton
export const DiscoverSkeleton = () => (
  <div className="px-4 pt-4 space-y-4">
    {/* Trending pills */}
    <div className="flex gap-2 flex-wrap">
      {Array(8).fill(0).map((_, i) => (
        <div key={i} className="h-7 w-20 bg-[#F8FAFC] rounded-full animate-pulse" />
      ))}
    </div>
    {/* User cards */}
    <div className="space-y-3 mt-4">
      {Array(5).fill(0).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-[#F8FAFC] rounded-2xl p-3">
          <div className="w-10 h-10 rounded-full bg-[#F1F5F9] animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-[#F1F5F9] rounded-full animate-pulse w-28" />
            <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-20" />
          </div>
          <div className="h-8 w-16 bg-[#F8FAFC] rounded-full animate-pulse" />
        </div>
      ))}
    </div>
    {/* Post grid */}
    <div className="grid grid-cols-3 gap-0.5 mt-2">
      {Array(9).fill(0).map((_, i) => (
        <div key={i} className="aspect-square bg-[#F8FAFC] animate-pulse" />
      ))}
    </div>
  </div>
);

// Post detail skeleton
export const PostDetailSkeleton = () => (
  <div className="min-h-screen bg-[#E6E9F6] pb-24">
    <div className="px-4 py-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-[#F1F5F9] animate-pulse" />
      <div className="space-y-2 flex-1">
        <div className="h-4 bg-[#F1F5F9] rounded-full animate-pulse w-36" />
        <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-24" />
      </div>
    </div>
    <div className="px-4 space-y-2 mb-3">
      <div className="h-3.5 bg-[#F1F5F9] rounded-full animate-pulse w-full" />
      <div className="h-3.5 bg-[#F1F5F9] rounded-full animate-pulse w-5/6" />
    </div>
    <div className="aspect-square bg-[#F8FAFC] animate-pulse mb-3" />
    <div className="px-4 flex gap-5">
      {Array(4).fill(0).map((_, i) => (
        <div key={i} className="h-6 w-14 bg-[#F8FAFC] rounded-full animate-pulse" />
      ))}
    </div>
    <div className="px-4 mt-6 space-y-4">
      {Array(3).fill(0).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-[#F1F5F9] animate-pulse flex-shrink-0" />
          <div className="flex-1 bg-[#F8FAFC] rounded-2xl rounded-tl-none p-3 space-y-2">
            <div className="h-3 bg-[#F1F5F9] rounded-full animate-pulse w-24" />
            <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-full" />
            <div className="h-3 bg-[#F8FAFC] rounded-full animate-pulse w-3/4" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Shimmer;