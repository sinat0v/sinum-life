import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Info, ArrowRight } from 'lucide-react';

export const Auth: React.FC = () => {
  const { userData, user, initializeUser } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If user is logged in but has no profile, show setup
  const showSetup = !!user && !userData;

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setLogin('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    // Internal email for Firebase Auth
    const cleanLogin = login.trim();
    const email = cleanLogin.includes('@') ? cleanLogin : `${cleanLogin.toLowerCase()}@sinum.life`;

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err.code, err.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('неверный логин или пароль');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('этот логин уже занят');
      } else if (err.code === 'auth/weak-password') {
        setError('пароль слишком короткий (мин. 6)');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('вход по паролю отключен в firebase (проверьте консоль)');
      } else {
        setError('ошибка авторизации');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.startsWith('@') ? username : `@${username}`;
    if (cleanUsername.length < 3) {
      setError('никнейм слишком короткий');
      return;
    }
    if (!/^[a-zA-Z0-9_@]+$/.test(cleanUsername)) {
      setError('никнейм может содержать только латинские буквы и цифры');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await initializeUser(cleanUsername.toLowerCase(), displayName);
    } catch (err: any) {
      setError(err.message || 'ошибка инициализации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 font-sans text-[#E0E0E0] lowercase">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-[#0F0F0F] border border-[#2A2A2A] p-10 shadow-2xl rounded-[48px]"
      >
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">sinum-life</h1>
          <div className="h-0.5 bg-white/10 w-12 mx-auto rounded-full"></div>
        </div>

        <AnimatePresence mode="wait">
          {!showSetup ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-[#444] mb-2 px-1 uppercase font-bold tracking-widest">логин</label>
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      required
                      className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm focus:border-white/40 outline-none transition-all rounded-[24px]"
                      placeholder="логин"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#444] mb-2 px-1 uppercase font-bold tracking-widest">пароль</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm focus:border-white/40 outline-none transition-all rounded-[24px]"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-[10px] text-red-500 bg-red-500/5 p-4 rounded-3xl flex items-center gap-3 border border-red-500/10">
                    <Info size={16} className="shrink-0" />
                    <span>{error.toLowerCase()}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black py-5 font-bold text-xs rounded-[24px] hover:bg-[#ddd] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl active:scale-95"
                >
                  {loading ? 'загрузка...' : isLogin ? 'войти' : 'зарегистрироваться'}
                </button>

                  <div className="pt-6 text-center border-t border-white/5">
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="group flex flex-col items-center gap-2 mx-auto transition-all"
                    >
                      <span className="text-[10px] text-[#444] font-bold uppercase tracking-widest group-hover:text-white/40">
                        {isLogin ? 'нет аккаунта?' : 'уже есть аккаунт?'}
                      </span>
                      <span className="text-xs font-bold text-white group-hover:underline">
                        {isLogin ? 'создать новый' : 'войти в профиль'}
                      </span>
                    </button>
                  </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="mb-6">
                <h2 className="text-sm font-medium mb-1 text-white">привет, путник</h2>
                <p className="text-[10px] text-[#444]">создай свою личность в мире синум</p>
              </div>

              <form onSubmit={handleSetup} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-[#444] mb-2 px-1 uppercase font-bold tracking-widest">никнейм (english)</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm focus:border-white/40 outline-none transition-all rounded-[24px]"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#444] mb-2 px-1 uppercase font-bold tracking-widest">отображаемое имя</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm focus:border-white/40 outline-none transition-all rounded-[24px]"
                      placeholder="имя фамилия"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-[10px] text-red-500 bg-red-500/5 p-4 rounded-3xl flex items-center gap-3 border border-red-500/10">
                    <Info size={16} className="shrink-0" />
                    <span>{error.toLowerCase()}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black py-5 font-bold text-xs rounded-[24px] hover:bg-[#ddd] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl active:scale-95"
                >
                  {loading ? 'загрузка...' : 'начать путь'} <ArrowRight size={14} />
                </button>

                <div className="pt-2 text-center">
                   <button 
                    type="button"
                    onClick={() => signOut(auth)}
                    className="text-[9px] text-[#333] hover:text-[#555]"
                   >
                     отмена
                   </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
