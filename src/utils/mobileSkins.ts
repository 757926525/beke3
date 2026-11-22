import { MobileThemeMode } from '../types';

export interface MobileSkinOption {
  id: MobileThemeMode;
  name: string;
  desc: string;
  accent: string;
  surface: string;
  canvas: string;
  dark: boolean;
}

export const MOBILE_SKINS: MobileSkinOption[] = [
  {
    id: 'aurora-mobile',
    name: '极光琉璃',
    desc: '通透冰蓝毛玻璃与清澈层级',
    accent: '#0284c7',
    surface: '#ffffff',
    canvas: '#eff6ff',
    dark: false,
  },
  {
    id: 'cream-editorial',
    name: '暮光奶油',
    desc: '暖白书纸质感与琥珀刊物排版',
    accent: '#b45309',
    surface: '#ffffff',
    canvas: '#faf6ef',
    dark: false,
  },
  {
    id: 'obsidian-luxe',
    name: '午夜黑金',
    desc: '深曜石夜幕搭配香槟金高定光泽',
    accent: '#eab308',
    surface: '#131a26',
    canvas: '#0b0f17',
    dark: true,
  },
  {
    id: 'sakura-glass',
    name: '樱雾微光',
    desc: '柔粉晨雾玻璃与浆果玫红点缀',
    accent: '#db2777',
    surface: '#ffffff',
    canvas: '#fff4f7',
    dark: false,
  },
  {
    id: 'emerald-botanical',
    name: '翡翠森境',
    desc: '浅鼠尾草呼吸留白与深翠自然色',
    accent: '#047857',
    surface: '#ffffff',
    canvas: '#f1f7f4',
    dark: false,
  },
  {
    id: 'cyber-prism',
    name: '赛博流光',
    desc: '深靛幻彩棱镜与电光青蓝描边',
    accent: '#22d3ee',
    surface: '#1b1536',
    canvas: '#120e24',
    dark: true,
  },
];

export function getMobileSkinMeta(id?: string): MobileSkinOption {
  return MOBILE_SKINS.find(item => item.id === id) || MOBILE_SKINS[0];
}
