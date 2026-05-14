export interface UserStats {
  level: number;
  xp: number;
  strength: number;
  agility: number;
  health: number;
  hunger: number;
  energy: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  price: number;
  type: 'food' | 'tool';
  value: number; // e.g. how much hunger it restores
}

export interface UserData {
  userId: string;
  username: string; // @handle
  displayName: string; // Real Name
  balance: number;
  bankBalance: number;
  credits: number;
  visibility: 'public' | 'private';
  stats: UserStats;
  lastPosition: Vector2;
  currentRoom?: string; // For home interior
  homeId?: string;
  inventory: InventoryItem[];
  createdAt: any;
  updatedAt: any;
}

export interface HomeData {
  id: string;
  ownerId: string;
  address: string;
  type: 'studio' | 'apartment';
  createdAt: any;
}

export enum Page {
  AUTH = 'AUTH',
  SETUP = 'SETUP',
  GAME = 'GAME',
  LOADING = 'LOADING'
}
