import { useEffect, useState } from 'react';
import { homePath, navigate } from '../routing';
import type { GenreChoice } from './GenreFilter';

type NavLink = { label: string; target: 'top' | 'coming-soon' | GenreChoice };
const sectionLinks: NavLink[] = [
  { label: 'Home', target: 'top' },
  { label: 'Puzzle', target: 'Puzzle' },
  { label: 'Arcade', target: 'Arcade' },
  { label: 'Strategy', target: 'Strategy' },
  { label: 'Coming Soon', target: 'coming-soon' },
];

/** Genre links filter the All games grid and scroll to it. */
export default function NavBar({ onShowGenre, hasComingSoon = false }: { onShowGenre: (genre: GenreChoice) => void; hasComingSoon?: boolean }) {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setHasScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const goTo = (target: NavLink['target']) => {
    if (target === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (target === 'coming-soon') { document.getElementById('row-coming-soon')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    onShowGenre(target);
  };

  return (
    <nav className={`nav ${hasScrolled ? 'nav--solid' : ''}`}>
      <a className="nav__logo" href={homePath} onClick={() => { navigate(homePath); window.scrollTo({ top: 0 }); }}>
        Kush<span>Games</span>
      </a>
      <ul className="nav__links">
        {sectionLinks.filter(link => hasComingSoon || link.target !== 'coming-soon').map(link => (
          <li key={link.label}>
            <button type="button" onClick={() => goTo(link.target)}>{link.label}</button>
          </li>
        ))}
      </ul>
      <div className="nav__profile" title="Player">K</div>
    </nav>
  );
}
