import { useEffect, useState } from 'react';
import { homePath, navigate } from '../routing';

const sectionLinks = [
  { label: 'Home', rowId: 'top' },
  { label: 'Puzzle', rowId: 'puzzle' },
  { label: 'Arcade', rowId: 'arcade' },
  { label: 'Strategy', rowId: 'strategy' },
  { label: 'Coming Soon', rowId: 'coming-soon' },
];

export default function NavBar() {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setHasScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToRow = (rowId: string) => {
    if (rowId === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    document.getElementById(`row-${rowId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className={`nav ${hasScrolled ? 'nav--solid' : ''}`}>
      <a className="nav__logo" href={homePath} onClick={() => { navigate(homePath); window.scrollTo({ top: 0 }); }}>
        Kush<span>Games</span>
      </a>
      <ul className="nav__links">
        {sectionLinks.map(link => (
          <li key={link.rowId}>
            <button type="button" onClick={() => scrollToRow(link.rowId)}>{link.label}</button>
          </li>
        ))}
      </ul>
      <div className="nav__profile" title="Player">K</div>
    </nav>
  );
}
