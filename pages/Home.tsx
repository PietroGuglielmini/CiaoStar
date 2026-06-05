
import React, { useState, useMemo, useEffect } from 'react';
import { getTalents, getCategories } from '../services/dataService';
import TalentCard from '../components/TalentCard';
import { Search, Loader2, Play } from 'lucide-react';
import { Talent } from '../types';

const Home: React.FC = () => {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [categories, setCategories] = useState<string[]>(['Tutti']);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Tutti');
  const [searchTerm, setSearchTerm] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(250);
  const [absoluteMaxPrice, setAbsoluteMaxPrice] = useState<number>(250);
  const [absoluteMinPrice, setAbsoluteMinPrice] = useState<number>(0);

  useEffect(() => {
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
    return talents.filter(t => {
      const matchesCategory = selectedCategory === 'Tutti' || t.category === selectedCategory;
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPrice = (t.price ?? 0) <= maxPriceFilter;
      return matchesCategory && matchesSearch && matchesPrice;
    });
  }, [talents, selectedCategory, searchTerm, maxPriceFilter]);

  const talentsWithIntro = useMemo(() => {
    return talents.filter(t => !!t.introVideoUrl);
  }, [talents]);

  return (
    <div className="min-h-screen">
      {/* Search Hero */}
      <div className="bg-indigo-600 py-16 md:py-24 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-indigo-400 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-pink-400 rounded-full blur-3xl opacity-10"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
              Regala un video messaggio <br className="hidden md:block"/> dai tuoi personaggi preferiti
            </h1>
            <p className="text-indigo-100 text-lg md:text-xl mb-10 font-medium opacity-90">
              Prenota compleanni, lauree o semplici auguri direttamente dalle Star.
            </p>
            
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                className="w-full bg-white border-0 py-5 pl-12 pr-6 rounded-2xl text-slate-900 shadow-2xl focus:ring-4 focus:ring-indigo-300 text-lg transition-all placeholder:text-slate-400"
                placeholder="Cerca un attore, uno sportivo, un influencer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
                                  href={`/talent/${talent.id}`}
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
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Caricamento Star...</p>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-extrabold text-slate-900">
                        {selectedCategory === 'Tutti' ? 'I VIP del momento' : `Star in: ${selectedCategory}`}
                    </h2>
                    <span className="text-slate-400 text-sm font-bold">{filteredTalents.length} Risultati</span>
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
