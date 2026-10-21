import Dexie, { Table } from 'dexie';
import { KmlParseResult } from './kmlParser';

export interface SavedKmlRecord {
  id?: number;
  fileName: string;
  rawXml: string;
  parsedData: KmlParseResult;
  updatedAt: string;
  isCurrent?: number; // 1 = current, 0 = secondary
}

export class KmlDatabase extends Dexie {
  kmlFiles!: Table<SavedKmlRecord, number>;

  constructor() {
    super('KmlFilesDB');
    this.version(1).stores({
      kmlFiles: '++id, fileName, updatedAt, isCurrent'
    });
  }
}

export const dbKml = new KmlDatabase();

/**
 * Salva um KML como o ativo atual no banco de dados IndexedDB
 */
export async function saveCurrentKml(fileName: string, rawXml: string, parsedData: KmlParseResult): Promise<SavedKmlRecord> {
  // Desmarca anterior como atual
  const allCurrent = await dbKml.kmlFiles.where('isCurrent').equals(1).toArray();
  for (const item of allCurrent) {
    if (item.id) {
      await dbKml.kmlFiles.update(item.id, { isCurrent: 0 });
    }
  }

  // Verificar se já existe um arquivo com o mesmo fileName
  const existing = await dbKml.kmlFiles.where('fileName').equals(fileName).first();
  const nowStr = new Date().toLocaleString('pt-BR');

  if (existing && existing.id) {
    await dbKml.kmlFiles.update(existing.id, {
      rawXml,
      parsedData,
      updatedAt: nowStr,
      isCurrent: 1
    });
    return { ...existing, rawXml, parsedData, updatedAt: nowStr, isCurrent: 1 };
  } else {
    const id = await dbKml.kmlFiles.add({
      fileName,
      rawXml,
      parsedData,
      updatedAt: nowStr,
      isCurrent: 1
    });
    return { id, fileName, rawXml, parsedData, updatedAt: nowStr, isCurrent: 1 };
  }
}

/**
 * Obtém o KML ativo atual
 */
export async function getCurrentKml(): Promise<SavedKmlRecord | null> {
  try {
    const current = await dbKml.kmlFiles.where('isCurrent').equals(1).first();
    if (current) return current;

    // Fallback: pegar o mais recente
    const newest = await dbKml.kmlFiles.orderBy('id').reverse().first();
    return newest || null;
  } catch (err) {
    console.error('Erro ao buscar KML do IndexedDB:', err);
    return null;
  }
}

/**
 * Lista todos os KMLs salvos
 */
export async function getAllSavedKmls(): Promise<SavedKmlRecord[]> {
  try {
    return await dbKml.kmlFiles.orderBy('id').reverse().toArray();
  } catch (err) {
    console.error('Erro ao listar KMLs salvos:', err);
    return [];
  }
}

/**
 * Remove um KML por ID
 */
export async function deleteSavedKml(id: number): Promise<void> {
  await dbKml.kmlFiles.delete(id);
}

/**
 * Limpa todos os KMLs salvos
 */
export async function clearAllKmls(): Promise<void> {
  await dbKml.kmlFiles.clear();
}
