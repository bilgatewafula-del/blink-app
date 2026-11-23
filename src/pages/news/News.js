import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react';
import { formatTime } from '../../utils/formatTime';
import { goBack } from '../../lib/nav';

const CATEGORIES = [
  'all',
  'kenya',
  'east africa',
  'africa',
  'world',
  'business',
  'technology',
  'sports'
];

const RSS_FEEDS = [
  'https://citizentv.co.ke/feed/',
  'https://www.standardmedia.co.ke/rss',
  'https://nation.africa/kenya/rss'
];

const News = () => {
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState('all');
  const [news, setNews] = useState([]);
  const [breaking, setBreaking] = useState(null);
  const [loading, setLoading] = useState(false);

  const API_KEY = process.env.REACT_APP_NEWS_API_KEY;

  const intervalRef = useRef(null);
  const userIsScrolling = useRef(false);
  const lastRefreshIds = useRef(new Set());

  // 🖼️ IMAGE ENGINE (CNN STYLE)
  const getImage = (article) => {
    const title = (article.title || '').toLowerCase();

    if (article.urlToImage) return article.urlToImage;
    if (title.includes('kenya')) return 'https://images.unsplash.com/photo-1523821741446-edb2b68bb7a0';
    if (title.includes('africa')) return 'https://images.unsplash.com/photo-1489392191049-fc10c97e64b6';
    if (title.includes('business')) return 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a';
    if (title.includes('technology') || title.includes('ai')) return 'https://images.unsplash.com/photo-1518770660439-4636190af475';
    if (title.includes('sports')) return 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d';

    return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c';
  };

  // 🧠 BBC RANKING
  const rankNews = (articles) =>
    articles
      .map((a) => {
        let score = 0;
        const text = (a.title + (a.source?.name || '')).toLowerCase();

        if (text.includes('breaking')) score += 10;
        if (text.includes('kenya')) score += 6;
        if (text.includes('africa')) score += 4;

        return { ...a, score };
      })
      .sort((a, b) => b.score - a.score);

  // 🔗 MERGE + DEDUPE
  const mergeNews = (oldNews, newNews) => {
    const map = new Map();

    [...newNews, ...oldNews].forEach((item) => {
      if (!item?.url) return;
      map.set(item.url, item);
    });

    return Array.from(map.values());
  };

  // 🔄 RSS PARSER
  const parseRSS = async (url) => {
    try {
      const res = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
      );
      const data = await res.json();

      return (data.items || []).map((item) => ({
        title: item.title,
        url: item.link,
        publishedAt: item.pubDate,
        urlToImage: item.thumbnail || null,
        source: { name: data.feed?.title || 'Kenyan Media' }
      }));
    } catch {
      return [];
    }
  };

  // 🌍 FETCH
  const fetchNews = async (category = 'all', silent = false) => {
    if (!silent) setLoading(true);

    try {
      let query = 'Kenya OR Africa OR world';

      if (category === 'kenya') query = 'Kenya OR Nairobi';
      else if (category === 'east africa') query = 'Kenya OR Uganda OR Tanzania';
      else if (category === 'africa') query = 'Africa';
      else if (category === 'world') query = 'global OR world news';

      const globalRes = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(
          query
        )}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${API_KEY}`
      );

      const globalData = await globalRes.json();
      let globalNews = globalData.articles || [];

      const rssResults = await Promise.all(RSS_FEEDS.map(parseRSS));
      let localNews = rssResults.flat();

      let combined = [...globalNews, ...localNews];
      combined = rankNews(combined);

      // 🆕 NEW BADGE SYSTEM
      const freshNews = combined.filter((a) => {
        const id = a.url;
        if (!lastRefreshIds.current.has(id)) {
          lastRefreshIds.current.add(id);
          return true;
        }
        return false;
      });

      if (!silent) {
        const breakingNews = combined.find((a) =>
          (a.title || '').toLowerCase().includes('breaking')
        );
        setBreaking(breakingNews || null);
      }

      if (silent) {
        setNews((prev) => mergeNews(prev, combined));
      } else {
        setNews(combined);
      }

    } catch (err) {
      console.error(err);
    }

    if (!silent) setLoading(false);
  };

  // 🔄 AUTO REFRESH (PAUSE WHEN USER SCROLLS)
  useEffect(() => {
    fetchNews(activeCategory);

    intervalRef.current = setInterval(() => {
      if (!userIsScrolling.current) {
        fetchNews(activeCategory, true);
      }
    }, 60000);

    return () => clearInterval(intervalRef.current);
  }, [activeCategory]);

  // 👇 DETECT USER SCROLL (PAUSE REFRESH)
  useEffect(() => {
    const handleScroll = () => {
      userIsScrolling.current = true;

      clearTimeout(window.scrollTimer);
      window.scrollTimer = setTimeout(() => {
        userIsScrolling.current = false;
      }, 5000);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white pb-24">

      {/* BREAKING */}
      {breaking && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-bold animate-pulse">
          🔴 BREAKING: {breaking.title}
        </div>
      )}

      {/* TOP BAR */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E2E8F0] px-4 py-3">

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => goBack(navigate, '/')}>
              <ArrowLeft size={22} className="text-[#64748B]" />
            </button>

            <div>
              <h1 className="text-[#202938] font-bold">News</h1>
              <p className="text-xs text-[#64748B]">
                BBC + CNN Hybrid Feed
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchNews(activeCategory)}
            className={loading ? 'animate-spin text-[#202938]' : 'text-[#64748B]'}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* CATEGORIES */}
        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={
                'px-3 py-1 rounded-full text-xs capitalize ' +
                (activeCategory === cat
                  ? 'bg-[#F97316] text-white'
                  : 'bg-[#F8FAFC] text-[#64748B]')
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* TOP STORY */}
      {news.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">

            <img
              src={getImage(news[0])}
              className="w-full h-48 object-cover"
              alt="news"
            />

            <div className="p-4">
              <p className="text-[#EA580C] text-xs font-bold">TOP STORY</p>
              <h2 className="text-[#202938] font-bold text-lg">{news[0].title}</h2>
              <p className="text-[#64748B] text-xs mt-2">
                {news[0].source?.name} · {formatTime(news[0].publishedAt)}
              </p>

              <button
                onClick={() => window.open(news[0].url, '_blank', 'noopener,noreferrer')}
                className="mt-3 text-[#EA580C] text-xs font-bold"
              >
                Read full story <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CNN IMAGE FEED */}
      <div className="px-4 mt-4 space-y-3">

        {news.slice(1).map((article, i) => (
          <div key={i} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">

            <img src={getImage(article)} className="w-full h-48 object-cover" />

            <div className="p-3">

              <p className="text-[#EA580C] text-xs font-bold">
                {article.source?.name}
                {lastRefreshIds.current.has(article.url) && (
                  <span className="ml-2 text-green-700">NEW</span>
                )}
              </p>

              <h3 className="text-[#202938] font-bold text-sm mt-1">
                {article.title}
              </h3>

              <p className="text-[#64748B] text-xs mt-1">
                {formatTime(article.publishedAt)}
              </p>

              <button
                onClick={() => window.open(article.url, '_blank', 'noopener,noreferrer')}
                className="mt-2 text-[#EA580C] text-xs font-bold"
              >
                Read full story <ExternalLink size={12} />
              </button>

            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default News;