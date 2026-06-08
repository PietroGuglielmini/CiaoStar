
import React, { useState, useMemo, useEffect } from 'react';
import { getTalents, getCategories } from '../services/dataService';
import { applyDefaultSEO } from '../services/seoService';
import TalentCard from '../components/TalentCard';
import { Search, Loader2, Play } from 'lucide-react';
import { Talent } from '../types';
import { CardGridSkeleton } from '../components/Skeleton';

const Home: React.FC = () => {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [categories, setCategories] = useState<string[]>(['Tutti']);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Tutti');
  const [searchTerm, setSearchTerm] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(250);
  const [absoluteMaxPrice, setAbsoluteMaxPrice] = useState<number>(250);
  const [absoluteMinPrice, setAbsoluteMinPrice] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'featured' | 'recent' | 'popular'>('featured');
  const [globalDraft, setGlobalDraft] = useState<any>(null);
  const [globalDraftTime, setGlobalDraftTime] = useState('');
  const talentPrefix = sessionStorage.getItem('talentSlugPrefix') || 'talent';

  useEffect(() => {
    const raw = localStorage.getItem('ciao_star_abandoned_cart');
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        const draftDate = new Date(draft.timestamp);
        const ageHours = (new Date().getTime() - draftDate.getTime()) / (1000 * 60 * 60);
        
        // Use a generic limit of 24h as a fallback on homepage
        if (ageHours <= 24) {
          setGlobalDraft(draft);
          setGlobalDraftTime(draftDate.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }));
        } else {
          localStorage.removeItem('ciao_star_abandoned_cart');
        }
      } catch (e) {
        console.error("Errore parse bozza globale:", e);
      }
    }
  }, []);

  useEffect(() => {
    // Applica SEO globale all'avvio della homepage
    applyDefaultSEO();

    const fetchData = async () => {
      setLoading(true);
      const [talentsData, catsData] = await Promise.all([getTalents(), getCategories()]);
      const usedCategories = new Set(talentsData.map(t => t.category));
      const activeCategories = catsData.filter(cat => usedCategories.has(cat));
      setTalents(talentsData);
      setCategories(['Tutti', ...activeCategories]);

      const prices = talentsData.map(t => t.price || 0);
      const computedMax = prices.length > 0 ? Math.max(...prices) : 250;
      const computedMin = prices.length > 0 ? Math.min(...prices) : 0;
      setAbsoluteMaxPrice(computedMax);
      setAbsoluteMinPrice(computedMin);
      setMaxPriceFilter(computedMax);

      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredTalents = useMemo(() => {
    const list = talents.filter(t => {
      const matchesCategory = selectedCategory === 'Tutti' || t.category === selectedCategory;
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPrice = (t.price ?? 0) <= maxPriceFilter;
      return matchesCategory && matchesSearch && matchesPrice;
    });

    if (sortBy === 'recent') {
      return [...list].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'popular') {
      return [...list].sort((a, b) => {
        const countA = a.completedOrdersCount || 0;
        const countB = b.completedOrdersCount || 0;
        return countB - countA;
      });
    }
    return list;
  }, [talents, selectedCategory, searchTerm, maxPriceFilter, sortBy]);

  const talentsWithIntro = useMemo(() => {
    return talents.filter(t => !!t.introVideoUrl);
  }, [talents]);

  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);

  useEffect(() => {
    if (talents.length === 0) return;
    const interval = setInterval(() => {
      setActiveCarouselIndex(prev => (prev + 1) % Math.min(talents.length, 5));
    }, 4000);
    return () => clearInterval(interval);
  }, [talents]);

  const carouselTalents = useMemo(() => {
    return talents.slice(0, 5);
  }, [talents]);

  return (
    <div className="min-h-screen">
      {/* Search Hero with Gold Shimmer particles and Talent Carousel in background */}
      <div className="gold-shimmer-bg py-16 md:py-24 px-4 relative overflow-hidden flex flex-col justify-center min-h-[380px] md:min-h-[460px]">
        {/* Floating Sparkling Dots */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <div className="absolute top-1/4 left-[15%] w-2.5 h-2.5 rounded-full bg-amber-300 blur-[0.5px] sparkle-slow"></div>
          <div className="absolute top-1/3 right-[20%] w-3.5 h-3.5 rounded-full bg-yellow-400 blur-[1px] sparkle-slow" style={{ animationDelay: '1.5s' }}></div>
          <div className="absolute bottom-[25%] left-[30%] w-3 h-3 rounded-full bg-amber-200 blur-[0.5px] sparkle-slow" style={{ animationDelay: '3s' }}></div>
          <div className="absolute bottom-[35%] right-[15%] w-2 h-2 rounded-full bg-yellow-300 blur-[0.5px] sparkle-slow" style={{ animationDelay: '4.5s' }}></div>
        </div>

        {/* Carousel Background containing Talent Cards */}
        {carouselTalents.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none select-none z-0 overflow-hidden mix-blend-screen scale-110">
            {carouselTalents.map((talent, idx) => {
              const isActive = idx === activeCarouselIndex;
              return (
                <div 
                  key={talent.id} 
                  className={`absolute transition-all duration-1000 transform ${
                    isActive ? 'opacity-100 scale-100 translate-y-0 rotate-1' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'
                  }`}
                  style={{ width: '240px' }}
                >
                  <TalentCard talent={talent} />
                </div>
              );
            })}
          </div>
        )}

        {/* Glow gradients */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-amber-400/20 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight drop-shadow-md">
              Regala un video messaggio <br className="hidden md:block"/> dai tuoi personaggi preferiti
            </h1>
            <p className="text-amber-100/90 text-lg md:text-xl mb-10 font-bold opacity-90 tracking-wide drop-shadow-sm">
              Prenota compleanni, lauree o semplici auguri direttamente dalle Star.
            </p>
            
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 z-20" />
              <input
                type="text"
                className="w-full bg-white border-0 py-5 pl-12 pr-6 rounded-2xl text-slate-900 shadow-2xl focus:ring-4 focus:ring-amber-400 text-lg transition-all placeholder:text-slate-400 relative z-10"
                placeholder="Cerca un attore, uno sportivo, un influencer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {globalDraft && (
            <div className="mb-10 p-5 bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200 rounded-[1.8rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fadeIn text-left">
                <div className="flex gap-3.5 items-start">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Play className="w-5 h-5 text-amber-600 fill-amber-600" />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">Hai una prenotazione in corso!</h4>
                        <p className="text-[11px] text-amber-700 font-bold leading-normal mt-0.5">
                            La tua richiesta personalizzata per la star <span className="font-black text-slate-800">{globalDraft.talentName}</span> iniziata il {globalDraftTime} aspetta di essere inviata. Completa la prenotazione prima che scada!
                        </p>
                    </div>
                </div>
                <div className="flex gap-2.5 shrink-0">
                    <a 
                      href={`/${talentPrefix}/${globalDraft.talentId}`}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase px-5 py-3 rounded-xl shadow transition duration-250 shrink-0 select-none cursor-pointer"
                    >
                      Completa Ora
                    </a>
                    <button 
                      onClick={() => {
                        localStorage.removeItem('ciao_star_abandoned_cart');
                        setGlobalDraft(null);
                      }}
                      className="bg-white hover:bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black uppercase px-4 py-3 rounded-xl transition duration-250 select-none cursor-pointer"
                    >
                      Ignora bozza
                    </button>
                </div>
            </div>
        )}

        {/* Category Chips & Price Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-8 border-b border-gray-100 mb-8">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 flex-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-bold transition-all border ${
                  selectedCategory === cat 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                  : 'bg-white text-slate-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Budget Price Filter */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm shrink-0 lg:max-w-xs w-full">
            <div className="flex flex-col min-w-[100px]">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Budget Massimo</span>
              <span className="text-xs font-extrabold text-indigo-600">
                {maxPriceFilter === absoluteMaxPrice ? 'Qualsiasi' : `${maxPriceFilter} €`}
              </span>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">{absoluteMinPrice}€</span>
              <input 
                type="range"
                min={absoluteMinPrice}
                max={absoluteMaxPrice}
                step="5"
                value={maxPriceFilter}
                onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
                className="w-full h-1.5 accent-indigo-600 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] font-bold text-slate-400">{absoluteMaxPrice}€</span>
            </div>
            {maxPriceFilter !== absoluteMaxPrice && (
              <button 
                onClick={() => setMaxPriceFilter(absoluteMaxPrice)}
                className="text-[10px] uppercase font-black text-rose-500 hover:text-rose-700 transition cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Bacheca dei video di benvenuto del VIP */}
        {!loading && talentsWithIntro.length > 0 && selectedCategory === 'Tutti' && !searchTerm && (
            <div className="mb-14 bg-gradient-to-tr from-slate-900 to-indigo-950 rounded-[2.5rem] p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl opacity-20"></div>
                
                <h3 className="text-2xl font-black mb-1">Bacheca dei VIP - Inviti & Benvenuto</h3>
                <p className="text-indigo-200 text-sm font-semibold mb-8 opacity-80">Guarda il video messaggio personale delle nostre star che ti invitano a inviare una richiesta!</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {talentsWithIntro.map(talent => (
                        <div key={talent.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-all duration-300">
                            <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-inner mb-4">
                                <video 
                                    src={talent.introVideoUrl} 
                                    className="w-full h-full object-cover" 
                                    controls 
                                />
                            </div>
                            <div className="flex items-center justify-between mt-auto">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 flex-shrink-0">
                                        <img src={talent.avatarUrl} alt={talent.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{talent.name}</h4>
                                        <p className="text-xs text-indigo-300 font-semibold">{talent.category}</p>
                                    </div>
                                </div>
                                <a
                                  href={`/${talentPrefix}/${talent.id}`}
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95"
                                >
                                  Richiedi
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {loading ? (
            <div className="space-y-6">
                <div className="flex items-center justify-between pb-4">
                    <div className="h-6 w-48 bg-slate-200 animate-pulse rounded-lg" />
                    <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-xl" />
                </div>
                <CardGridSkeleton count={8} />
            </div>
        ) : (
            <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-900">
                        {selectedCategory === 'Tutti' ? 'I VIP del momento' : `Star in: ${selectedCategory}`}
                    </h2>
                    
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">Ordina per:</span>
                        <select 
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="featured">In evidenza</option>
                            <option value="recent">Aggiunti di recente</option>
                            <option value="popular">Più acquistati</option>
                        </select>
                        <span className="text-slate-400 text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 shrink-0">{filteredTalents.length} {filteredTalents.length === 1 ? 'risultato' : 'risultati'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredTalents.map(talent => (
                      <TalentCard key={talent.id} talent={talent} />
                  ))}
                  {filteredTalents.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                          <p className="text-slate-400 font-bold">Nessun VIP trovato con questi criteri.</p>
                      </div>
                  )}
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default Home;
