const Loader = () => (
  <div className="flex items-center justify-center h-screen bg-[#0A1628]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl animate-pulse">
        B
      </div>
      <p className="text-[#6B7280] text-sm">Loading B-Link...</p>
    </div>
  </div>
);

export default Loader;