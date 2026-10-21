import Dexie, { Table } from 'dexie';
import { EquipamentoItem } from '../types';

export class EquipamentosDatabase extends Dexie {
  equipamentos!: Table<EquipamentoItem, number>;

  constructor() {
    super('EquipamentosTelecomDB');
    this.version(1).stores({
      equipamentos: '++id, codigo, referencia, fabricante, equipamento, ativo, searchNormalized'
    });
  }
}

export const dbEquipamentos = new EquipamentosDatabase();

/**
 * Corrige encodings corrompidos comuns em exportações de CSV de telecom.
 * Ex: "PRESSURIZAC?O" -> "PRESSURIZAÇÃO", "OPERAC?O" -> "OPERAÇÃO"
 */
export function fixTextEncoding(text: string): string {
  if (!text) return '';
  let s = text.trim();

  // Correção de UTF-8 / ISO-8859-1 mal decodificados
  s = s.replace(/Ã§/g, 'ç')
       .replace(/Ã‡/g, 'Ç')
       .replace(/Ã£/g, 'ã')
       .replace(/Ã/g, 'Ã')
       .replace(/Ã©/g, 'é')
       .replace(/Ã‰/g, 'É')
       .replace(/Ã¡/g, 'á')
       .replace(/Ã/g, 'Á')
       .replace(/Ã³/g, 'ó')
       .replace(/Ã³/g, 'Ó')
       .replace(/Ãº/g, 'ú')
       .replace(/Ãš/g, 'Ú')
       .replace(/Ã­/g, 'í')
       .replace(/Ã/g, 'Í')
       .replace(/Ã¢/g, 'â')
       .replace(/Ãª/g, 'ê')
       .replace(/Ã´/g, 'ô')
       .replace(/ï¿½/g, 'Ç');

  // Correção de ? em palavras em português (ex: PRESSURIZAC?O -> PRESSURIZAÇÃO)
  s = s.replace(/\b([A-Z0-9]+)C\?O([A-Z0-9]*)\b/gi, '$1ÇÃO$2')
       .replace(/\b([A-Z0-9]+)C\?ES([A-Z0-9]*)\b/gi, '$1ÇÕES$2')
       .replace(/\bN\?O\b/gi, 'NÃO')
       .replace(/\bS\?O\b/gi, 'SÃO')
       .replace(/\bVIS\?O\b/gi, 'VISÃO')
       .replace(/\bMEDIC\?O\b/gi, 'MEDIÇÃO')
       .replace(/\bSELEC\?O\b/gi, 'SELEÇÃO')
       .replace(/\bLIGAC\?O\b/gi, 'LIGAÇÃO')
       .replace(/\bFIXAC\?O\b/gi, 'FIXAÇÃO')
       .replace(/\bPROTECT\?O\b/gi, 'PROTEÇÃO')
       .replace(/\bPROTEC\?O\b/gi, 'PROTEÇÃO')
       .replace(/\bDIREC\?O\b/gi, 'DIREÇÃO')
       .replace(/\bAUTOMAC\?O\b/gi, 'AUTOMAÇÃO')
       .replace(/\bCONEX\?O\b/gi, 'CONEXÃO')
       .replace(/\bSITUAC\?O\b/gi, 'SITUAÇÃO')
       .replace(/\bVALORIZAC\?O\b/gi, 'VALORIZAÇÃO')
       .replace(/\bINSTALAC\?O\b/gi, 'INSTALAÇÃO')
       .replace(/\bMODULAC\?O\b/gi, 'MODULAÇÃO')
       .replace(/\bREGULAC\?O\b/gi, 'REGULAÇÃO')
       .replace(/\bALIMENTAC\?O\b/gi, 'ALIMENTAÇÃO')
       .replace(/\bSEPARAC\?O\b/gi, 'SEPARAÇÃO')
       .replace(/\bAMPLIFICAC\?O\b/gi, 'AMPLIFICAÇÃO')
       .replace(/\bDISTRIBUIC\?O\b/gi, 'DISTRIBUIÇÃO')
       .replace(/\bILUMINAC\?O\b/gi, 'ILUMINAÇÃO')
       .replace(/\bSINALIZAC\?O\b/gi, 'SINALIZAÇÃO')
       .replace(/\bTUBULAC\?O\b/gi, 'TUBULAÇÃO')
       .replace(/\bTRANSMISS\?O\b/gi, 'TRANSMISSÃO')
       .replace(/\bINSPEC\?O\b/gi, 'INSPEÇÃO')
       .replace(/\bMANUTENC\?O\b/gi, 'MANUTENÇÃO')
       .replace(/\bOPERAC\?O\b/gi, 'OPERAÇÃO')
       .replace(/\bCONFIGURAC\?O\b/gi, 'CONFIGURAÇÃO');

  return s;
}

