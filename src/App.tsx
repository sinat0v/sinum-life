/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FirebaseProvider, useAuth } from './components/FirebaseProvider';
import { Auth } from './components/Auth';
import { Game } from './components/Game';

function AppContent() {
  const { user, userData, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center font-sans">
        <div className="text-white text-xs tracking-[0.3em] animate-pulse">инициализация мира...</div>
      </div>
    );
  }

  if (!user || !userData) {
    return <Auth />;
  }

  return <Game />;
}

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}
