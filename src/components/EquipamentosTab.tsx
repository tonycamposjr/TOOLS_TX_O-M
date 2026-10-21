import React, { useState, useEffect, useMemo, useRef } from 'react';
import { EquipamentoItem } from '../types';
import { dbEquipamentos, parseEquipamentosCsv, removeAccents, fixTextEncoding } from '../lib/equipamentosDb';

interface EquipamentosTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function EquipamentosTab({ showToast }: EquipamentosTabProps) {
  // DB & State
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFabricante, setSelectedFabricante] = useState<string>('ALL');
  const [selectedEquipamento, setSelectedEquipamento] = useState<string>('ALL');
  const [selectedAtivo, setSelectedAtivo] = useState<string>('ALL');
  
  // Dynamic Dropdown Options loaded from IndexedDB
  const [fabricantesList, setFabricantesList] = useState<string[]>([]);
  const [equipamentosList, setEquipamentosList] = useState<string[]>([]);

  // Pagination & Display
  const [results, setResults] = useState<EquipamentoItem[]>([]);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Modal State
  const [viewingItem, setViewingItem] = useState<EquipamentoItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial Load - Check if DB populated
  useEffect(() => {
    refreshDbStats();
  }, []);

  // Whenever filters change or page changes, execute search
  useEffect(() => {
    executeSearch();
  }, [searchQuery, selectedFabricante, selectedEquipamento, selectedAtivo, currentPage, itemsPerPage]);

  // Refresh counts and populated dropdown options
  const refreshDbStats = async () => {
    setLoading(true);
    try {
      const count = await dbEquipamentos.equipamentos.count();
      setTotalCount(count);

      if (count > 0) {
        // Load unique manufacturers and equipment types for dropdowns
        const allItems = await dbEquipamentos.equipamentos.toArray();
        const fabs = Array.from(new Set(allItems.map(i => i.fabricante).filter(Boolean))).sort();
        const equips = Array.from(new Set(allItems.map(i => i.equipamento).filter(Boolean))).sort();

        setFabricantesList(fabs);
        setEquipamentosList(equips);
      } else {
        setFabricantesList([]);
        setEquipamentosList([]);
      }
    } catch (err) {
      console.error('Erro ao acessar IndexedDB:', err);
      showToast('Erro ao carregar banco de dados local Dexie', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Perform fast IndexedDB query & filtering
  const executeSearch = async () => {
    try {
      const normalizedQuery = removeAccents(searchQuery.trim());

      // Fetch all items from IndexedDB
      // For ~21k records, Dexie in-memory filtering takes under 20ms
      let collection = await dbEquipamentos.equipamentos.toArray();

      // Filter by Fabricante
      if (selectedFabricante !== 'ALL') {
        collection = collection.filter(item => item.fabricante === selectedFabricante);
      }

      // Filter by Tipo de Equipamento
      if (selectedEquipamento !== 'ALL') {
        collection = collection.filter(item => item.equipamento === selectedEquipamento);
      }

      // Filter by Ativo (SIM / NÃO)
      if (selectedAtivo !== 'ALL') {
        collection = collection.filter(item => item.ativo === selectedAtivo);
      }

      // Search across CODIGO, REFERÊNCIA and DESCRIÇÃO simultaneously (case & accent insensitive)
      if (normalizedQuery) {
        collection = collection.filter(item => {
          if (item.searchNormalized) {
            return item.searchNormalized.includes(normalizedQuery);
          }
          const combined = removeAccents(`${item.codigo} ${item.referencia} ${item.descricao}`);
          return combined.includes(normalizedQuery);
        });
      }

      setFilteredCount(collection.length);

      // Pagination slice
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedResults = collection.slice(startIndex, startIndex + itemsPerPage);
      setResults(paginatedResults);

    } catch (err) {
      console.error('Erro ao executar busca:', err);
    }
  };

  // Handle CSV Import
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setImporting(true);
    setImportProgress({ current: 0, total: 100 });

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const csvText = e.target?.result as string;
          if (!csvText) {
            showToast('Arquivo CSV vazio ou inválido.', 'error');
            setImporting(false);
            return;
          }

          const parsedItems = parseEquipamentosCsv(csvText);
          if (parsedItems.length === 0) {
            showToast('Nenhum equipamento válido foi encontrado no arquivo CSV.', 'warning');
            setImporting(false);
            return;
          }

          const total = parsedItems.length;
          setImportProgress({ current: 0, total });

          // Clear previous Dexie records
          await dbEquipamentos.equipamentos.clear();

          // Batch bulkAdd in chunks of 1,000 for maximum performance without blocking UI
          const chunkSize = 1000;
          for (let i = 0; i < total; i += chunkSize) {
            const chunk = parsedItems.slice(i, i + chunkSize);
            await dbEquipamentos.equipamentos.bulkAdd(chunk);
            
            const currentProcessed = Math.min(i + chunkSize, total);
            setImportProgress({ current: currentProcessed, total });

            // Allow UI re-render
            await new Promise(res => setTimeout(res, 10));
          }

          showToast(`Importação concluída! ${total.toLocaleString('pt-BR')} equipamentos cadastrados no IndexedDB.`, 'success');
          setIsImportModalOpen(false);
          await refreshDbStats();
          setCurrentPage(1);
        } catch (err: any) {
          console.error('Erro durante importação CSV:', err);
          showToast(`Falha ao importar CSV: ${err.message || 'Erro de leitura'}`, 'error');
        } finally {
          setImporting(false);
        }
      };

      reader.readAsText(file, 'ISO-8859-1'); // Default telecom encoding fallback
    } catch (err) {
      console.error('Erro no leitor de arquivo:', err);
      setImporting(false);
    }
  };

  // Generate Sample Data for instant testing if user doesn't have CSV ready
  const handleGenerateSampleData = async () => {
    if (confirm('Deseja gerar um conjunto de 1.000 equipamentos telecom de amostra no IndexedDB?')) {
      setImporting(true);
      try {
        const fabricantes = ['CISCO', 'HUAWEI', 'DATACOM', 'FIBERHOME', 'ZTE', 'FURUKAWA', 'NOKIA', 'DELL', 'EXTREME', 'MIKROTIK'];
        const tipos = ['ROTEADOR', 'SWITCH', 'OLT', 'ONU/ONT', 'TRANSCEIVER SFP+', 'PATCH PANEL', 'RECTIFIER', 'CABO OPTICO'];
        const sampleItems: EquipamentoItem[] = [];

        for (let i = 1; i <= 1000; i++) {
          const codigo = `EQP-${10000 + i}`;
          const ref = `REF-TLK-${2000 + (i % 300)}`;
          const fab = fabricantes[i % fabricantes.length];
          const equip = tipos[i % tipos.length];
          const ativo = (i % 7 === 0) ? 'NÃO' : 'SIM';
          const desc = `${equip} ${fab} - MODELO ${100 + (i % 50)} PARA REDES DE TELECOMUNICAÇÕES E PRESSURIZAÇÃO DE CABOS`;
          
          sampleItems.push({
            codigo,
            referencia: ref,
            fabricante: fab,
            descricao: fixTextEncoding(desc),
            equipamento: equip,
            ativo,
            searchNormalized: removeAccents(`${codigo} ${ref} ${desc} ${fab} ${equip}`)
          });
        }

        await dbEquipamentos.equipamentos.clear();
        await dbEquipamentos.equipamentos.bulkAdd(sampleItems);

        showToast('Amostra de 1.000 equipamentos gerada no IndexedDB com sucesso!', 'success');
        await refreshDbStats();
        setCurrentPage(1);
      } catch (err) {
        console.error('Erro ao gerar amostras:', err);
        showToast('Erro ao criar registros de exemplo.', 'error');
      } finally {
        setImporting(false);
      }
    }
  };

  // Clear Database
  const handleClearDb = async () => {
    if (confirm('Tem certeza que deseja apagar todos os equipamentos do banco de dados IndexedDB local?')) {
      await dbEquipamentos.equipamentos.clear();
      showToast('Banco de dados local limpo com sucesso.', 'info');
      await refreshDbStats();
      setResults([]);
      setFilteredCount(0);
    }
  };

  // Copy text helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado para a área de transferência!`, 'success');
  };

  const totalPages = Math.ceil(filteredCount / itemsPerPage) || 1;

  return (
    <div className="database-container">
      {/* DB Header */}
      <div className="db-header">
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <i className="fas fa-boxes" style={{ color: 'var(--accent)' }}></i> Consulta de Equipamentos
        </h2>
        <p className="db-subtitle">
          Base local de equipamentos de telecomunicações (IndexedDB PWA com busca ultra-rápida)
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-container">
        <div className="stat-card">
          <i className="fas fa-database"></i>
          <div>
            <h3>{totalCount.toLocaleString('pt-BR')}</h3>
            <p>Total no Banco Local</p>
          </div>
        </div>
        <div className="stat-card">
          <i className="fas fa-filter"></i>
          <div>
            <h3>{filteredCount.toLocaleString('pt-BR')}</h3>
            <p>Resultados Filtrados</p>
          </div>
        </div>
        <div className="stat-card">
          <i className="fas fa-industry"></i>
          <div>
            <h3>{fabricantesList.length}</h3>
            <p>Fabricantes Mapeados</p>
          </div>
        </div>
        <div className="stat-card">
          <i className="fas fa-check-circle" style={{ color: 'var(--success)' }}></i>
          <div>
            <h3>Offline Ready</h3>
            <p>Dexie IndexedDB</p>
          </div>
        </div>
      </div>

      {/* DB Actions Bar */}
      <div className="db-actions">
        <button className="db-btn primary" onClick={() => setIsImportModalOpen(true)}>
          <i className="fas fa-file-import"></i> Importar CSV de Equipamentos
        </button>
        {totalCount === 0 && (
          <button className="db-btn success" onClick={handleGenerateSampleData}>
            <i className="fas fa-vial"></i> Gerar Amostra de Teste (1.000 Itens)
          </button>
        )}
        {totalCount > 0 && (
          <button className="db-btn danger" onClick={handleClearDb}>
            <i className="fas fa-trash-alt"></i> Limpar Banco Local
          </button>
        )}

        {/* View Mode Switcher */}
        <div className="view-mode-selector">
          <button 
            className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`} 
            onClick={() => setViewMode('table')}
          >
            <i className="fas fa-table"></i> Tabela
          </button>
          <button 
            className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`} 
            onClick={() => setViewMode('cards')}
          >
            <i className="fas fa-th-large"></i> Cards
          </button>
        </div>
      </div>

      {/* Filters & Search Panel */}
      <div className="filters-container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '15px' }}>
          {/* Main Search Input */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-search"></i> Busca Unificada (Código, Referência ou Descrição)
            </label>
            <div className="search-box" style={{ minWidth: '100%' }}>
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Digite o Código, Referência ou Palavras da Descrição (ex: PRESSURIZAÇÃO, CISCO, ROTEADOR)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* Fabricante Filter */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '4px' }}>
              <i className="fas fa-building"></i> Fabricante
            </label>
            <select
              value={selectedFabricante}
              onChange={(e) => {
                setSelectedFabricante(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">Todos os Fabricantes ({fabricantesList.length})</option>
              {fabricantesList.map(fab => (
                <option key={fab} value={fab}>{fab}</option>
              ))}
            </select>
          </div>

          {/* Tipo de Equipamento Filter */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '4px' }}>
              <i className="fas fa-microchip"></i> Tipo de Equipamento
            </label>
            <select
              value={selectedEquipamento}
              onChange={(e) => {
                setSelectedEquipamento(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">Todos os Tipos ({equipamentosList.length})</option>
              {equipamentosList.map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>

          {/* Ativo (SIM/NÃO) Filter */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '4px' }}>
              <i className="fas fa-toggle-on"></i> Status de Ativo
            </label>
            <select
              value={selectedAtivo}
              onChange={(e) => {
                setSelectedAtivo(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">Todos (SIM e NÃO)</option>
              <option value="SIM">SIM (Ativos)</option>
              <option value="NÃO">NÃO (Inativos)</option>
            </select>
          </div>

          {/* Items per Page */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '4px' }}>
              <i className="fas fa-list-ol"></i> Itens por Página
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={200}>200 por página</option>
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {(searchQuery || selectedFabricante !== 'ALL' || selectedEquipamento !== 'ALL' || selectedAtivo !== 'ALL') && (
          <button
            className="filter-btn secondary"
            style={{ fontSize: '13px', padding: '6px 14px' }}
            onClick={() => {
              setSearchQuery('');
              setSelectedFabricante('ALL');
              setSelectedEquipamento('ALL');
              setSelectedAtivo('ALL');
              setCurrentPage(1);
            }}
          >
            <i className="fas fa-times"></i> Limpar Filtros
          </button>
        )}
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="loading-spinner" style={{ display: 'block' }}></div>
          <p style={{ marginTop: '10px', color: 'var(--muted)' }}>Consultando IndexedDB Dexie...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && totalCount === 0 && (
        <div className="no-data" style={{ display: 'block' }}>
          <i className="fas fa-file-csv"></i>
          <h3>Nenhum equipamento importado</h3>
          <p>Importe seu arquivo CSV com as ~21.600 linhas de equipamentos ou gere uma amostra para começar.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={() => setIsImportModalOpen(true)}>
              <i className="fas fa-upload"></i> Importar CSV Agora
            </button>
            <button className="btn btn-secondary" onClick={handleGenerateSampleData}>
              <i className="fas fa-magic"></i> Gerar Amostra
            </button>
          </div>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && totalCount > 0 && filteredCount === 0 && (
        <div className="no-data" style={{ display: 'block' }}>
          <i className="fas fa-search-minus"></i>
          <h3>Nenhum equipamento encontrado com os filtros atuais</h3>
          <p>Tente alterar o termo de busca ou limpar os filtros de Fabricante, Tipo ou Ativo.</p>
        </div>
      )}

      {/* Results View: Table Mode */}
      {!loading && results.length > 0 && viewMode === 'table' && (
        <div className="table-container">
          <table id="clientesTable" style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{ width: '120px' }}>CÓDIGO</th>
                <th style={{ width: '150px' }}>REFERÊNCIA</th>
                <th style={{ width: '140px' }}>FABRICANTE</th>
                <th style={{ width: '140px' }}>EQUIPAMENTO</th>
                <th>DESCRIÇÃO</th>
                <th style={{ width: '90px', textAlign: 'center' }}>ATIVO</th>
                <th style={{ width: '100px', textAlign: 'center' }}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr key={item.id || index}>
                  <td>
                    <span 
                      style={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 700, 
                        color: 'var(--accent)',
                        background: 'rgba(var(--accent-rgb), 0.1)',
                        padding: '4px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      {item.codigo}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                      {item.referencia || '-'}
                    </span>
                  </td>
                  <td>
                    <strong style={{ fontSize: '13px' }}>{item.fabricante}</strong>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{item.equipamento}</span>
                  </td>
                  <td>
                    <div 
                      style={{ 
                        fontSize: '13px', 
                        lineHeight: '1.4', 
                        maxHeight: '42px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}
                      title={item.descricao}
                    >
                      {item.descricao}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span 
                      className={`status-badge ${item.ativo === 'SIM' ? 'status-concluido' : 'status-cancelado'}`}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      {item.ativo}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button 
                        className="action-btn view" 
                        title="Ver detalhes do equipamento"
                        onClick={() => setViewingItem(item)}
                      >
                        <i className="fas fa-eye"></i>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Copiar Código"
                        onClick={() => handleCopy(item.codigo, 'Código')}
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Results View: Cards Mode */}
      {!loading && results.length > 0 && viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', marginBottom: '25px' }}>
          {results.map((item, index) => (
            <div 
              key={item.id || index}
              style={{
                background: 'var(--card)',
                border: '2px solid var(--border)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px var(--shadow)'
              } as React.CSSProperties}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                    {item.codigo}
                  </span>
                  <span className={`status-badge ${item.ativo === 'SIM' ? 'status-concluido' : 'status-cancelado'}`} style={{ fontSize: '10px' }}>
                    {item.ativo === 'SIM' ? 'ATIVO' : 'INATIVO'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                  <strong>Ref:</strong> {item.referencia || '-'} | <strong>Fab:</strong> {item.fabricante}
                </div>

                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>
                  {item.equipamento}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4', marginBottom: '12px', height: '50px', overflow: 'hidden' }}>
                  {item.descricao}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                <button 
                  className="action-btn view" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setViewingItem(item)}
                >
                  <i className="fas fa-eye"></i> Detalhes
                </button>
                <button 
                  className="action-btn"
                  onClick={() => handleCopy(item.codigo, 'Código')}
                >
                  <i className="fas fa-copy"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && filteredCount > 0 && (
        <div className="pagination">
          <button 
            className="page-btn" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <i className="fas fa-chevron-left"></i> Anterior
          </button>

          <span id="pageInfo">
            Página {currentPage} de {totalPages} | Exibindo {Math.min((currentPage - 1) * itemsPerPage + 1, filteredCount)} a {Math.min(currentPage * itemsPerPage, filteredCount)} de {filteredCount.toLocaleString('pt-BR')} itens
          </span>

          <button 
            className="page-btn" 
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            Próximo <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      {/* MODAL: Import CSV */}
      {isImportModalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content large">
            <button className="close-modal" onClick={() => !importing && setIsImportModalOpen(false)}>
              <i className="fas fa-times"></i>
            </button>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-file-csv" style={{ color: 'var(--accent)' }}></i> Importação de CSV de Equipamentos
            </h3>
            
            <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '20px' }}>
              Selecione o arquivo CSV contendo os equipamentos de telecom. O sistema lerá e armazenará no banco local <strong>IndexedDB (Dexie)</strong> para consulta instantânea offline.
            </p>

            <div style={{ background: 'rgba(var(--accent-rgb), 0.05)', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border)', fontSize: '13px' }}>
              <strong>Colunas esperadas no CSV:</strong>
              <div style={{ marginTop: '5px', fontFamily: 'monospace', color: 'var(--accent)' }}>
                CODIGO ; REFERÊNCIA ; FABRICANTE ; DESCRIÇÃO ; EQUIPAMENTO ; ATIVO
              </div>
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                * Suporta delimitadores por ponto e vírgula (;), vírgula (,) e tabulação (\t). Tratamento automático de encodings corrompidos (ex: PRESSURIZAC?O → PRESSURIZAÇÃO).
              </p>
            </div>

            {/* Drag and Drop File Area */}
            <div 
              style={{
                border: '2px dashed var(--accent)',
                borderRadius: '12px',
                padding: '30px',
                textAlign: 'center',
                background: 'var(--card)',
                cursor: importing ? 'wait' : 'pointer',
                marginBottom: '20px'
              }}
              onClick={() => !importing && fileInputRef.current?.click()}
            >
              <i className="fas fa-cloud-upload-alt" style={{ fontSize: '48px', color: 'var(--accent)', marginBottom: '10px' }}></i>
              <p style={{ fontWeight: 600, fontSize: '16px', color: 'var(--fg)' }}>
                {importing ? 'Processando e gravando dados...' : 'Clique para selecionar ou arraste o arquivo CSV aqui'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Suporta arquivos de até 100.000 linhas (~21.600 equipamentos)
              </p>
              <input 
                type="file" 
                ref={fileInputRef}
                accept=".csv, .txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
            </div>

            {/* Progress Bar during Import */}
            {importing && (
              <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(var(--accent-rgb), 0.1)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                  <span>Importando para o IndexedDB...</span>
                  <span>{importProgress.current.toLocaleString('pt-BR')} de {importProgress.total.toLocaleString('pt-BR')} ({Math.round((importProgress.current / (importProgress.total || 1)) * 100)}%)</span>
                </div>
                <div style={{ width: '100%', height: '12px', background: 'var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${Math.round((importProgress.current / (importProgress.total || 1)) * 100)}%`, 
                      height: '100%', 
                      background: 'linear-gradient(90deg, var(--gradient-start), var(--gradient-end))',
                      transition: 'width 0.2s ease'
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '25px' }}>
              <button 
                className="btn btn-secondary" 
                disabled={importing}
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: View Equipment Details */}
      {viewingItem && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <button className="close-modal" onClick={() => setViewingItem(null)}>
              <i className="fas fa-times"></i>
            </button>

            <div className="detalhes-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--accent)' }}>
                  {viewingItem.codigo}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                  Ref: {viewingItem.referencia || 'N/A'}
                </p>
              </div>
              <span className={`status-badge ${viewingItem.ativo === 'SIM' ? 'status-concluido' : 'status-cancelado'}`}>
                {viewingItem.ativo === 'SIM' ? 'ATIVO' : 'INATIVO'}
              </span>
            </div>

            <div className="info-grid" style={{ gap: '15px', marginBottom: '20px' }}>
              <div className="info-item">
                <label><i className="fas fa-industry"></i> Fabricante:</label>
                <strong>{viewingItem.fabricante}</strong>
              </div>
              <div className="info-item">
                <label><i className="fas fa-microchip"></i> Equipamento:</label>
                <strong>{viewingItem.equipamento}</strong>
              </div>
              <div className="info-item">
                <label><i className="fas fa-barcode"></i> Código Interno:</label>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{viewingItem.codigo}</span>
              </div>
              <div className="info-item">
                <label><i className="fas fa-tag"></i> Referência:</label>
                <span style={{ fontFamily: 'monospace' }}>{viewingItem.referencia || 'N/A'}</span>
              </div>
            </div>

            <div style={{ marginTop: '15px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
                <i className="fas fa-align-left"></i> Descrição Completa:
              </label>
              <div className="observacoes" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                {viewingItem.descricao}
              </div>
            </div>

            <div className="detalhes-actions" style={{ marginTop: '25px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => handleCopy(`${viewingItem.codigo} - ${viewingItem.descricao}`, 'Resumo')}
              >
                <i className="fas fa-copy"></i> Copiar Resumo
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setViewingItem(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
