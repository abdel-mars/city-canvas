import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
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
  const { results, search, clearResults } = useCitySearch();
  const wrapperRef = useRef<HTMLDivElement>(null);

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
        <Search className={`absolute left-4 text-muted-foreground ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search for a city..."
          className={`w-full bg-secondary/50 border border-border rounded-full outline-none transition-all duration-300 placeholder:text-muted-foreground/50 focus:border-foreground/20 focus:bg-secondary/80 ${
            compact
              ? 'pl-10 pr-4 py-2 text-sm'
              : 'pl-12 pr-6 py-4 text-base'
          }`}
        />
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 w-full bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-50"
          >
            {results.map((city, i) => (
              <button
                key={`${city.lat}-${city.lon}-${i}`}
                onClick={() => handleSelect(city)}
                className="w-full px-5 py-3 text-left hover:bg-secondary/60 transition-colors duration-150"
              >
                <span className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>
                  {city.name}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">
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
