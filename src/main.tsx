import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './theme'; // applies the saved theme (index.html already did, before the first paint)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
