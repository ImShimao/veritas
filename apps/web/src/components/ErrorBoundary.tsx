import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Barrière d'erreur.
 *
 * Sans elle, une exception dans n'importe quel composant de rendu laisse une
 * page blanche — le pire résultat possible pour l'utilisateur. Ici, on capture
 * l'erreur, on affiche un écran de secours lisible, et on offre un moyen de
 * repartir sans perdre l'application entière.
 *
 * React impose une classe pour cette fonctionnalité : c'est le seul endroit du
 * frontend qui n'est pas un composant fonction.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // En développement, la trace complète aide au diagnostic ; en production,
    // elle reste dans la console de l'utilisateur, sans jamais partir sur le réseau.
    console.error('Erreur de rendu interceptée :', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <RefreshCw className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-ink">Quelque chose s'est mal passé</h1>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-muted text-pretty">
            Une erreur inattendue est survenue dans l'affichage. Vos analyses sont sauvegardées :
            rien n'est perdu.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-elevated px-4 text-sm font-medium text-ink transition-colors hover:border-border-strong"
            >
              Retour à l'accueil
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded-lg bg-elevated p-3 text-left font-mono text-2xs text-faint">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
