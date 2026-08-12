import { ItemConfig, WheelItem } from '../types';

export const WHEEL_ITEMS: Record<WheelItem, ItemConfig> = {
  sorvete: {
    id: 'sorvete',
    label: 'Sorvete',
    shortLabel: 'Sorvete',
    emoji: '🍦',
    color: '#EC4899', // pink-500
    bgColor: 'bg-pink-500/15',
    borderColor: 'border-pink-500/40',
    textColor: 'text-pink-400',
  },
  boia: {
    id: 'boia',
    label: 'Boia',
    shortLabel: 'Boia',
    emoji: '🛟',
    color: '#3B82F6', // blue-500
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/40',
    textColor: 'text-blue-400',
  },
  balao: {
    id: 'balao',
    label: 'Balão',
    shortLabel: 'Balão',
    emoji: '🎈',
    color: '#EF4444', // red-500
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/40',
    textColor: 'text-red-400',
  },
  soco: {
    id: 'soco',
    label: 'Soco',
    shortLabel: 'Soco',
    emoji: '🥊',
    color: '#F97316', // orange-500
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/40',
    textColor: 'text-orange-400',
  },
  tedy: {
    id: 'tedy',
    label: 'Tedy',
    shortLabel: 'Tedy',
    emoji: '🧸',
    color: '#D97706', // amber-600
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/40',
    textColor: 'text-amber-400',
  },
  princesa: {
    id: 'princesa',
    label: 'Princesa',
    shortLabel: 'Princesa',
    emoji: '👸',
    color: '#A855F7', // purple-500
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/40',
    textColor: 'text-purple-400',
  },
  camera: {
    id: 'camera',
    label: 'Câmera',
    shortLabel: 'Câmera',
    emoji: '📷',
    color: '#06B6D4', // cyan-500
    bgColor: 'bg-cyan-500/15',
    borderColor: 'border-cyan-500/40',
    textColor: 'text-cyan-400',
  },
  coroa: {
    id: 'coroa',
    label: 'Coroa',
    shortLabel: 'Coroa',
    emoji: '👑',
    color: '#EAB308', // yellow-500
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/40',
    textColor: 'text-yellow-400',
  },
};

export const ITEM_KEYS: WheelItem[] = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
];

// Sample historical data for testing/demo purposes
export const INITIAL_SAMPLE_HISTORY: WheelItem[] = [
  'coroa', 'soco', 'boia', 'princesa', 'soco', 'coroa', 'tedy', 'balao',
  'sorvete', 'soco', 'coroa', 'camera', 'soco', 'boia', 'boia', 'princesa',
  'soco', 'tedy', 'balao', 'sorvete', 'coroa', 'soco', 'coroa', 'camera',
  'boia', 'soco', 'princesa', 'tedy', 'balao', 'sorvete', 'soco', 'coroa',
  'camera', 'soco', 'boia', 'princesa', 'coroa', 'soco', 'tedy', 'balao'
];
