
import wb1 from '@/assets/wb 1.svg';

const BackgroundArt = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <img
        src={wb1}
        alt="Background Art"
        className="w-full h-full object-cover"
        style={{
          pointerEvents: 'none',
          transform: 'scale(1.2)',
          objectPosition: 'center',
          opacity: 0.25,
        }}
      />
    </div>
  );
};

export default BackgroundArt;
