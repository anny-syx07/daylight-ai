export type Source = 'canvas' | 'outlook' | 'manual';
export type Kind = 'assignment' | 'quiz' | 'discussion' | 'announcement' | 'grade' | 'file' | 'event' | 'mail' | 'task';
export interface Item { id: string; source: Source; kind: Kind; title: string; course: string; due: string | null; url?: string; detail?: string; completed?: boolean; }
export interface Connection { connected: boolean; name?: string; lastSync?: string; error?: string; warnings?: string[]; }
export interface Dashboard { items: Item[]; connections: Record<'canvas' | 'outlook', Connection>; settings: { reminders: boolean; quietStart: number; quietEnd: number; timezone: string }; pushKey: string; microsoftReady: boolean; passwordRequired: boolean; }
