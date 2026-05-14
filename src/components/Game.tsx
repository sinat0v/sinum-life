import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, onSnapshot, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownLeft, 
  X, 
  User, 
  ShoppingCart, 
  Store,
  ChevronRight,
  Package,
  Trash2,
  Wallet,
  Coins,
  Home as HomeIcon,
  Bed,
  LogOut,
  Moon
} from 'lucide-react';
import { Vector2, UserData, InventoryItem, HomeData } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const PLAYER_SIZE = 14;
const SPEED = 4;

const BANK_POS = { x: 800, y: 800, w: 140, h: 140, name: 'sinum-bank' };
const SHOP_POS = { x: 1200, y: 800, w: 200, h: 140, name: 'sinum-market' };
const HOME_EXIT_WORLD = { x: 1000, y: 1200, w: 140, h: 140, name: 'жилой сектор' };

const HOME_LAYOUT = {
  width: 800,
  height: 600,
  rooms: [
    { id: 'hallway', x: 300, y: 400, w: 200, h: 200, name: 'коридор' },
    { id: 'living', x: 200, y: 100, w: 400, h: 300, name: 'гостиная' },
    { id: 'kitchen', x: 600, y: 100, w: 200, h: 200, name: 'кухня' },
    { id: 'bedroom', x: 0, y: 100, w: 200, h: 200, name: 'спальня' },
  ],
  entrance: { x: 400, y: 550 },
  bed: { x: 40, y: 140, w: 100, h: 140 }
};

const HOME_PRICE = 50000;

const SHOP_ITEMS: InventoryItem[] = [
  { id: 'apple', name: 'яблоко', price: 50, type: 'food', value: 10 },
  { id: 'bread', name: 'хлеб', price: 80, type: 'food', value: 20 },
  { id: 'milk', name: 'молоко', price: 120, type: 'food', value: 15 },
  { id: 'energy_drink', name: 'энергетик', price: 250, type: 'food', value: 40 },
  { id: 'sandwich', name: 'бутерброд', price: 180, type: 'food', value: 30 },
];

