import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCitySearch } from '@/hooks/useCitySearch';
import { useTheme } from '@/hooks/useTheme';
import { City } from '@/types/artwork';

interface CitySearchProps {
  onSelect: (city: City) => void;
  compact?: boolean;
}

const CitySearch = ({ onSelect, compact = false }: CitySearchProps) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { results, search, clearResults } = useCitySearch();
  const { theme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    search(query);
  }, [query, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (city: City) => {
    setQuery(city.name);
    setIsOpen(false);
    clearResults();
    onSelect(city);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search
          className={`absolute pointer-events-none transition-colors duration-300 ${
            compact ? 'left-3 w-3.5 h-3.5' : 'left-4 w-4 h-4'
          } ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={compact ? 'Search city…' : 'Search for a city…'}
          className={`w-full rounded-full outline-none transition-all duration-300 ${
            compact ? 'pl-9 pr-4 py-2 text-sm' : 'pl-12 pr-6 py-3.5 text-base'
          } ${
            isDark
              ? 'bg-zinc-900/80 border border-zinc-800/60 text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:bg-zinc-950 shadow-xl shadow-black/10'
              : 'bg-white/80 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400/60 focus:bg-white shadow-xl shadow-zinc-200/50'
          } backdrop-blur-md hover:border-zinc-400/30 dark:hover:border-zinc-700/50`}
        />
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full mt-2 w-full rounded-2xl shadow-xl overflow-hidden z-50 border ${
              isDark
                ? 'bg-zinc-900 border-zinc-800'
                : 'bg-white border-zinc-200'
            }`}
          >
            {results.map((city, i) => (
              <button
                key={`${city.lat}-${city.lon}-${i}`}
                onClick={() => handleSelect(city)}
                className={`w-full px-5 py-3 text-left transition-colors duration-150 ${
                  isDark
                    ? 'hover:bg-zinc-800 text-zinc-100'
                    : 'hover:bg-zinc-50 text-zinc-900'
                }`}
              >
                <span className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>
                  {city.name}
                </span>
                <span className={`ml-2 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {city.displayName.split(',').slice(1, 3).join(',').trim()}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CitySearch;
