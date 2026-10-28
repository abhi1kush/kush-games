import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { clearRemovedGameData, migrateRenamedGameData } from './games/persistence';
import './theme'; // applies the saved theme (index.html already did, before the first paint)

clearRemovedGameData();
migrateRenamedGameData(); // e.g. 2048 → Power of 2: keeps the in-progress game and best score

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
