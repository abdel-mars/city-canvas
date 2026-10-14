import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCitySearch } from '@/hooks/useCitySearch';
import { City } from '@/types/artwork';

interface CitySearchProps {
  onSelect: (city: City) => void;
  compact?: boolean;
}

const CitySearch = ({ onSelect, compact = false }: CitySearchProps) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { results, isSearching, error, search, clearResults } = useCitySearch();
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** The search bar keeps its dark treatment in both site themes. */
  const isDark = true;

  useEffect(() => {
    search(query);
  }, [query, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (city: City) => {
    setQuery(city.name);
    setIsOpen(false);
    setIsFocused(false);
    clearResults();
    onSelect(city);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  const expanded = compact ? isFocused || isOpen || query.length > 0 : true;
  const collapsed = compact && !expanded;

  /**
   * One input that morphs: a glassy 44px circle when idle (compact), a full pill once focused.
   * A separate trigger element would sit beside the input and double the width, so the input
   * itself is the circle — clicking it focuses and expands.
   */
  const glass = 'backdrop-blur-2xl backdrop-saturate-150';
  const skin = error
    ? isDark
      ? 'border-red-500/50 focus:border-red-500/70'
      : 'border-red-300 focus:border-red-400'
    : isDark
      ? collapsed
        ? `bg-white/10 border border-white/20 hover:bg-white/15 ${glass}`
        : `bg-zinc-900/50 border border-white/10 text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-400/60 focus:bg-zinc-900/70 hover:border-white/20 ${glass}`
      : collapsed
        ? `bg-white/40 border border-white/50 hover:bg-white/60 ${glass}`
        : `bg-white/60 border border-white/50 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400/60 focus:bg-white/80 ${glass}`;
  const iconColor = collapsed ? 'text-zinc-200' : isDark ? 'text-zinc-500' : 'text-zinc-400';

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className={`relative flex items-center ${compact ? 'justify-center' : ''}`}>
        <motion.input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setIsFocused(true);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (results.length > 0 || error) setIsOpen(true);
          }}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={collapsed ? '' : compact ? 'Search city…' : 'Search for a city…'}
          aria-label="Search for a city"
          className={`pointer-events-auto rounded-full outline-none transition-all duration-500 ease-out ${
            compact
              ? expanded
                ? 'w-full h-11 pl-11 pr-12 text-sm'
                : 'w-11 h-11 pl-0 pr-0 text-transparent cursor-pointer'
              : 'w-full pl-12 pr-6 py-3.5 text-base'
          } ${skin}`}
        />

        {/* Search icon: centred in the circle, slides to the leading edge once expanded. */}
        <div
          className={`absolute pointer-events-none flex items-center justify-center transition-all duration-500 ease-out ${
            compact
              ? expanded
                ? 'left-3 w-3.5 h-3.5'
                : 'left-1/2 -translate-x-1/2 w-5 h-5'
              : 'left-4 w-4 h-4'
          } ${iconColor}`}
        >
          <Search />
        </div>

        <AnimatePresence>
          {expanded && query.length > 0 && (
            <motion.button
              key="icon-clear"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              onClick={handleClear}
              className="pointer-events-auto absolute right-3 flex items-center justify-center w-6 h-6 rounded-full bg-white/10 backdrop-blur-xl backdrop-saturate-150 border border-white/20 text-zinc-400 hover:bg-white/20 hover:text-zinc-200 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isOpen && (results.length > 0 || error || isSearching) && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={`pointer-events-auto absolute top-full mt-2 w-full rounded-2xl shadow-xl overflow-hidden z-50 border ${
              isDark
                ? 'bg-zinc-900/95 border-white/10 backdrop-blur-2xl'
                : 'bg-white/95 border-white/30 backdrop-blur-2xl'
            }`}
          >
            {isSearching && results.length === 0 && !error ? (
              <div
                className={`flex items-center gap-2 px-5 py-3 text-sm ${
                  isDark ? 'text-zinc-500' : 'text-zinc-400'
                }`}
                role="status"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : results.length > 0 ? (
              results.map((city, i) => (
                <button
                  key={`${city.lat}-${city.lon}-${i}`}
                  onClick={() => handleSelect(city)}
                  className={`w-full px-5 py-3 text-left transition-colors duration-150 ${
                    isDark ? 'hover:bg-white/5 text-zinc-100' : 'hover:bg-zinc-50 text-zinc-900'
                  }`}
                >
                  <span className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>
                    {city.name}
                  </span>
                  <span className={`ml-2 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {city.displayName.split(',').slice(1, 3).join(',').trim()}
                  </span>
                </button>
              ))
            ) : (
              <p className={`px-5 py-3 text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {error?.message ?? `No cities matched “${query.trim()}”.`}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CitySearch;
