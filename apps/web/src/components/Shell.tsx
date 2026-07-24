import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, History, Moon, ScanSearch, Shield, Sun, Layers, WifiOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Analyser', icon: ScanSearch, end: true },
  { to: '/historique', label: 'Historique', icon: History, end: false },
  { to: '/criteres', label: 'Critères', icon: Layers, end: false },
];

/** Thème persistant, initialisé par le script en tête de `index.html`. */
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('veritas.theme', theme);
    } catch {
      /* Navigation privée : le thème ne survivra pas au rechargement, sans conséquence. */
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')) };
}

export function Shell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const [unread, setUnread] = useState(0);
  const [serverDown, setServerDown] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api
        .alerts(true)
        .then((result) => {
          if (cancelled) return;
          setUnread(result.unread);
          setServerDown(false);
        })
        .catch((error: unknown) => {
          // Un serveur injoignable est signalé clairement plutôt que silencieusement.
          if (!cancelled && error instanceof ApiError && error.code === 'NETWORK') {
            setServerDown(true);
          }
        });
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen canvas-gradient">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Aller au contenu principal
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="text-[0.9375rem]">Veritas</span>
          </NavLink>

          <nav className="ml-2 flex items-center gap-0.5" aria-label="Navigation principale">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
                    isActive ? 'text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-lg bg-elevated"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      <item.icon className="h-3.5 w-3.5" aria-hidden />
                      <span className="hidden sm:inline">{item.label}</span>
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <NavLink
              to="/alertes"
              className="relative rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-ink"
              aria-label={unread > 0 ? `Alertes (${unread} non lues)` : 'Alertes'}
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>

            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-ink"
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {serverDown && (
        <div
          role="alert"
          className="border-b border-danger/25 bg-danger/10 px-4 py-2.5 text-center text-[0.8125rem] text-danger sm:px-6"
        >
          <span className="inline-flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            Le moteur Veritas est injoignable. Vérifiez que le serveur tourne (
            <code className="font-mono">npm run dev</code>), puis les analyses reprendront.
          </span>
        </div>
      )}

      <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <p className="text-2xs leading-relaxed text-faint">
          Veritas analyse localement, sur votre machine. Aucune annonce, aucune photo et aucune
          question ne sont transmises à un service externe. Les analyses sont chiffrées au repos.
        </p>
      </footer>
    </div>
  );
}
