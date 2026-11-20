const Loader = () => (
  <div className="flex items-center justify-center h-screen bg-[#0D0C0B]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-2xl animate-pulse">
        B
      </div>
      <p className="text-[#8E8C88] text-sm">Loading B-Link...</p>
    </div>
  </div>
);

export default Loader;