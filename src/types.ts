export type Source = 'canvas' | 'outlook' | 'manual' | 'import';
export type Kind = 'assignment' | 'quiz' | 'discussion' | 'announcement' | 'grade' | 'file' | 'event' | 'mail' | 'task';
export interface Item { id: string; source: Source; kind: Kind; title: string; course: string; due: string | null; end?: string; location?: string; instructor?: string; lessonType?: string; cancelled?: boolean; url?: string; detail?: string; completed?: boolean; allDay?: boolean; importGroup?: string; importLabel?: string; canvasAssignmentId?: number; }
export interface Connection { connected: boolean; name?: string; lastSync?: string; error?: string; warnings?: string[]; }
export interface SisCatalog { term: string; courses: { name: string; code: string; source: string }[]; }
export interface SisStatus { count: number; lastImported?: string; configured?: boolean; lastChecked?: string; error?: string; changed?: number; }
export interface ImportStatus { count: number; gmail: { configured: boolean; lastReceived?: string; receivedCount?: number }; lastImported?: string; sis?: SisStatus; }
export interface ImportPreview { id: string; items: Item[]; warnings: string[]; label: string; group: string; sisCatalog?: SisCatalog; }
export interface Dashboard { items: Item[]; connections: Record<'canvas' | 'outlook', Connection>; imports: ImportStatus; settings: { reminders: boolean; quietStart: number; quietEnd: number; timezone: string }; pushKey: string; microsoftReady: boolean; passwordRequired: boolean; serverless?: boolean; }