export const Game: React.FC = () => {
  const { userData, user } = useAuth();
  const [pos, setPos] = useState<Vector2>({ x: 1000, y: 1000 });
  const [otherPlayers, setOtherPlayers] = useState<UserData[]>([]);
  const hasInitializedPos = useRef(false);

  // Sync pos once on load
  useEffect(() => {
    if (userData?.lastPosition && !hasInitializedPos.current) {
      setPos(userData.lastPosition);
      hasInitializedPos.current = true;
    }
  }, [userData]);
  
  // UI States
  const [isNearBank, setIsNearBank] = useState(false);
  const [isNearShop, setIsNearShop] = useState(false);
  const [isNearHomeEntrance, setIsNearHomeEntrance] = useState(false);
  const [isInsideHome, setIsInsideHome] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isNearBed, setIsNearBed] = useState(false);

  const [showBankMenu, setShowBankMenu] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showHomePurchase, setShowHomePurchase] = useState(false);
  
  // Shop Logic
  const [hasTrolley, setHasTrolley] = useState(false);
  const [trolleyItems, setTrolleyItems] = useState<InventoryItem[]>([]);
  
  const [bankAmount, setBankAmount] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const requestRef = useRef<number>(0);
  const keys = useRef<Set<string>>(new Set());

  // Format currency
  const fmt = (val: number | undefined) => {
    return new Intl.NumberFormat('ru-RU').format(val ?? 0) + ' ₽';
  };

  // Sync other players
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users'), where('visibility', '==', 'public'));
    const unsub = onSnapshot(q, (snap) => {
      const players: UserData[] = [];
      snap.forEach((doc) => {
        if (doc.id !== user.uid) {
          players.push(doc.data() as UserData);
        }
      });
      setOtherPlayers(players);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsub();
  }, [user]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (e.code === 'KeyI') setShowInventory(prev => !prev);
      if (e.code === 'Escape') {
        setShowBankMenu(false);
        setShowShopMenu(false);
        setShowInventory(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Proximity checks
  useEffect(() => {
    if (isInsideHome) {
      const distBed = Math.sqrt(
        Math.pow(pos.x - (HOME_LAYOUT.bed.x + HOME_LAYOUT.bed.w / 2), 2) +
        Math.pow(pos.y - (HOME_LAYOUT.bed.y + HOME_LAYOUT.bed.h / 2), 2)
      );
      setIsNearBed(distBed < 80);
      
      const distExit = Math.sqrt(
        Math.pow(pos.x - HOME_LAYOUT.entrance.x, 2) +
        Math.pow(pos.y - HOME_LAYOUT.entrance.y, 2)
      );
      setIsNearHomeEntrance(distExit < 60);
      return;
    }

    const distBank = Math.sqrt(
      Math.pow(pos.x - (BANK_POS.x + BANK_POS.w / 2), 2) +
      Math.pow(pos.y - (BANK_POS.y + BANK_POS.h / 2), 2)
    );
    const distShop = Math.sqrt(
      Math.pow(pos.x - (SHOP_POS.x + SHOP_POS.w / 2), 2) +
      Math.pow(pos.y - (SHOP_POS.y + SHOP_POS.h / 2), 2)
    );
    const distHome = Math.sqrt(
      Math.pow(pos.x - (HOME_EXIT_WORLD.x + HOME_EXIT_WORLD.w / 2), 2) +
      Math.pow(pos.y - (HOME_EXIT_WORLD.y + HOME_EXIT_WORLD.h / 2), 2)
    );

    setIsNearBank(distBank < 100);
    setIsNearShop(distShop < 120);
    setIsNearHomeEntrance(distHome < 100);

    if (distBank >= 100 && showBankMenu) setShowBankMenu(false);
    if (distShop >= 120 && showShopMenu) setShowShopMenu(false);
  }, [pos, showBankMenu, showShopMenu, isInsideHome]);

  // Save loop
  useEffect(() => {
    if (!user || !userData) return;
    const interval = setInterval(async () => {
      // Passive stats decay
      let energyDelta = -0.1;
      if (isSleeping) energyDelta = 2.0;

      const newStats = {
        ...userData.stats,
        hunger: Math.max(0, (userData.stats?.hunger || 100) - 0.2),
        energy: Math.min(100, Math.max(0, (userData.stats?.energy || 100) + energyDelta)),
      };

      if (isSleeping && newStats.energy >= 100) {
        setIsSleeping(false);
        setMessage("сон окончен");
      }

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lastPosition: pos,
          stats: newStats,
          currentRoom: isInsideHome ? 'home' : 'world',
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("save error:", error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [pos, user, userData, isSleeping, isInsideHome]);

  const enterHome = () => {
    if (!userData?.homeId && !showHomePurchase) {
      setShowHomePurchase(true);
      return;
    }
    if (userData?.homeId) {
      setIsInsideHome(true);
      setPos({ x: HOME_LAYOUT.entrance.x, y: HOME_LAYOUT.entrance.y - 40 });
      setMessage("вы дома");
    }
  };

  const exitHome = () => {
    setIsInsideHome(false);
    setPos({ x: HOME_EXIT_WORLD.x + HOME_EXIT_WORLD.w / 2, y: HOME_EXIT_WORLD.y + HOME_EXIT_WORLD.h + 20 });
    setMessage("вы вышли");
  };

  const buyHome = async () => {
    if (!user || !userData) return;
    if (userData.balance < HOME_PRICE) {
      setMessage("недостаточно наличных");
      return;
    }

    try {
      const homeId = `studio_${user.uid}`;
      await updateDoc(doc(db, 'users', user.uid), {
        balance: userData.balance - HOME_PRICE,
        homeId: homeId,
        updatedAt: serverTimestamp()
      });
      setShowHomePurchase(false);
      setMessage("поздравляем с покупкой!");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const update = useCallback(() => {
    if (showBankMenu || showShopMenu || isSleeping) return;
    
    setPos((prev) => {
      let newX = prev.x;
      let newY = prev.y;

      let moved = false;
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) { newY -= SPEED; moved = true; }
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) { newY += SPEED; moved = true; }
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) { newX -= SPEED; moved = true; }
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) { newX += SPEED; moved = true; }

      if (keys.current.has('KeyE')) {
        if (isInsideHome) {
          if (isNearHomeEntrance) exitHome();
          if (isNearBed) {
            setIsSleeping(true);
            setMessage("спим...");
          }
        } else {
          if (isNearBank && !showBankMenu) setShowBankMenu(true);
          if (isNearShop && !showShopMenu) setShowShopMenu(true);
          if (isNearHomeEntrance) enterHome();
        }
      }

      if (isInsideHome) {
        newX = Math.max(20, Math.min(HOME_LAYOUT.width - 20, newX));
        newY = Math.max(20, Math.min(HOME_LAYOUT.height - 20, newY));
      } else {
        newX = Math.max(0, Math.min(MAP_WIDTH, newX));
        newY = Math.max(0, Math.min(MAP_HEIGHT, newY));
      }

      return { x: newX, y: newY };
    });
    requestRef.current = requestAnimationFrame(update);
  }, [isNearBank, isNearShop, isNearHomeEntrance, isNearBed, isInsideHome, isSleeping, showBankMenu, showShopMenu]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  const handleBankAction = async (type: 'deposit' | 'withdraw' | 'credit') => {
    if (!user || !userData) return;
    
    try {
      if (type === 'deposit') {
        const amount = parseInt(bankAmount);
        if (isNaN(amount) || amount <= 0) {
          setMessage("введите сумму");
          return;
        }
        if ((userData.balance ?? 0) < amount) {
          setMessage("мало наличных");
          return;
        }
        await updateDoc(doc(db, 'users', user.uid), {
          balance: (userData.balance ?? 0) - amount,
          bankBalance: (userData.bankBalance ?? 0) + amount,
          updatedAt: serverTimestamp()
        });
        setMessage(`внесено: ${fmt(amount)}`);
        setBankAmount('');
      } else if (type === 'withdraw') {
        const amount = parseInt(bankAmount);
        if (isNaN(amount) || amount <= 0) {
          setMessage("введите сумму");
          return;
        }
        if ((userData.bankBalance ?? 0) < amount) {
          setMessage("мало на вкладе");
          return;
        }
        await updateDoc(doc(db, 'users', user.uid), {
          balance: (userData.balance ?? 0) + amount,
          bankBalance: (userData.bankBalance ?? 0) - amount,
          updatedAt: serverTimestamp()
        });
        setMessage(`снято: ${fmt(amount)}`);
        setBankAmount('');
      } else if (type === 'credit') {
        const amount = parseInt(creditAmount);
        if (isNaN(amount) || amount <= 0) {
          setMessage("введите сумму кредита");
          return;
        }
        await updateDoc(doc(db, 'users', user.uid), {
          balance: (userData.balance ?? 0) + amount,
          credits: (userData.credits ?? 0) + amount,
          updatedAt: serverTimestamp()
        });
        setMessage(`взят кредит: ${fmt(amount)}`);
        setCreditAmount('');
      }
    } catch (err: any) {
      console.error("Bank error:", err);
      setMessage("ошибка (rules)");
      if (err.message?.includes('permission-denied')) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const handleShopAction = async () => {
    if (!user || !userData) return;
    const total = trolleyItems.reduce((acc, item) => acc + item.price, 0);
    
    if (total === 0) {
      setMessage("корзина пуста");
      return;
    }

    if ((userData.balance ?? 0) < total) {
      setMessage("недостаточно наличных");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        balance: (userData.balance ?? 0) - total,
        inventory: [...(userData.inventory || []), ...trolleyItems],
        updatedAt: serverTimestamp()
      });
      setTrolleyItems([]);
      setHasTrolley(false);
      setShowShopMenu(false);
      setMessage(`куплено на ${fmt(total)}`);
    } catch (err: any) {
      console.error("Shop error:", err);
      setMessage("ошибка оплаты (rules)");
      if (err.message?.includes('permission-denied')) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const consumeItem = async (index: number) => {
    if (!user || !userData) return;
    const item = userData.inventory[index];
    if (item.type !== 'food') return;

    const newInventory = [...userData.inventory];
    newInventory.splice(index, 1);

    const newStats = {
      ...userData.stats,
      hunger: Math.min(100, (userData.stats.hunger || 100) + item.value),
      energy: Math.min(100, (userData.stats.energy || 100) + (item.id === 'energy_drink' ? 30 : 5))
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        inventory: newInventory,
        stats: newStats,
        updatedAt: serverTimestamp()
      });
      setMessage(`использовано: ${item.name}`);
    } catch (err) {
      setMessage("ошибка");
    }
  };

  return (
    <div className="flex flex-col w-full h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans p-6 select-none overflow-hidden lowercase">
      {/* Шапка */}
      <header className="flex justify-between items-center border-b border-[#2A2A2A] pb-4 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-white">sinum-life</h1>
          <span className="px-4 py-1.5 bg-[#1A1A1A] text-[10px] text-green-400 rounded-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
            в сети
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#444] font-medium px-2">время</div>
          <div className="text-xs bg-white/5 px-3 py-1 rounded-full">{new Date().toLocaleTimeString().toLowerCase()}</div>
        </div>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Боковая панель */}
        <aside className="w-80 flex flex-col gap-6 overflow-y-auto pr-1">
          {/* Профиль */}
          <section className="p-5 border border-[#2A2A2A] bg-[#0F0F0F] rounded-[28px] shadow-2xl">
            <h2 className="text-[10px] mb-4 text-[#666] font-bold px-1 tracking-widest">личность</h2>
            <div className="flex items-center gap-4 p-4 bg-[#0A0A0A] border border-[#222] rounded-[24px]">
              <div className="bg-white/5 p-3 rounded-2xl text-white/40">
                <User size={24} />
              </div>
              <div className="overflow-hidden">
                <div className="text-sm font-bold truncate text-white">{userData?.displayName}</div>
                <div className="text-[9px] text-[#444] font-mono mt-0.5">{userData?.username}</div>
              </div>
            </div>
          </section>

          {/* Статистика */}
          <section className="p-6 border border-[#2A2A2A] bg-[#0F0F0F] flex-1 rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
            <h2 className="text-[10px] mb-6 text-[#666] font-bold tracking-widest">показатели</h2>
            
            <div className="space-y-6 flex-1">
              <div className="space-y-4">
                {[
                  { label: 'здоровье', val: userData?.stats?.health, color: 'bg-red-400' },
                  { label: 'голод', val: userData?.stats?.hunger, color: 'bg-orange-400' },
                  { label: 'энергия', val: userData?.stats?.energy, color: 'bg-blue-400' }
                ].map((s) => (
                  <div key={s.label} className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-[#555] font-bold px-1">
                      <span>{s.label}</span>
                      <span>{(s.val ?? 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${s.val ?? 100}%` }}
                        className={`h-full ${s.color} shadow-[0_0_10px_rgba(255,255,255,0.1)]`} 
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-px bg-[#1A1A1A]"></div>

              <div className="space-y-4">
                {[
                  { label: 'наличные', val: userData?.balance, color: 'text-green-400' },
                  { label: 'банк', val: userData?.bankBalance, color: 'text-white/60' },
                  { label: 'кредиты', val: userData?.credits, color: 'text-orange-400/80' }
                ].map((m) => (
                  <div key={m.label} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/[0.02]">
                    <span className="text-[10px] text-[#444] font-bold">{m.label}</span>
                    <span className={`text-sm font-bold ${m.color}`}>{fmt(m.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => signOut(auth)}
              className="mt-6 p-4 border border-[#222] text-[10px] text-[#444] font-bold rounded-2xl hover:bg-white hover:text-black transition-all active:scale-95"
            >
              выйти из системы
            </button>
          </section>
        </aside>

        {/* Мир игры */}
        <main className="flex-1 flex flex-col border border-[#2A2A2A] relative overflow-hidden bg-[#050505] rounded-[48px] shadow-[0_0_80px_rgba(0,0,0,0.8)]">
          <div className="relative flex-1 overflow-hidden">
            <div 
              className="absolute inset-0 transition-transform duration-100 ease-out"
              style={{ 
                transform: isInsideHome 
                  ? `translate(${window.innerWidth/2 - 160 - pos.x}px, ${window.innerHeight/2 - 120 - pos.y}px)`
                  : `translate(${window.innerWidth/2 - 160 - pos.x}px, ${window.innerHeight/2 - 120 - pos.y}px)` 
              }}
            >
              {isInsideHome ? (
                // Home Interior
                <div 
                  className="absolute bg-[#0D0D0D]"
                  style={{ width: HOME_LAYOUT.width, height: HOME_LAYOUT.height }}
                >
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                  
                  {/* Walls & Rooms */}
                  {HOME_LAYOUT.rooms.map(room => (
                    <div 
                      key={room.id}
                      className="absolute border border-white/10 flex items-start p-4 text-[10px] font-bold text-[#222] uppercase tracking-widest"
                      style={{ left: room.x, top: room.y, width: room.w, height: room.h }}
                    >
                      {room.name}
                    </div>
                  ))}

                  {/* Bed */}
                  <div 
                    className="absolute bg-[#1A1A1A] border border-white/5 rounded-xl flex items-center justify-center text-white/5 shadow-2xl"
                    style={{ left: HOME_LAYOUT.bed.x, top: HOME_LAYOUT.bed.y, width: HOME_LAYOUT.bed.w, height: HOME_LAYOUT.bed.h }}
                  >
                    <Bed size={40} />
                  </div>

                  {/* Exit */}
                  <div 
                    className="absolute bg-white/5 w-40 h-4 bottom-0 left-1/2 -translate-x-1/2 rounded-full blur-sm"
                  />
                </div>
              ) : (
                // World Map
                <>
                  <div 
                    className="absolute bg-[#080808]"
                    style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
                  />
                  
                  {/* Дороги */}
                  <div className="absolute bg-[#121212] w-[3000px] h-[120px] top-[740px] -left-[500px] rounded-full opacity-50 blur-[2px]" />
                  <div className="absolute bg-[#121212] w-[120px] h-[3000px] left-[940px] -top-[500px] rounded-full opacity-50 blur-[2px]" />
                  
                  <div 
                    className="absolute opacity-5 pointer-events-none"
                    style={{ 
                      width: MAP_WIDTH, 
                      height: MAP_HEIGHT, 
                      backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', 
                      backgroundSize: '100px 100px' 
                    }}
                  />

                  {/* Банк */}
                  <div 
                    className="absolute bg-[#0F0F0F] border border-white/10 rounded-[40px] flex flex-col items-center justify-center shadow-2xl group transition-all"
                    style={{ left: BANK_POS.x, top: BANK_POS.y, width: BANK_POS.w, height: BANK_POS.h }}
                  >
                    <div className="bg-[#1A1A1A] p-5 rounded-[24px] mb-3 text-white/20 group-hover:text-white/40 group-hover:scale-110 transition-all">
                      <Landmark size={40} />
                    </div>
                    <div className="text-[10px] text-[#444] font-bold tracking-widest">{BANK_POS.name}</div>
                  </div>

                  {/* Магазин */}
                  <div 
                    className="absolute bg-[#0F0F0F] border border-white/10 rounded-[40px] flex flex-col items-center justify-center shadow-2xl group transition-all"
                    style={{ left: SHOP_POS.x, top: SHOP_POS.y, width: SHOP_POS.w, height: SHOP_POS.h }}
                  >
                    <div className="bg-[#1A1A1A] p-5 rounded-[24px] mb-3 text-white/20 group-hover:text-white/40 group-hover:scale-110 transition-all">
                      <Store size={40} />
                    </div>
                    <div className="text-[10px] text-[#444] font-bold tracking-widest">{SHOP_POS.name}</div>
                  </div>

                  {/* Жилой сектор */}
                  <div 
                    className="absolute bg-[#0F0F0F] border border-white/10 rounded-[40px] flex flex-col items-center justify-center shadow-2xl group transition-all"
                    style={{ left: HOME_EXIT_WORLD.x, top: HOME_EXIT_WORLD.y, width: HOME_EXIT_WORLD.w, height: HOME_EXIT_WORLD.h }}
                  >
                    <div className="bg-[#1A1A1A] p-5 rounded-[24px] mb-3 text-white/20 group-hover:text-white/40 group-hover:scale-110 transition-all">
                      <HomeIcon size={40} />
                    </div>
                    <div className="text-[10px] text-[#444] font-bold tracking-widest">{HOME_EXIT_WORLD.name}</div>
                  </div>

                  {/* Другие игроки */}
                  {otherPlayers.map(p => (
                    <div key={p.userId} className="absolute z-10" style={{ left: (p.lastPosition?.x || 0) - PLAYER_SIZE/2, top: (p.lastPosition?.y || 0) - PLAYER_SIZE/2 }}>
                       {p.currentRoom !== 'home' && (
                         <>
                           <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#0F0F0F]/80 backdrop-blur px-4 py-2 rounded-2xl border border-white/5 whitespace-nowrap text-center opacity-60">
                              <div className="text-[10px] font-bold text-white/80 leading-none">{(p.displayName || 'путник')}</div>
                              <div className="text-[8px] text-[#444] font-mono mt-1">{(p.username || '@unknown')}</div>
                           </div>
                           <div className="w-[14px] h-[14px] bg-white/10 rounded-full border border-white/20 shadow-xl" />
                         </>
                       )}
                    </div>
                  ))}
                </>
              )}

              {/* Игрок */}
              <motion.div 
                className="absolute z-40"
                style={{ left: (pos.x || 1000) - PLAYER_SIZE/2, top: (pos.y || 1000) - PLAYER_SIZE/2 }}
                initial={false}
              >
                {!isInsideHome && (
                  <div className="absolute -top-[52px] left-1/2 -translate-x-1/2 bg-[#1A1A1A] px-5 py-2.5 rounded-[22px] border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap text-center min-w-[100px]">
                    <div className="text-[11px] font-bold text-white leading-none">{(userData?.displayName || 'загрузка')}</div>
                    <div className="text-[9px] text-[#444] font-mono leading-none mt-1.5">{(userData?.username || '@...')}</div>
                  </div>
                )}
                <div className={`w-[16px] h-[16px] bg-white rounded-full shadow-[0_0_30px_rgba(255,255,255,0.6)] border-2 border-white/20 transition-all ${isSleeping ? 'scale-[0.8] opacity-50' : ''}`} />
              </motion.div>
            </div>

            <div className="absolute bottom-10 left-12 text-[9px] text-[#222] font-bold tracking-tighter opacity-80 uppercase">
              sinum-life // {isInsideHome ? 'home_interior' : 'stable_v5'} // x:{(pos.x || 0).toFixed(0)} y:{(pos.y || 0).toFixed(0)}
            </div>
            
            <AnimatePresence>
              {isSleeping && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-6"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-white/20"
                  >
                    <Moon size={120} strokeWidth={1} />
                  </motion.div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-white tracking-widest uppercase mb-2">сон</div>
                    <div className="text-[10px] text-[#444] font-bold uppercase tracking-[0.3em]">энергия восстанавливается</div>
                  </div>
                  <button 
                    onClick={() => setIsSleeping(false)}
                    className="mt-10 bg-white text-black px-10 py-4 rounded-3xl font-bold text-[10px] uppercase shadow-2xl active:scale-95 transition-all"
                  >
                    проснуться
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(isNearBank || isNearShop || isNearHomeEntrance || isNearBed) && !showBankMenu && !showShopMenu && !isSleeping && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-white text-black px-8 py-3.5 text-[11px] font-bold rounded-full shadow-[0_15px_40px_rgba(255,255,255,0.2)] flex items-center gap-4 hover:scale-105 transition-transform"
                >
                  <span className="bg-black/10 px-2.5 py-0.5 rounded-lg text-[9px]">e</span>
                  {isInsideHome ? (
                    isNearBed ? 'лечь спать' : 'выйти на улицу'
                  ) : (
                    isNearBank ? 'войти в sinum-bank' : isNearShop ? 'войти в sinum-market' : 'войти в жилье'
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Purchase Home Modal */}
            <AnimatePresence>
              {showHomePurchase && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[#050505]/95 backdrop-blur-md z-[70] flex items-center justify-center p-20"
                >
                  <div className="w-full max-w-xl bg-[#0F0F0F] border border-white/10 rounded-[48px] p-12 text-center shadow-2xl relative">
                    <button onClick={() => setShowHomePurchase(false)} className="absolute top-8 right-8 p-4 bg-white/5 hover:bg-white text-[#444] hover:text-black rounded-2xl transition-all">
                      <X />
                    </button>
                    <div className="bg-white/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-white/40">
                      <HomeIcon size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">ваше личное пространство</h3>
                    <p className="text-sm text-[#444] mb-10 leading-relaxed px-10">студия в центре sinum-city. место, где вы можете восстановить силы и хранить свои вещи в безопасности.</p>
                    
                    <div className="bg-[#0A0A0A] border border-[#222] p-8 rounded-[32px] mb-10 flex justify-between items-center">
                      <div className="text-left">
                        <div className="text-[10px] text-[#444] font-bold uppercase tracking-widest mb-1">стоимость</div>
                        <div className="text-2xl font-bold text-green-400">{fmt(HOME_PRICE)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-[#444] font-bold uppercase tracking-widest mb-1">ваш баланс</div>
                        <div className="text-xl font-bold text-white/60">{fmt(userData?.balance)}</div>
                      </div>
                    </div>

                    <button 
                      onClick={buyHome}
                      className="w-full bg-white text-black py-6 rounded-[24px] font-bold text-sm hover:bg-[#ddd] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                      подписать контракт <ArrowUpRight size={20} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Интерфейс Банка */}
          <AnimatePresence>
            {showBankMenu && (
              <motion.div 
                initial={{ y: 500 }}
                animate={{ y: 0 }}
                exit={{ y: 500 }}
                className="h-96 border-t border-[#2A2A2A] bg-[#0F0F0F] p-10 flex gap-10 z-50 rounded-t-[56px] shadow-[0_-30px_80px_rgba(0,0,0,0.6)]"
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="bg-white/5 p-4 rounded-3xl text-white/50">
                      <Landmark size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-white px-1">sinum-bank терминал</h3>
                      <p className="text-[10px] text-[#444] px-1">ваши финансы под защитой монолита</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] text-[#444] mb-2 block font-bold tracking-widest px-1">вклад/снятие</label>
                          <input
                            type="number"
                            value={bankAmount}
                            onChange={(e) => setBankAmount(e.target.value)}
                            className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm outline-none font-bold rounded-[22px] focus:border-white/20 transition-all mb-4"
                            placeholder="0 ₽"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => handleBankAction('deposit')} className="bg-white text-black h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-[10px] hover:bg-[#ddd] transition-all">
                              <ArrowUpRight size={16} /> положить
                            </button>
                            <button onClick={() => handleBankAction('withdraw')} className="bg-[#1A1A1A] text-white hover:bg-[#222] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-[10px] transition-all">
                              <ArrowDownLeft size={16} /> снять
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-[#444] mb-2 block font-bold tracking-widest px-1">займ/кредит</label>
                          <input
                            type="number"
                            value={creditAmount}
                            onChange={(e) => setCreditAmount(e.target.value)}
                            className="w-full bg-[#0A0A0A] border border-[#222] p-4 text-sm outline-none font-bold rounded-[22px] focus:border-white/20 transition-all mb-4"
                            placeholder="0 ₽"
                          />
                          <button onClick={() => handleBankAction('credit')} className="w-full bg-orange-500/10 text-orange-400 h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-[10px] hover:bg-orange-500/20 border border-orange-500/20 transition-all">
                            <Coins size={16} /> взять кредит
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div className="bg-[#0A0A0A] border border-[#222] p-8 rounded-[40px] flex flex-col justify-center shadow-inner">
                          <div className="text-[10px] text-[#444] mb-2 font-bold px-1 uppercase tracking-widest">баланс счета</div>
                          <div className="text-4xl font-light text-white mb-2 tabular-nums">{fmt(userData?.bankBalance)}</div>
                          <div className="h-1 bg-white/5 w-full rounded-full overflow-hidden mt-4">
                             <div className="h-full bg-blue-500/50 w-1/4 animate-[pulse_3s_infinite]" />
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowBankMenu(false)} className="self-start p-4 bg-white/5 hover:bg-white/10 rounded-[24px] transition-colors">
                  <X />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Интерфейс Магазина */}
          <AnimatePresence>
            {showShopMenu && (
              <motion.div 
                initial={{ y: 600 }}
                animate={{ y: 0 }}
                exit={{ y: 600 }}
                className="h-full max-h-[600px] border-t border-[#2A2A2A] bg-[#0F0F0F] flex flex-col z-50 rounded-t-[64px] shadow-[0_-30px_100px_rgba(0,0,0,0.7)] overflow-hidden"
              >
                {/* Shop Header */}
                <div className="p-10 pb-6 flex justify-between items-center bg-[#121212]/50 backdrop-blur-xl">
                  <div className="flex items-center gap-6">
                    <div className="bg-white p-4 rounded-[28px] text-black shadow-xl">
                      <Store size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white tracking-tight">sinum-market</h3>
                      <p className="text-[11px] text-[#444] font-medium">свежие поставки из центрального сектора</p>
                    </div>
                  </div>
                  <button onClick={() => setShowShopMenu(false)} className="p-5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 rounded-3xl transition-all">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Shop Items List */}
                  <div className="flex-1 p-10 overflow-y-auto space-y-6 custom-scrollbar">
                    <div className="flex justify-between items-center border-b border-[#222] pb-4">
                      <h4 className="text-[10px] text-[#444] font-bold tracking-[0.2em]">ассортимент / продукты</h4>
                      <span className="text-[9px] text-green-500 bg-green-500/5 px-3 py-1 rounded-full border border-green-500/10">в наличии</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      {SHOP_ITEMS.map((item) => (
                        <div 
                          key={item.id} 
                          className="bg-[#111] p-6 rounded-[32px] border border-white/5 flex items-center justify-between group hover:border-white/10 hover:bg-[#151515] transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-5">
                            <div className="bg-[#1A1A1A] p-4 rounded-2xl text-[#333] group-hover:text-white/40 transition-colors shadow-inner">
                              <Package size={24} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white/90">{item.name}</div>
                                <div className="text-[11px] text-green-500/60 font-bold mt-1 tabular-nums">{fmt(item.price)}</div>
                            </div>
                          </div>
                          <button 
                            disabled={!hasTrolley}
                            onClick={() => setTrolleyItems([...trolleyItems, item])}
                            className={`p-4 rounded-2xl transition-all flex items-center justify-center ${hasTrolley ? 'bg-white/5 hover:bg-white text-[#444] hover:text-black' : 'bg-transparent text-white/5 opacity-10'}`}
                          >
                            <ShoppingCart size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trolley / Cart Right Panel */}
                  <div className="w-[400px] border-l border-[#2A2A2A] bg-[#0A0A0A]/50 p-10 flex flex-col shadow-inner">
                    <div className="flex items-center justify-between mb-8">
                       <h4 className="text-[10px] text-[#444] font-bold tracking-[0.2em] px-1 uppercase">тележка кати</h4>
                       {hasTrolley ? (
                         <button 
                          onClick={() => {
                            if (trolleyItems.length > 0) {
                              setMessage("сначала выложите продукты");
                            } else {
                              setHasTrolley(false);
                            }
                          }}
                          className="bg-red-500/10 text-red-400 px-4 py-2 rounded-xl text-[10px] font-bold hover:bg-red-500/20 border border-red-500/20 transition-all"
                         >
                           сдать тележку
                         </button>
                       ) : (
                         <button 
                          onClick={() => setHasTrolley(true)}
                          className="bg-white text-black px-6 py-2.5 rounded-2xl text-[11px] font-bold hover:bg-[#ddd] shadow-lg active:scale-95 transition-all"
                         >
                           взять тележку
                         </button>
                       )}
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto mb-8 pr-2 custom-scrollbar">
                       {!hasTrolley ? (
                         <div className="h-full flex flex-col items-center justify-center opacity-10">
                            <ShoppingCart size={64} strokeWidth={1} />
                            <span className="text-[11px] mt-6 tracking-widest font-bold">требуется инвентарь</span>
                         </div>
                       ) : trolleyItems.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center opacity-5">
                            <span className="text-[11px] tracking-widest font-bold">пусто</span>
                         </div>
                       ) : (
                         trolleyItems.map((item, idx) => (
                           <motion.div 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={idx} 
                              className="flex items-center justify-between p-4 bg-white/5 rounded-2xl text-xs border border-white/[0.02]"
                           >
                              <span className="font-medium text-white/80">{item.name}</span>
                              <div className="flex items-center gap-4">
                                 <span className="text-[11px] text-green-500/40 tabular-nums font-bold">{fmt(item.price)}</span>
                                 <button 
                                  onClick={() => setTrolleyItems(trolleyItems.filter((_, i) => i !== idx))}
                                  className="text-[#444] hover:text-red-400 transition-colors"
                                 >
                                  <Trash2 size={16} />
                                 </button>
                              </div>
                           </motion.div>
                         ))
                       )}
                    </div>

                    <div className="space-y-6">
                       <div className="flex justify-between items-center px-4 py-6 bg-white/5 rounded-3xl border border-white/[0.05]">
                          <span className="text-[11px] text-[#444] font-bold uppercase tracking-widest">к оплате</span>
                          <span className="text-3xl font-light text-white tabular-nums">
                            {fmt(trolleyItems.reduce((a, b) => a + b.price, 0))}
                          </span>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <button 
                            disabled={!hasTrolley || trolleyItems.length === 0}
                            onClick={handleShopAction}
                            className="bg-[#1A1A1A] text-white py-5 rounded-2xl text-[10px] font-bold hover:bg-[#222] transition-all disabled:opacity-20 border border-white/5 flex items-center justify-center gap-2"
                          >
                            самообслуживание
                          </button>
                          <button 
                            disabled={!hasTrolley || trolleyItems.length === 0}
                            onClick={handleShopAction}
                            className="bg-white text-black py-5 rounded-2xl text-[10px] font-bold hover:bg-[#ddd] shadow-xl active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                          >
                            касса <ChevronRight size={16} />
                          </button>
                       </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Инвентарь */}
          <AnimatePresence>
            {showInventory && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 flex items-center justify-center p-20 z-[60] bg-[#050505]/80 backdrop-blur-md"
              >
                <div className="w-full max-w-2xl bg-[#0F0F0F] border border-white/10 rounded-[48px] p-10 flex flex-col shadow-2xl max-h-[80vh]">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                      <div className="bg-white/5 p-4 rounded-3xl text-white/40">
                        <Package size={24} />
                      </div>
                      <h3 className="text-xl font-bold text-white tracking-tight px-1">ваше имущество</h3>
                    </div>
                    <button onClick={() => setShowInventory(false)} className="p-4 bg-white/5 hover:bg-white text-[#444] hover:text-black rounded-2xl transition-all">
                      <X />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
                    {userData?.inventory && userData.inventory.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {userData.inventory.map((item, idx) => (
                          <div key={idx} className="bg-white/5 p-5 rounded-3xl border border-white/[0.02] flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                              <div className="bg-[#0A0A0A] p-3 rounded-2xl text-white/10">
                                <Package size={20} />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-white mb-0.5">{item.name}</div>
                                <div className="text-[10px] text-[#444] font-bold uppercase">{item.type === 'food' ? 'еда' : 'предмет'}</div>
                              </div>
                            </div>
                            {item.type === 'food' && (
                              <button 
                                onClick={() => consumeItem(idx)}
                                className="bg-white text-black px-5 py-2 rounded-xl text-[10px] font-bold hover:bg-[#ddd] shadow-lg active:scale-95 transition-all"
                              >
                                съесть
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 opacity-10">
                        <Package size={64} strokeWidth={1} />
                        <span className="mt-6 text-sm font-bold tracking-[0.2em]">пусто</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Футер */}
      <footer className="mt-6 flex justify-between items-center text-[10px] text-[#2a2a2a] font-bold opacity-60 px-4 uppercase tracking-[0.3em]">
        <div className="flex gap-10">
          <span className="hover:text-[#444] transition-colors cursor-default">навигация: wasd / стрелки</span>
          <span className="hover:text-[#444] transition-colors cursor-default">взаимодействие: e</span>
        </div>
        <div className="flex gap-6 items-center">
          <span>sinum life corp</span>
          <div className="w-1 h-1 bg-[#222] rounded-full"></div>
          <span>version 0.5.2 stable</span>
        </div>
      </footer>

      {/* Уведомления */}
      <AnimatePresence>
        {message && !showBankMenu && !showShopMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="absolute top-28 right-12 bg-white text-black px-8 py-4 text-[11px] font-bold rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-[100] border border-white/20"
          >
            {message.toLowerCase()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
