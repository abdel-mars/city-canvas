import { motion } from 'framer-motion';

interface MenuToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}

const MenuToggle = ({ isOpen, onToggle }: MenuToggleProps) => {
  return (
    <button
      onClick={onToggle}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:border-foreground/20 transition-colors"
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
    >
      <svg width="18" height="14" viewBox="0 0 18 14" className="text-muted-foreground">
        <motion.line
          x1="1" x2="17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={isOpen
            ? { y1: 7, y2: 7, rotate: 45, originX: '50%', originY: '50%' }
            : { y1: 2, y2: 2, rotate: 0 }
          }
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        />
        <motion.line
          x1="1" x2="17"
          y1="7" y2="7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={isOpen
            ? { opacity: 0, x1: 9, x2: 9 }
            : { opacity: 1, x1: 1, x2: 17 }
          }
          transition={{ duration: 0.15 }}
        />
        <motion.line
          x1="1" x2="17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={isOpen
            ? { y1: 7, y2: 7, rotate: -45, originX: '50%', originY: '50%' }
            : { y1: 12, y2: 12, rotate: 0 }
          }
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        />
      </svg>
    </button>
  );
};

export default MenuToggle;