/**
 * Remove acentos e converte para minúsculo para permitir busca rápida insensível a acentos
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Parser de CSV robusto suportando delimitador automático (; ou , ou tab) e aspas
 */
export function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Detecta delimitador na primeira linha
  const firstLine = lines[0];
  let delimiter = ';';
  if ((firstLine.match(/;/g) || []).length < (firstLine.match(/,/g) || []).length) {
    delimiter = ',';
  }
  if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/;/g) || []).length) {
    delimiter = '\t';
  }

  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let insideQuote = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === delimiter && !insideQuote) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Processa linhas do CSV e mapeia para a estrutura EquipamentoItem
 */
export function parseEquipamentosCsv(
  csvText: string
): EquipamentoItem[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  // Mapear cabeçalhos (case-insensitive e ignorando acentos)
  const headerRow = rows[0].map(h => removeAccents(fixTextEncoding(h)).toUpperCase());

  let colCodigo = headerRow.findIndex(h => h.includes('CODIGO') || h.includes('COD'));
  let colRef = headerRow.findIndex(h => h.includes('REFERENCIA') || h.includes('REF'));
  let colFab = headerRow.findIndex(h => h.includes('FABRICANTE') || h.includes('FABR'));
  let colDesc = headerRow.findIndex(h => h.includes('DESCRICAO') || h.includes('DESC'));
  let colEquip = headerRow.findIndex(h => h.includes('EQUIPAMENTO') || h.includes('EQUIP'));
  let colAtivo = headerRow.findIndex(h => h.includes('ATIVO'));

  // Fallbacks padrão de índice caso os nomes dos cabeçalhos divirjam
  if (colCodigo === -1) colCodigo = 0;
  if (colRef === -1) colRef = 1;
  if (colFab === -1) colFab = 2;
  if (colDesc === -1) colDesc = 3;
  if (colEquip === -1) colEquip = 4;
  if (colAtivo === -1) colAtivo = 5;

  const items: EquipamentoItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    const rawCodigo = row[colCodigo] || '';
    const rawRef = row[colRef] || '';
    const rawFab = row[colFab] || '';
    const rawDesc = row[colDesc] || '';
    const rawEquip = row[colEquip] || '';
    const rawAtivo = row[colAtivo] || 'SIM';

    if (!rawCodigo && !rawRef && !rawDesc) continue;

    const codigo = fixTextEncoding(rawCodigo);
    const referencia = fixTextEncoding(rawRef);
    const fabricante = fixTextEncoding(rawFab) || 'N/A';
    const descricao = fixTextEncoding(rawDesc);
    const equipamento = fixTextEncoding(rawEquip) || 'N/A';
    
    // Normalizar Ativo para SIM ou NÃO
    let ativo = fixTextEncoding(rawAtivo).toUpperCase();
    if (ativo.includes('SIM') || ativo === 'S' || ativo === '1' || ativo.includes('ACT') || ativo.includes('VERDADE')) {
      ativo = 'SIM';
    } else if (ativo.includes('NAO') || ativo.includes('NÃO') || ativo === 'N' || ativo === '0' || ativo.includes('FALS')) {
      ativo = 'NÃO';
    } else {
      ativo = 'SIM';
    }

    const searchNormalized = removeAccents(`${codigo} ${referencia} ${descricao} ${fabricante} ${equipamento}`);

    items.push({
      codigo,
      referencia,
      fabricante,
      descricao,
      equipamento,
      ativo,
      searchNormalized
    });
  }

  return items;
}
