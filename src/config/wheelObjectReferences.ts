/**
 * CATÁLOGO OFICIAL DE REFERÊNCIAS VISUAIS DOS 8 SÍMBOLOS DA RODA DA FARM FISHING
 * Este arquivo é a ÚNICA FONTE OFICIAL de imagens e nomes dos objetos válidos da Roda.
 */

export interface WheelObjectReference {
  name: string;
  imageUrl: string;
}

export const WHEEL_OBJECT_REFERENCES = {
  sorvete: {
    name: 'sorvete',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/e547cdbd-6b88-4319-9ec5-1d64c151bf32.jpg',
  },
  boia: {
    name: 'boia',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/65330d28-bd8d-426a-815f-84e8b1f933ac.jpg',
  },
  balao: {
    name: 'balao',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/53d2c57e-0cfe-43fc-95b6-69221883077c.jpg',
  },
  soco: {
    name: 'soco',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/38da51db-9f9f-47d5-8031-7ef398db5d02.jpg',
  },
  tedy: {
    name: 'tedy',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/780fa757-567e-4c5d-8cfc-1fd90edb6186.jpg',
  },
  princesa: {
    name: 'princesa',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/b49610cb-c698-4d43-b7b4-a8f79d94e882.jpg',
  },
  camera: {
    name: 'camera',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/d860e5bd-41f5-440c-8a9d-0b58c2ff0091.jpg',
  },
  coroa: {
    name: 'coroa',
    imageUrl: 'https://ik.imagekit.io/kqrijzbci/5ca8eb04-5d85-4217-93bf-df470eff4532.jpg',
  },
} as const;

export const WINNING_OBJECT_REFERENCES = WHEEL_OBJECT_REFERENCES;
export const WIN_RESULT_TEMPLATES = WHEEL_OBJECT_REFERENCES;
export const WINNER_REFERENCE_IMAGES = WHEEL_OBJECT_REFERENCES;

export type WheelObjectName = keyof typeof WHEEL_OBJECT_REFERENCES;

export const ALLOWED_WHEEL_OBJECTS: WheelObjectName[] = [
  'sorvete',
  'boia',
  'balao',
  'soco',
  'tedy',
  'princesa',
  'camera',
  'coroa',
];

export function isAllowedWheelObject(name: string | null | undefined): name is WheelObjectName {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  return ALLOWED_WHEEL_OBJECTS.includes(clean as WheelObjectName);
}

export function getWheelObjectReference(name: string | null | undefined): WheelObjectReference | null {
  if (!name || !isAllowedWheelObject(name)) return null;
  const clean = name.toLowerCase().trim() as WheelObjectName;
  return WHEEL_OBJECT_REFERENCES[clean];
}
