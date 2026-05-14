import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserData, Page } from '../types';

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

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
  initializeUser: (username: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUserData = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data() as UserData);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
    }
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, '_internal', 'connection-test'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    let userUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (userUnsub) {
        userUnsub();
        userUnsub = null;
      }

      if (user) {
        const userRef = doc(db, 'users', user.uid);
        userUnsub = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const rawData = snap.data();
            const data = {
              ...rawData,
              balance: rawData.balance ?? 1000,
              bankBalance: rawData.bankBalance ?? 0,
              credits: rawData.credits ?? 0,
              visibility: rawData.visibility ?? 'public',
              inventory: rawData.inventory ?? [],
              stats: {
                level: 1, xp: 0, strength: 10, agility: 10,
                health: 100, hunger: 100, energy: 100,
                ...(rawData.stats || {})
              }
            } as UserData;
            setUserData(data);
          } else {
            setUserData(null);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (userUnsub) userUnsub();
    };
  }, []);

  const initializeUser = async (username: string, displayName: string) => {
    if (!user) return;
    const defaultData: UserData = {
      userId: user.uid,
      username: username.startsWith('@') ? username : `@${username}`,
      displayName,
      balance: 1000, 
      bankBalance: 0,
      credits: 0,
      visibility: 'public',
      stats: {
        level: 1,
        xp: 0,
        strength: 10,
        agility: 10,
        health: 100,
        hunger: 100,
        energy: 100
      },
      lastPosition: { x: 1000, y: 1000 },
      currentRoom: 'world',
      homeId: '',
      inventory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    try {
      await setDoc(doc(db, 'users', user.uid), defaultData);
      // setUserData will be set by onSnapshot
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData, initializeUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
};
