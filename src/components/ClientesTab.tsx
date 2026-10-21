import React, { useState, useEffect } from 'react';
import { ClienteRecord, HistoricoItem, RecordStatus, RecordPrioridade } from '../types';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ClientesTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ClientesTab({ showToast }: ClientesTabProps) {
  const dbName = 'clientesEquipamentosDB';
  const [records, setRecords] = useState<ClienteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtering & Pagination States
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterField, setFilterField] = useState('all');
  const [filterValue, setFilterValue] = useState('');
  const [appliedFilterField, setAppliedFilterField] = useState('all');
  const [appliedFilterValue, setAppliedFilterValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Editing and Active records
  const [editingRecord, setEditingRecord] = useState<ClienteRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<ClienteRecord | null>(null);

  // Form Fields
  const [formNumeroChamado, setFormNumeroChamado] = useState('');
  const [formNomeCliente, setFormNomeCliente] = useState('');
  const [formEndereco, setFormEndereco] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formIdProjeto, setFormIdProjeto] = useState('');
  const [formIdVantive, setFormIdVantive] = useState('');
  const [formNumeroLP, setFormNumeroLP] = useState('');
  const [formEquipamento, setFormEquipamento] = useState('');
  const [formHistorico, setFormHistorico] = useState('');
  const [formStatus, setFormStatus] = useState<RecordStatus>('aberto');
  const [formPrioridade, setFormPrioridade] = useState<RecordPrioridade>('media');
  const [formDataPrevista, setFormDataPrevista] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'aberto': return 'var(--err)';
      case 'em_andamento': return 'var(--warning)';
      case 'aguardando': return '#3b82f6';
      case 'concluido': return 'var(--success)';
      case 'cancelado': return 'var(--muted)';
      default: return 'var(--border)';
    }
  };

  const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeForFirestore(item));
    }
    if (typeof obj === 'object') {
      const cleaned: any = {};
      Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = sanitizeForFirestore(val);
        }
      });
      return cleaned;
    }
    return obj;
  };

  // Semente de dados de exemplo se o banco estiver vazio
  const generateSampleData = (): ClienteRecord[] => {
    const clientes = ['Empresa A Telecom', 'Indústria B S.A.', 'Comércio C Ltda', 'Serviços D Eireli', 'Transportes E'];
    const enderecos = [
      'Av. Paulista, 1000 - São Paulo/SP',
      'Rua das Flores, 123 - Rio de Janeiro/RJ',
      'Av. Brasil, 500 - Belo Horizonte/MG',
      'Rua Porto Alegre, 789 - Curitiba/PR',
      'Av. Beira Mar, 456 - Florianópolis/SC'
    ];
    const statusOptions: RecordStatus[] = ['aberto', 'em_andamento', 'aguardando', 'concluido', 'cancelado'];
    const equipamentos = ['Router Cisco 2911', 'Switch HP 2920', 'Firewall Fortinet 60E', 'AP Ubiquiti UAP-AC-PRO', 'OLT Huawei MA5600T'];
    
    const data: ClienteRecord[] = [];
    const now = new Date();
    
    for (let i = 1; i <= 15; i++) {
      const clienteIndex = i % clientes.length;
      const dataCriacao = new Date(now);
      dataCriacao.setDate(dataCriacao.getDate() - Math.floor(Math.random() * 30));
      
      data.push({
        id: Date.now() + i,
        numeroChamado: `CHM-2023-${String(i).padStart(5, '0')}`,
        nomeCliente: clientes[clienteIndex],
        endereco: enderecos[clienteIndex],
        telefone: `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
        email: `contato@${clientes[clienteIndex].toLowerCase().replace(/[^a-z]/g, '')}.com`,
        idProjeto: `PROJ-2023-FIBRA-${i}`,
        idVantive: `VANT-${String(100000 + i)}`,
        numeroLP: `LP-${String(200000 + i)}`,
        equipamento: equipamentos[Math.floor(Math.random() * equipamentos.length)],
        historico: [
          {
            data: new Date(dataCriacao.getTime() + 3600000).toISOString(),
            texto: 'Chamado aberto via sistema'
          },
          {
            data: new Date(dataCriacao.getTime() + 7200000).toISOString(),
            texto: 'Técnico designado para atendimento'
          }
        ],
        status: statusOptions[Math.floor(Math.random() * statusOptions.length)],
        prioridade: (['baixa', 'media', 'alta', 'urgente'] as RecordPrioridade[])[Math.floor(Math.random() * 4)],
        dataPrevista: new Date(dataCriacao.getTime() + 86400000 * 7).toISOString().split('T')[0],
        observacoes: 'Equipamento em garantia. Contatar suporte técnico do fabricante se necessário.',
        dataCriacao: dataCriacao.toISOString(),
        ultimaAtualizacao: new Date().toISOString()
      });
    }
    return data;
  };

  // Load records on mount from Firestore
  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'clientes'));
        const list: ClienteRecord[] = [];
        querySnapshot.forEach((docSnap) => {
          list.push(docSnap.data() as ClienteRecord);
        });

        if (list.length === 0) {
          // Fallback to local storage migration or seed new sample data
          let localSaved = localStorage.getItem(dbName);
          let initial: ClienteRecord[] = [];
          if (localSaved) {
            try {
              initial = JSON.parse(localSaved);
            } catch (e) {
              console.error('Error parsing local storage', e);
            }
          }
          if (initial.length === 0) {
            initial = generateSampleData();
          }

          // Batch save all to Firestore
          const batch = writeBatch(db);
          initial.forEach((record) => {
            const sanitized = sanitizeForFirestore(record);
            const ref = doc(db, 'clientes', String(record.id));
            batch.set(ref, sanitized);
          });
          await batch.commit();

          setRecords(initial);
          localStorage.setItem(dbName, JSON.stringify(initial));
        } else {
          // Sort list by dataCriacao descending so new items are first
          list.sort((a, b) => {
            const dateA = new Date(a.dataCriacao || 0).getTime();
            const dateB = new Date(b.dataCriacao || 0).getTime();
            return dateB - dateA;
          });
          setRecords(list);
          localStorage.setItem(dbName, JSON.stringify(list));
        }
      } catch (err) {
        console.error('Error loading records from Firestore:', err);
        showToast('Erro ao carregar dados da nuvem. Usando local temporário.', 'error');
        
        let saved = localStorage.getItem(dbName);
        if (saved) {
          try {
            setRecords(JSON.parse(saved));
          } catch (e) {
            setRecords([]);
          }
        } else {
          setRecords([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  const saveToLocalStorage = (newRecords: ClienteRecord[]) => {
    localStorage.setItem(dbName, JSON.stringify(newRecords));
    setRecords(newRecords);
  };

  // Stats
  const totalClientes = new Set(records.map(r => r.nomeCliente)).size;
  const totalChamados = records.length;
  const totalEquipamentos = records.filter(r => r.equipamento && r.equipamento.trim() !== '').length;
  const chamadosAbertos = records.filter(r => r.status === 'aberto').length;

  // Filter & Search Logic
  const filteredRecords = records.filter(item => {
    // 1. Global Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSearch = Object.values(item).some(val => 
        val && typeof val !== 'object' && val.toString().toLowerCase().includes(q)
      );
      if (!matchSearch) return false;
    }

    // 2. Advanced Filter
    if (appliedFilterValue.trim()) {
      const fVal = appliedFilterValue.toLowerCase().trim();
      if (appliedFilterField === 'all') {
        return Object.values(item).some(val => 
          val && typeof val !== 'object' && val.toString().toLowerCase().includes(fVal)
        );
      } else {
        const fieldVal = (item as any)[appliedFilterField];
        return fieldVal && fieldVal.toString().toLowerCase().includes(fVal);
      }
    }

    return true;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, appliedFilterField, appliedFilterValue]);

  // Form helpers
  const parseHistoricoString = (str: string, originalHistorico: HistoricoItem[] = []): HistoricoItem[] => {
    if (!str.trim()) return [];
    
    const lines = str.split('\n');
    const items: HistoricoItem[] = [];
    
    let currentItem: { data: string; textoLines: string[] } | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const match = line.match(/^\[(.*?)\]\s*(.*)/);
      if (match) {
        const dateStr = match[1].trim();
        const textStr = match[2];
        
        if (currentItem) {
          items.push({
            data: currentItem.data,
            texto: currentItem.textoLines.join('\n')
          });
        }
        
        // Match original item if possible to preserve precise ISO timestamps
        const originalItem = originalHistorico.find(orig => {
          const origFormatted = new Date(orig.data).toLocaleString('pt-BR');
          return origFormatted === dateStr;
        });
        
        let itemDate = '';
        if (originalItem) {
          itemDate = originalItem.data;
        } else {
          let parsedDate: Date | null = null;
          const dmyMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
          if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10) - 1;
            const year = parseInt(dmyMatch[3], 10);
            const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
            const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
            const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
            
            const d = new Date(year, month, day, hour, min, sec);
            if (!isNaN(d.getTime())) {
              parsedDate = d;
            }
          }
          itemDate = parsedDate ? parsedDate.toISOString() : new Date().toISOString();
        }
        
        currentItem = {
          data: itemDate,
          textoLines: [textStr]
        };
      } else {
        if (currentItem) {
          currentItem.textoLines.push(line);
        } else {
          // If no current item and line is non-empty, create new block
          currentItem = {
            data: new Date().toISOString(),
            textoLines: [line]
          };
        }
      }
    }
    
    if (currentItem) {
      items.push({
        data: currentItem.data,
        texto: currentItem.textoLines.join('\n')
      });
    }
    
    return items
      .map(item => ({
        ...item,
        texto: item.texto.trim()
      }))
      .filter(item => item.texto.length > 0);
  };

  const getHistoricoString = (hist: HistoricoItem[]): string => {
    if (!hist) return '';
    return hist.map(h => `[${new Date(h.data).toLocaleString('pt-BR')}] ${h.texto}`).join('\n');
  };

  const handleOpenFormModal = (record: ClienteRecord | null = null) => {
    if (record) {
      setEditingRecord(record);
      setFormNumeroChamado(record.numeroChamado);
      setFormNomeCliente(record.nomeCliente);
      setFormEndereco(record.endereco);
      setFormTelefone(record.telefone);
      setFormEmail(record.email || '');
      setFormIdProjeto(record.idProjeto || '');
      setFormIdVantive(record.idVantive || '');
      setFormNumeroLP(record.numeroLP || '');
      setFormEquipamento(record.equipamento || '');
      setFormHistorico(getHistoricoString(record.historico));
      setFormStatus(record.status);
      setFormPrioridade(record.prioridade);
      setFormDataPrevista(record.dataPrevista || '');
      setFormObservacoes(record.observacoes || '');
    } else {
      setEditingRecord(null);
      setFormNumeroChamado('');
      setFormNomeCliente('');
      setFormEndereco('');
      setFormTelefone('');
      setFormEmail('');
      setFormIdProjeto('');
      setFormIdVantive('');
      setFormNumeroLP('');
      setFormEquipamento('');
      setFormHistorico('');
      setFormStatus('aberto');
      setFormPrioridade('media');
      setFormDataPrevista('');
      setFormObservacoes('');
    }
    setIsFormModalOpen(true);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNumeroChamado.trim() || !formNomeCliente.trim() || !formEndereco.trim() || !formTelefone.trim()) {
      showToast('Por favor, preencha todos os campos obrigatórios (*).', 'error');
      return;
    }

    const histList = parseHistoricoString(formHistorico, editingRecord?.historico);

    if (editingRecord) {
      // Update
      const updatedRecord: ClienteRecord = {
        ...editingRecord,
        numeroChamado: formNumeroChamado.trim(),
        nomeCliente: formNomeCliente.trim(),
        endereco: formEndereco.trim(),
        telefone: formTelefone.trim(),
        email: formEmail.trim() || undefined,
        idProjeto: formIdProjeto.trim() || undefined,
        idVantive: formIdVantive.trim() || undefined,
        numeroLP: formNumeroLP.trim() || undefined,
        equipamento: formEquipamento.trim() || undefined,
        historico: histList,
        status: formStatus,
        prioridade: formPrioridade,
        dataPrevista: formDataPrevista || undefined,
        observacoes: formObservacoes.trim() || undefined,
        ultimaAtualizacao: new Date().toISOString()
      };

      try {
        const sanitized = sanitizeForFirestore(updatedRecord);
        await setDoc(doc(db, 'clientes', String(editingRecord.id)), sanitized);

        const updated = records.map(r => r.id === editingRecord.id ? updatedRecord : r);
        saveToLocalStorage(updated);
        showToast('Registro atualizado com sucesso!', 'success');
      } catch (err) {
        console.error('Error updating Firestore document:', err);
        showToast('Erro ao atualizar registro na nuvem.', 'error');
      }
    } else {
      // Create
      const newRec: ClienteRecord = {
        id: Date.now(),
        numeroChamado: formNumeroChamado.trim(),
        nomeCliente: formNomeCliente.trim(),
        endereco: formEndereco.trim(),
        telefone: formTelefone.trim(),
        email: formEmail.trim() || undefined,
        idProjeto: formIdProjeto.trim() || undefined,
        idVantive: formIdVantive.trim() || undefined,
        numeroLP: formNumeroLP.trim() || undefined,
        equipamento: formEquipamento.trim() || undefined,
        historico: histList,
        status: formStatus,
        prioridade: formPrioridade,
        dataPrevista: formDataPrevista || undefined,
        observacoes: formObservacoes.trim() || undefined,
        dataCriacao: new Date().toISOString(),
        ultimaAtualizacao: new Date().toISOString()
      };

      try {
        const sanitized = sanitizeForFirestore(newRec);
        await setDoc(doc(db, 'clientes', String(newRec.id)), sanitized);

        saveToLocalStorage([newRec, ...records]);
        showToast('Novo registro cadastrado!', 'success');
      } catch (err) {
        console.error('Error saving to Firestore:', err);
        showToast('Erro ao salvar novo registro na nuvem.', 'error');
      }
    }

    setIsFormModalOpen(false);
  };

  const handleDeleteRecord = async (id: number) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;

    if (confirm(`Excluir permanentemente o registro ${rec.numeroChamado} - ${rec.nomeCliente}?`)) {
      try {
        await deleteDoc(doc(db, 'clientes', String(id)));
        const remaining = records.filter(r => r.id !== id);
        saveToLocalStorage(remaining);
        showToast('Registro removido.', 'success');
      } catch (err) {
        console.error('Error deleting from Firestore:', err);
        showToast('Erro ao remover registro da nuvem.', 'error');
      }
    }
  };

  const handleAddTimestamp = () => {
    const timestamp = new Date().toLocaleString('pt-BR');
    setFormHistorico(prev => prev + (prev ? '\n' : '') + `[${timestamp}] `);
  };

  const handleHistoricoKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleAddTimestamp();
    }
  };

  const handleApplyFilter = () => {
    setAppliedFilterField(filterField);
    setAppliedFilterValue(filterValue);
  };

  const handleClearFilter = () => {
    setFilterField('all');
    setFilterValue('');
    setAppliedFilterField('all');
    setAppliedFilterValue('');
    setSearchQuery('');
  };

  // EXPORT CSV
  const handleExportCSV = () => {
    if (records.length === 0) {
      showToast('Nenhum dado para exportar.', 'warning');
      return;
    }

    const headers = [
      'Nº Chamado', 'Cliente', 'Endereço', 'Telefone', 'E-mail',
      'ID Projeto', 'ID Vantive', 'Nº LP', 'Equipamento',
      'Status', 'Prioridade', 'Data Criação', 'Última Atualização'
    ];

    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        `"${r.numeroChamado}"`,
        `"${r.nomeCliente.replace(/"/g, '""')}"`,
        `"${r.endereco.replace(/"/g, '""')}"`,
        `"${r.telefone}"`,
        `"${r.email || ''}"`,
        `"${r.idProjeto || ''}"`,
        `"${r.idVantive || ''}"`,
        `"${r.numeroLP || ''}"`,
        `"${(r.equipamento || '').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.prioridade}"`,
        `"${new Date(r.dataCriacao).toLocaleDateString('pt-BR')}"`,
        `"${new Date(r.ultimaAtualizacao).toLocaleDateString('pt-BR')}"`
      ].join(','))
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_equipamentos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Dados exportados para CSV com sucesso!', 'success');
  };

  // EXPORT JSON
  const handleExportJSON = () => {
    if (records.length === 0) {
      showToast('Nenhum dado para exportar.', 'warning');
      return;
    }

    const backup = {
      exportDate: new Date().toISOString(),
      totalRecords: records.length,
      data: records
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_clientes_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Backup JSON exportado com sucesso!', 'success');
  };

  // IMPORT JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.data || !Array.isArray(parsed.data)) {
          throw new Error('Formato inválido');
        }

        if (confirm(`Deseja importar ${parsed.data.length} registros? Isso substituirá os dados atuais.`)) {
          setLoading(true);
          try {
            // 1. Delete all existing docs from Firestore
            const querySnapshot = await getDocs(collection(db, 'clientes'));
            const deleteBatch = writeBatch(db);
            querySnapshot.forEach((docSnap) => {
              deleteBatch.delete(docSnap.ref);
            });
            await deleteBatch.commit();

            // 2. Batch write new records
            const addBatch = writeBatch(db);
            parsed.data.forEach((record: ClienteRecord) => {
              const sanitized = sanitizeForFirestore(record);
              const ref = doc(db, 'clientes', String(record.id));
              addBatch.set(ref, sanitized);
            });
            await addBatch.commit();

            saveToLocalStorage(parsed.data);
            showToast(`${parsed.data.length} registros importados com sucesso!`, 'success');
            setIsBackupModalOpen(false);
          } catch (error) {
            console.error('Error importing to Firestore:', error);
            showToast('Erro ao salvar os registros importados na nuvem.', 'error');
          } finally {
            setLoading(false);
          }
        }
      } catch (err) {
        showToast('Erro ao importar arquivo. Verifique o formato.', 'error');
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const handleLimparDB = async () => {
    if (confirm('ATENÇÃO: Isso apagará TODOS os registros permanentemente na nuvem e localmente. Tem certeza?')) {
      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'clientes'));
        const deleteBatch = writeBatch(db);
        querySnapshot.forEach((docSnap) => {
          deleteBatch.delete(docSnap.ref);
        });
        await deleteBatch.commit();

        saveToLocalStorage([]);
        showToast('Banco de dados limpo com sucesso!', 'success');
      } catch (err) {
        console.error('Error clearing Firestore database:', err);
        showToast('Erro ao limpar banco de dados na nuvem.', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <div className="database-container">
        <div className="db-header">
          <h2><i className="fas fa-database"></i> GESTÃO DE CLIENTES E EQUIPAMENTOS</h2>
          <p className="db-subtitle">Cadastro, consulta e histórico completo</p>
        </div>

        {/* Stats */}
        <div className="stats-container">
          <div className="stat-card">
            <i className="fas fa-users"></i>
            <div>
              <h3>{totalClientes}</h3>
              <p>Clientes</p>
            </div>
          </div>
          <div className="stat-card">
            <i className="fas fa-ticket-alt"></i>
            <div>
              <h3>{totalChamados}</h3>
              <p>Chamados</p>
            </div>
          </div>
          <div className="stat-card">
            <i className="fas fa-cogs"></i>
            <div>
              <h3>{totalEquipamentos}</h3>
              <p>Equipamentos</p>
            </div>
          </div>
          <div className="stat-card">
            <i className="fas fa-clock"></i>
            <div>
              <h3>{chamadosAbertos}</h3>
              <p>Em aberto</p>
            </div>
          </div>
        </div>

        {/* Database Actions */}
        <div className="db-actions">
          <button className="db-btn primary" onClick={() => handleOpenFormModal()}>
            <i className="fas fa-plus-circle"></i> Novo Registro
          </button>
          <button className="db-btn" onClick={() => setIsBackupModalOpen(true)}>
            <i className="fas fa-save"></i> Backup / Restauração
          </button>
          <button className="db-btn danger" onClick={handleLimparDB}>
            <i className="fas fa-trash"></i> Limpar Tudo
          </button>
          <div className="search-box">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Buscar em todos os campos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* View Mode Toggle */}
          <div className="view-mode-selector">
            <button 
              type="button" 
              className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Visualizar em Cards"
            >
              <i className="fas fa-th-large"></i> Cards
            </button>
            <button 
              type="button" 
              className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Visualizar em Tabela"
            >
              <i className="fas fa-table"></i> Tabela
            </button>
          </div>
        </div>

        {/* Advanced Filter Panel */}
        <div className="filters-container">
          <div className="filter-group">
            <label><i className="fas fa-filter"></i> Filtrar por:</label>
            <select value={filterField} onChange={(e) => setFilterField(e.target.value)}>
              <option value="all">Todos os campos</option>
              <option value="numeroChamado">Nº Chamado</option>
              <option value="nomeCliente">Cliente</option>
              <option value="idProjeto">ID Projeto</option>
              <option value="idVantive">ID Vantive</option>
              <option value="numeroLP">Nº LP</option>
              <option value="status">Status</option>
            </select>
            <input
              type="text"
              placeholder="Valor para filtrar..."
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
            />
            <button className="filter-btn" onClick={handleApplyFilter}>
              <i className="fas fa-check"></i> Aplicar
            </button>
            <button className="filter-btn secondary" onClick={handleClearFilter}>
              <i className="fas fa-times"></i> Limpar
            </button>
          </div>
        </div>

        {/* Table container */}
        <div className="table-container">
          {loading ? (
            <div className="no-data" style={{ display: 'block' }}>
              <i className="fas fa-spinner fa-spin"></i>
              <h3>Carregando dados...</h3>
              <p>Conectando ao banco de dados na nuvem para buscar os registros.</p>
            </div>
          ) : paginatedRecords.length === 0 ? (
            <div className="no-data" style={{ display: 'block' }}>
              <i className="fas fa-database"></i>
              <h3>Nenhum registro encontrado</h3>
              <p>Clique em "Novo Registro" para adicionar seu primeiro cliente/equipamento.</p>
            </div>
          ) : (
            <>
              {/* Desktop view */}
              <table id="clientesTable" className={`desktop-only-table ${viewMode === 'cards' ? 'table-view-hidden' : ''}`}>
                <thead>
                  <tr>
                    <th><i className="fas fa-hashtag"></i> Nº CHAMADO</th>
                    <th><i className="fas fa-user"></i> CLIENTE</th>
                    <th><i className="fas fa-map-marker-alt"></i> ENDEREÇO</th>
                    <th><i className="fas fa-phone"></i> CONTATO</th>
                    <th><i className="fas fa-project-diagram"></i> ID PROJETO</th>
                    <th><i className="fas fa-id-card"></i> ID VANTIVE</th>
                    <th><i className="fas fa-barcode"></i> Nº LP</th>
                    <th><i className="fas fa-history"></i> HISTÓRICO</th>
                    <th><i className="fas fa-tag"></i> STATUS</th>
                    <th><i className="fas fa-calendar"></i> DATA</th>
                    <th><i className="fas fa-cogs"></i> AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map(record => {
                    const lastHist = record.historico && record.historico.length > 0
                      ? record.historico[record.historico.length - 1].texto
                      : 'Sem histórico';

                    const statusText: Record<string, string> = {
                      'aberto': 'Aberto',
                      'em_andamento': 'Em Andamento',
                      'aguardando': 'Aguardando',
                      'concluido': 'Concluído',
                      'cancelado': 'Cancelado'
                    };

                    return (
                      <tr key={record.id}>
                        <td><strong>{record.numeroChamado}</strong></td>
                        <td>{record.nomeCliente}</td>
                        <td>{record.endereco}</td>
                        <td>
                          <div>{record.telefone}</div>
                          {record.email && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{record.email}</div>}
                        </td>
                        <td>{record.idProjeto || '-'}</td>
                        <td>{record.idVantive || '-'}</td>
                        <td>{record.numeroLP || '-'}</td>
                        <td>
                          <div className="historico-preview" title={lastHist}>
                            {lastHist}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge status-${record.status}`}>
                            {statusText[record.status] || record.status}
                          </span>
                        </td>
                        <td>{new Date(record.dataCriacao).toLocaleDateString('pt-BR')}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="action-btn view"
                              onClick={() => { setViewingRecord(record); setIsDetailModalOpen(true); }}
                              title="Visualizar detalhes"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                            <button
                              className="action-btn edit"
                              onClick={() => handleOpenFormModal(record)}
                              title="Editar registro"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeleteRecord(record.id)}
                              title="Excluir registro"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile View (Cards) */}
              <div className={`mobile-client-cards ${viewMode === 'cards' ? 'cards-view-active' : ''}`} style={{ display: viewMode === 'cards' ? 'grid' : undefined, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
                {paginatedRecords.map(record => {
                  const statusText: Record<string, string> = {
                    'aberto': 'Aberto',
                    'em_andamento': 'Em Andamento',
                    'aguardando': 'Aguardando',
                    'concluido': 'Concluído',
                    'cancelado': 'Cancelado'
                  };

                  return (
                    <div 
                      key={record.id} 
                      className="client-mobile-card"
                      style={{ 
                        '--card-accent-color': getStatusColor(record.status),
                        borderRadius: '8px',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 2px 6px var(--shadow)',
                        background: 'var(--card)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      } as React.CSSProperties}
                    >
                      {/* Top Accent Line */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '3px',
                        background: getStatusColor(record.status)
                      }} />

                      {/* Card Header: Chamado & Cliente */}
                      <div className="client-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0, padding: 0, border: 'none', gap: '4px', flexWrap: 'wrap' }}>
                        <div className="client-card-header-left" style={{ gap: '2px', minWidth: 0, flex: 1 }}>
                          <span className="client-card-id" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                            <i className="fas fa-hashtag"></i> {record.numeroChamado}
                          </span>
                          <h4 className="client-card-name" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={record.nomeCliente}>
                            {record.nomeCliente}
                          </h4>
                        </div>
                        <span className={`status-badge status-${record.status}`} style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 800 }}>
                          {statusText[record.status] || record.status}
                        </span>
                      </div>

                      {/* Card Body: Essential Info Only */}
                      <div className="client-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                        {record.endereco && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <i className="fas fa-map-marker-alt" style={{ color: 'var(--accent)', fontSize: '10px', width: '12px', textAlign: 'center', flexShrink: 0 }}></i>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={record.endereco}>
                              {record.endereco}
                            </span>
                          </div>
                        )}

                        {/* Phone & Creation Date line */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', fontSize: '10px', color: 'var(--muted)', fontWeight: 600 }}>
                          <span><i className="fas fa-phone" style={{ color: '#3b82f6', marginRight: '4px' }}></i>{record.telefone || 'Sem fone'}</span>
                          <span><i className="far fa-calendar-alt" style={{ color: '#10b981', marginRight: '4px' }}></i>{new Date(record.dataCriacao).toLocaleDateString('pt-BR')}</span>
                        </div>

                        {/* Badges for Project IDs if present */}
                        {(record.idProjeto || record.idVantive || record.numeroLP) && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', fontSize: '9px' }}>
                            {record.idProjeto && (
                              <span style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                Proj: {record.idProjeto}
                              </span>
                            )}
                            {record.idVantive && (
                              <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                Vant: {record.idVantive}
                              </span>
                            )}
                            {record.numeroLP && (
                              <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                LP: {record.numeroLP}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div className="client-card-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: 'auto' }}>
                        <div className="action-buttons" style={{ display: 'flex', gap: '4px', width: '100%' }}>
                          <button
                            className="action-btn view"
                            onClick={() => { setViewingRecord(record); setIsDetailModalOpen(true); }}
                            title="Visualizar todos os detalhes"
                            style={{ flex: 1, padding: '4px 6px', height: '28px', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', borderRadius: '5px' }}
                          >
                            <i className="fas fa-eye"></i> Detalhes
                          </button>
                          <button
                            className="action-btn edit"
                            onClick={() => handleOpenFormModal(record)}
                            title="Editar registro"
                            style={{ flex: 1, padding: '4px 6px', height: '28px', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', borderRadius: '5px' }}
                          >
                            <i className="fas fa-edit"></i> Editar
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() => handleDeleteRecord(record.id)}
                            title="Excluir registro"
                            style={{ padding: '4px', width: '28px', height: '28px', minWidth: '28px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px' }}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination controls */}
        {filteredRecords.length > 0 && (
          <div className="pagination" style={{ display: 'flex' }}>
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <span id="pageInfo">Página {currentPage} de {totalPages}</span>
            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        )}
      </div>

      {/* 1. Modal: Form (Create/Edit) */}
      {isFormModalOpen && (
        <div className="modal" style={{ display: 'flex' }} role="dialog">
          <div className="modal-content large">
            <button className="close-modal" onClick={() => setIsFormModalOpen(false)}>&times;</button>
            <h3>
              <i className="fas fa-user-plus"></i> {editingRecord ? 'Editar Registro' : 'Novo Registro'}
            </h3>

            <form onSubmit={handleSaveRecord} className="db-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="modalNumeroChamado"><i className="fas fa-hashtag"></i> Número do Chamado *</label>
                  <input
                    type="text"
                    id="modalNumeroChamado"
                    required
                    placeholder="Ex: CHM-2023-00123"
                    value={formNumeroChamado}
                    onChange={(e) => setFormNumeroChamado(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="modalNomeCliente"><i className="fas fa-user"></i> Nome do Cliente *</label>
                  <input
                    type="text"
                    id="modalNomeCliente"
                    required
                    placeholder="Nome completo ou razão social"
                    value={formNomeCliente}
                    onChange={(e) => setFormNomeCliente(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="modalEndereco"><i className="fas fa-map-marker-alt"></i> Endereço Completo *</label>
                <input
                  type="text"
                  id="modalEndereco"
                  required
                  placeholder="Rua, número, bairro, cidade, estado"
                  value={formEndereco}
                  onChange={(e) => setFormEndereco(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="modalTelefone"><i className="fas fa-phone"></i> Telefone *</label>
                  <input
                    type="text"
                    id="modalTelefone"
                    required
                    placeholder="(11) 99999-9999"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="modalEmail"><i className="fas fa-envelope"></i> E-mail</label>
                  <input
                    type="email"
                    id="modalEmail"
                    placeholder="cliente@empresa.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="modalIdProjeto"><i className="fas fa-project-diagram"></i> ID Projeto</label>
                  <input
                    type="text"
                    id="modalIdProjeto"
                    placeholder="Ex: PROJ-2023-FIBRA-01"
                    value={formIdProjeto}
                    onChange={(e) => setFormIdProjeto(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="modalIdVantive"><i className="fas fa-id-card"></i> ID Vantive</label>
                  <input
                    type="text"
                    id="modalIdVantive"
                    placeholder="Ex: VANT-123456"
                    value={formIdVantive}
                    onChange={(e) => setFormIdVantive(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="modalNumeroLP"><i className="fas fa-barcode"></i> Número LP</label>
                  <input
                    type="text"
                    id="modalNumeroLP"
                    placeholder="Ex: LP-789012"
                    value={formNumeroLP}
                    onChange={(e) => setFormNumeroLP(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="modalEquipamento"><i className="fas fa-server"></i> Equipamento</label>
                <input
                  type="text"
                  id="modalEquipamento"
                  placeholder="Modelo e especificações do equipamento"
                  value={formEquipamento}
                  onChange={(e) => setFormEquipamento(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="modalHistorico"><i className="fas fa-history"></i> Histórico de atendimento</label>
                <textarea
                  id="modalHistorico"
                  rows={4}
                  placeholder="Registre aqui todo o histórico de atendimento, observações, atualizações..."
                  value={formHistorico}
                  onChange={(e) => setFormHistorico(e.target.value)}
                  onKeyDown={handleHistoricoKeyDown}
                />
                <small className="form-help">Use timestamps automáticos com Ctrl+Enter</small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="modalStatus"><i className="fas fa-tag"></i> Status *</label>
                  <select
                    id="modalStatus"
                    required
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as RecordStatus)}
                  >
                    <option value="aberto">Aberto</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="aguardando">Aguardando Cliente</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="modalPrioridade"><i className="fas fa-exclamation-triangle"></i> Prioridade</label>
                  <select
                    id="modalPrioridade"
                    value={formPrioridade}
                    onChange={(e) => setFormPrioridade(e.target.value as RecordPrioridade)}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="modalDataPrevista"><i className="fas fa-calendar-check"></i> Previsão</label>
                  <input
                    type="date"
                    id="modalDataPrevista"
                    value={formDataPrevista}
                    onChange={(e) => setFormDataPrevista(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="modalObservacoes"><i className="fas fa-sticky-note"></i> Observações Adicionais</label>
                <textarea
                  id="modalObservacoes"
                  rows={3}
                  placeholder="Informações complementares..."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="db-btn secondary" onClick={() => setIsFormModalOpen(false)}>
                  <i className="fas fa-times"></i> Cancelar
                </button>
                <button type="button" className="db-btn warning" onClick={handleAddTimestamp}>
                  <i className="fas fa-plus"></i> Add. ao Histórico
                </button>
                <button type="submit" className="db-btn success">
                  <i className="fas fa-save"></i> Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: View details */}
      {isDetailModalOpen && viewingRecord && (
        <div className="modal" style={{ display: 'flex' }} role="dialog">
          <div className="modal-content xlarge">
            <button className="close-modal" onClick={() => setIsDetailModalOpen(false)}>&times;</button>
            <div id="detalhesContent">
              <div className="detalhes-header">
                <h3>{viewingRecord.numeroChamado} - {viewingRecord.nomeCliente}</h3>
                <div className="detalhes-status">
                  <span className={`status-badge status-${viewingRecord.status}`}>
                    {viewingRecord.status.toUpperCase()}
                  </span>
                  <span className={`prioridade-badge prioridade-${viewingRecord.prioridade}`}>
                    {viewingRecord.prioridade.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="detalhes-grid">
                <div className="detalhes-section">
                  <h4><i className="fas fa-info-circle"></i> Informações Gerais</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Cliente:</label>
                      <span>{viewingRecord.nomeCliente}</span>
                    </div>
                    <div className="info-item">
                      <label>Endereço:</label>
                      <span>{viewingRecord.endereco}</span>
                    </div>
                    <div className="info-item">
                      <label>Contato:</label>
                      <span>{viewingRecord.telefone}</span>
                    </div>
                    <div className="info-item">
                      <label>E-mail:</label>
                      <span>{viewingRecord.email || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>Equipamento:</label>
                      <span>{viewingRecord.equipamento || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="detalhes-section">
                  <h4><i className="fas fa-project-diagram"></i> IDs e Referências</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>ID Projeto:</label>
                      <span>{viewingRecord.idProjeto || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>ID Vantive:</label>
                      <span>{viewingRecord.idVantive || '-'}</span>
                    </div>
                    <div className="info-item">
                      <label>Número LP:</label>
                      <span>{viewingRecord.numeroLP || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="detalhes-section">
                  <h4><i className="fas fa-calendar-alt"></i> Datas e Status</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Data de Criação:</label>
                      <span>{new Date(viewingRecord.dataCriacao).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="info-item">
                      <label>Última Atualização:</label>
                      <span>{new Date(viewingRecord.ultimaAtualizacao).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="info-item">
                      <label>Previsão de Conclusão:</label>
                      <span>{viewingRecord.dataPrevista ? new Date(viewingRecord.dataPrevista).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                  </div>
                </div>

                {viewingRecord.observacoes && (
                  <div className="detalhes-section full-width">
                    <h4><i className="fas fa-sticky-note"></i> Observações</h4>
                    <div className="observacoes">{viewingRecord.observacoes}</div>
                  </div>
                )}

                <div className="detalhes-section full-width">
                  <h4><i className="fas fa-history"></i> Histórico Completo</h4>
                  {viewingRecord.historico && viewingRecord.historico.length > 0 ? (
                    <div className="observacoes" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      {getHistoricoString(viewingRecord.historico)}
                    </div>
                  ) : (
                    <p>Nenhum histórico registrado.</p>
                  )}
                </div>
              </div>

              <div className="detalhes-actions">
                <button
                  className="db-btn"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenFormModal(viewingRecord);
                  }}
                >
                  <i className="fas fa-edit"></i> Editar Registro
                </button>
                <button
                  className="db-btn primary"
                  onClick={async () => {
                    const txt = prompt('Digite o texto para adicionar ao histórico:');
                    if (txt && txt.trim()) {
                      const updatedHist = [...(viewingRecord.historico || []), {
                        data: new Date().toISOString(),
                        texto: txt.trim()
                      }];
                      const updatedRecord = {
                        ...viewingRecord,
                        historico: updatedHist,
                        ultimaAtualizacao: new Date().toISOString()
                      };

                      try {
                        const sanitized = sanitizeForFirestore(updatedRecord);
                        await setDoc(doc(db, 'clientes', String(viewingRecord.id)), sanitized);

                        const updated = records.map(r => r.id === viewingRecord.id ? updatedRecord : r);
                        saveToLocalStorage(updated);
                        setViewingRecord(updatedRecord);
                        showToast('Histórico atualizado!', 'success');
                      } catch (err) {
                        console.error('Error saving history item to Firestore:', err);
                        showToast('Erro ao salvar item de histórico na nuvem.', 'error');
                      }
                    }
                  }}
                >
                  <i className="fas fa-plus"></i> Adicionar ao Histórico
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Backup / Restore */}
      {isBackupModalOpen && (
        <div className="modal" style={{ display: 'flex' }} role="dialog">
          <div className="modal-content">
            <button className="close-modal" onClick={() => setIsBackupModalOpen(false)}>&times;</button>
            <h3><i className="fas fa-database"></i> Backup & Restauração</h3>

            <div className="backup-options">
              <div className="backup-card">
                <i className="fas fa-download"></i>
                <h4>Exportar Banco de Dados</h4>
                <p>Faça backup completo em formato JSON</p>
                <button className="db-btn primary" onClick={handleExportJSON}>
                  <i className="fas fa-file-export"></i> Exportar JSON
                </button>
              </div>

              <div className="backup-card">
                <i className="fas fa-upload"></i>
                <h4>Importar Banco de Dados</h4>
                <p>Restaurar a partir de um backup</p>
                <input
                  type="file"
                  id="importFile"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleImportJSON}
                />
                <button className="db-btn" onClick={() => document.getElementById('importFile')?.click()}>
                  <i className="fas fa-folder-open"></i> Selecionar Arquivo
                </button>
              </div>

              <div className="backup-card">
                <i className="fas fa-file-csv"></i>
                <h4>Exportar para CSV/Excel</h4>
                <p>Compatível com Excel e Google Sheets</p>
                <button className="db-btn success" onClick={handleExportCSV}>
                  <i className="fas fa-file-excel"></i> Exportar CSV
                </button>
              </div>
            </div>

            <div className="backup-info">
              <p><i className="fas fa-info-circle"></i> <strong>Total de registros:</strong> <span>{records.length}</span></p>
              <p><i className="fas fa-calendar"></i> <strong>Sincronização:</strong> Ativa no Local Storage</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
