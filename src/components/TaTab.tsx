import React, { useState, useEffect } from 'react';
import { TaRecord, TaStatus } from '../types';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { jsPDF } from 'jspdf';

interface TaTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function TaTab({ showToast }: TaTabProps) {
  const dbName = 'taDB';
  const [records, setRecords] = useState<TaRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtering & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSobressalente, setFilterSobressalente] = useState<'all' | 'sim' | 'nao'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6; // Since card details are long, show 6 per page

  // Modals States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [showResolucaoWarningModal, setShowResolucaoWarningModal] = useState(false);

  // Password confirmation state
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingEditRecord, setPendingEditRecord] = useState<TaRecord | null>(null);

  // Editing and Active records
  const [editingRecord, setEditingRecord] = useState<TaRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<TaRecord | null>(null);
  const [generatedReportText, setGeneratedReportText] = useState('');

  // Form Fields
  const [formNumeroTa, setFormNumeroTa] = useState('');
  const [formDefinicoes, setFormDefinicoes] = useState('');
  const [formDataInicio, setFormDataInicio] = useState('');
  const [formHoraInicio, setFormHoraInicio] = useState('');
  const [formHoraAcionado, setFormHoraAcionado] = useState('');
  const [formSobressalenteNecessario, setFormSobressalenteNecessario] = useState(false);
  const [formNumeroChamadoSobressalente, setFormNumeroChamadoSobressalente] = useState('');
  const [formSuporteAtendente, setFormSuporteAtendente] = useState('');
  const [formTecnicoN1Tx, setFormTecnicoN1Tx] = useState('');
  const [formResolucaoFalha, setFormResolucaoFalha] = useState('');
  const [formStatus, setFormStatus] = useState<TaStatus>('correlação');

  // Backup file state
  const [backupFileContent, setBackupFileContent] = useState('');

  // Semente de dados de exemplo se o banco estiver vazio
  const generateSampleData = (): TaRecord[] => {
    const atendentes = ['Carlos Oliveira', 'Renata Souza', 'Felipe Santos', 'Mariana Costa', 'Thiago Lima'];
    const definicoes = [
      'Ativação de enlace GPON no cliente final com testes de atenuação de ponta a ponta.',
      'Substituição de Switch Core de borda por falha física nas portas SFP+.',
      'Reconfiguração de VLAN de gerência e roteamento OSPF no roteador de borda.',
      'Identificação de rompimento de fibra óptica na caixa de emenda aérea (CEO).',
      'Instalação e alinhamento de rádio enlace digital de contingência.'
    ];
    const resolucoes = [
      'Realizada limpeza de conectores ópticos e re-fusão do pigtail na caixa de terminação óptica. Sinal normalizado para -19 dBm.',
      'Substituído equipamento defeituoso por spare-part idêntico. Configuração restaurada via backup e portas SFP+ restabelecidas.',
      'Identificada divergência no ID da VLAN de gerência. Corrigido mapeamento no concentrador e restabelecido roteamento OSPF.',
      'Equipe de infraestrutura lançou 200m de cabo de fibra e realizou nova fusão na CEO-04. Atenuação normalizada.',
      'Ajustado azimute e elevação do rádio. Alinhamento otimizado com margem de sinal de 65 dBm, tráfego liberado.'
    ];

    const data: TaRecord[] = [];
    const now = new Date();

    for (let i = 1; i <= 5; i++) {
      const idx = i - 1;
      const dateRec = new Date(now);
      dateRec.setDate(dateRec.getDate() - i);
      const dataStr = dateRec.toISOString().split('T')[0];

      const sobressalente = i % 2 === 0;

      data.push({
        id: `TA-${Date.now() + i}`,
        numeroTa: `TA-2026-${String(i).padStart(4, '0')}`,
        definicoes: definicoes[idx],
        dataInicio: dataStr,
        horaInicio: `09:${String(15 + i * 5).padStart(2, '0')}`,
        horaAcionado: `08:${String(45 + i * 2).padStart(2, '0')}`,
        sobressalenteNecessario: sobressalente,
        numeroChamadoSobressalente: sobressalente ? `CHM-SOB-${202600 + i}` : '',
        suporteAtendente: atendentes[idx],
        resolucaoFalha: resolucoes[idx],
        status: (i === 1 || i === 4) ? 'correlação' : 'encerrado',
        dataCriacao: dateRec.toISOString(),
        ultimaAtualizacao: dateRec.toISOString()
      });
    }
    return data;
  };

  const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
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

  // Load records from Firestore on mount
  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'tas'));
        const list: TaRecord[] = [];
        querySnapshot.forEach((docSnap) => {
          list.push(docSnap.data() as TaRecord);
        });

        if (list.length === 0) {
          // Empty DB -> seed with samples or local backup
          let localSaved = localStorage.getItem(dbName);
          let initial: TaRecord[] = [];
          if (localSaved) {
            try {
              initial = JSON.parse(localSaved);
            } catch (e) {
              console.error('Error parsing local TA DB', e);
            }
          }
          if (initial.length === 0) {
            initial = generateSampleData();
          }

          // Sync to Firestore
          const batch = writeBatch(db);
          initial.forEach((record) => {
            const sanitized = sanitizeForFirestore(record);
            const ref = doc(db, 'tas', record.id);
            batch.set(ref, sanitized);
          });
          await batch.commit();

          setRecords(initial);
          localStorage.setItem(dbName, JSON.stringify(initial));
        } else {
          // Sort by creation date descending
          list.sort((a, b) => new Date(b.dataCriacao || 0).getTime() - new Date(a.dataCriacao || 0).getTime());
          setRecords(list);
          localStorage.setItem(dbName, JSON.stringify(list));
        }
      } catch (err) {
        console.error('Error loading TA records from Firestore:', err);
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

  const saveToLocalStorage = (newRecords: TaRecord[]) => {
    localStorage.setItem(dbName, JSON.stringify(newRecords));
    setRecords(newRecords);
  };

  // Stats
  const totalTAs = records.length;
  const totalSobressalentes = records.filter(r => r.sobressalenteNecessario).length;
  const totalSemSobressalente = records.filter(r => !r.sobressalenteNecessario).length;
  const atendentesAtivosCount = new Set(records.map(r => (r.suporteAtendente || '').trim().toLowerCase()).filter(Boolean)).size;

  // Filter & Search Logic
  const filteredRecords = records.filter(item => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSearch = 
        item.numeroTa.toLowerCase().includes(q) ||
        item.definicoes.toLowerCase().includes(q) ||
        ((item.suporteAtendente || '').toLowerCase().includes(q)) ||
        ((item.tecnicoN1Tx || '').toLowerCase().includes(q)) ||
        ((item.resolucaoFalha || '').toLowerCase().includes(q)) ||
        (item.numeroChamadoSobressalente && item.numeroChamadoSobressalente.toLowerCase().includes(q));
      
      if (!matchSearch) return false;
    }

    // 2. Sobressalente Filter
    if (filterSobressalente !== 'all') {
      const target = filterSobressalente === 'sim';
      if (item.sobressalenteNecessario !== target) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSobressalente]);

  // Click "Editar" handler with password protection for closed ('encerrado') records
  const handleEditClick = (record: TaRecord) => {
    if (record.status === 'encerrado') {
      setPendingEditRecord(record);
      setPasswordInput('');
      setIsPasswordModalOpen(true);
    } else {
      handleOpenFormModal(record);
    }
  };

  // Verify the secret password to allow editing closed records
  const handleVerifyPassword = () => {
    if (passwordInput === 'Caragua5290') {
      setIsPasswordModalOpen(false);
      showToast('Acesso autorizado com sucesso!', 'success');
      if (pendingEditRecord) {
        const dateStr = new Date().toLocaleString('pt-BR');
        const logEntry = `Reaberto/Editado em ${dateStr}`;
        const updatedHistory = [...(pendingEditRecord.historicoEdicoes || []), logEntry];
        
        const recordWithHistory: TaRecord = {
          ...pendingEditRecord,
          historicoEdicoes: updatedHistory
        };

        handleOpenFormModal(recordWithHistory);
        setPendingEditRecord(null);
      }
    } else {
      showToast('Senha incorreta! Tente novamente.', 'error');
    }
  };

  // Handle Form Open (New / Edit)
  const handleOpenFormModal = (record: TaRecord | null = null) => {
    if (record) {
      setEditingRecord(record);
      setFormNumeroTa(record.numeroTa);
      setFormDefinicoes(record.definicoes);
      setFormDataInicio(record.dataInicio);
      setFormHoraInicio(record.horaInicio);
      setFormHoraAcionado(record.horaAcionado);
      setFormSobressalenteNecessario(record.sobressalenteNecessario);
      setFormNumeroChamadoSobressalente(record.numeroChamadoSobressalente || '');
      setFormSuporteAtendente(record.suporteAtendente || '');
      setFormTecnicoN1Tx(record.tecnicoN1Tx || '');
      setFormResolucaoFalha(record.resolucaoFalha || '');
      setFormStatus(record.status || 'correlação');
    } else {
      const today = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      setEditingRecord(null);
      setFormNumeroTa('');
      setFormDefinicoes('');
      setFormDataInicio(today);
      setFormHoraInicio(nowTime);
      setFormHoraAcionado(nowTime);
      setFormSobressalenteNecessario(false);
      setFormNumeroChamadoSobressalente('');
      setFormSuporteAtendente('');
      setFormTecnicoN1Tx('');
      setFormResolucaoFalha('');
      setFormStatus('correlação');
    }
    setIsFormModalOpen(true);
  };

  // Helper to run the actual save operation after any confirmations
  const executeSave = async () => {
    if (editingRecord) {
      // Update
      const updatedRecord: TaRecord = {
        ...editingRecord,
        numeroTa: formNumeroTa.trim(),
        definicoes: formDefinicoes.trim(),
        dataInicio: formDataInicio,
        horaInicio: formHoraInicio,
        horaAcionado: formHoraAcionado,
        sobressalenteNecessario: formSobressalenteNecessario,
        numeroChamadoSobressalente: formSobressalenteNecessario ? formNumeroChamadoSobressalente.trim() : '',
        suporteAtendente: formSuporteAtendente.trim() || undefined,
        tecnicoN1Tx: formTecnicoN1Tx.trim() || undefined,
        resolucaoFalha: formResolucaoFalha.trim() || undefined,
        status: formStatus,
        ultimaAtualizacao: new Date().toISOString()
      };

      try {
        const sanitized = sanitizeForFirestore(updatedRecord);
        await setDoc(doc(db, 'tas', editingRecord.id), sanitized);

        const updated = records.map(r => r.id === editingRecord.id ? updatedRecord : r);
        saveToLocalStorage(updated);
        showToast('TA atualizado com sucesso!', 'success');
        setIsFormModalOpen(false);
      } catch (err) {
        console.error('Error updating Firestore TA document:', err);
        showToast('Erro ao atualizar TA na nuvem.', 'error');
      }
    } else {
      // Create
      const newId = `TA-${Date.now()}`;
      const newRec: TaRecord = {
        id: newId,
        numeroTa: formNumeroTa.trim(),
        definicoes: formDefinicoes.trim(),
        dataInicio: formDataInicio,
        horaInicio: formHoraInicio,
        horaAcionado: formHoraAcionado,
        sobressalenteNecessario: formSobressalenteNecessario,
        numeroChamadoSobressalente: formSobressalenteNecessario ? formNumeroChamadoSobressalente.trim() : '',
        suporteAtendente: formSuporteAtendente.trim() || undefined,
        tecnicoN1Tx: formTecnicoN1Tx.trim() || undefined,
        resolucaoFalha: formResolucaoFalha.trim() || undefined,
        status: formStatus,
        dataCriacao: new Date().toISOString(),
        ultimaAtualizacao: new Date().toISOString()
      };

      try {
        const sanitized = sanitizeForFirestore(newRec);
        await setDoc(doc(db, 'tas', newRec.id), sanitized);

        saveToLocalStorage([newRec, ...records]);
        showToast('Novo registro de TA cadastrado!', 'success');
        setIsFormModalOpen(false);
      } catch (err) {
        console.error('Error saving TA to Firestore:', err);
        showToast('Erro ao salvar novo registro de TA na nuvem.', 'error');
      }
    }
  };

  // Handle Save Record
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNumeroTa.trim() || !formDefinicoes.trim() || !formDataInicio.trim() || !formHoraInicio.trim() || !formHoraAcionado.trim()) {
      showToast('Por favor, preencha todos os campos obrigatórios (*).', 'error');
      return;
    }

    // Bloqueio de Encerramento sem Resolução
    if (formStatus === 'encerrado' && !formResolucaoFalha.trim()) {
      setShowResolucaoWarningModal(true);
      return;
    }

    await executeSave();
  };

  // Handle Delete Record
  const handleDeleteRecord = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir permanentemente este registro de TA?')) {
      try {
        await deleteDoc(doc(db, 'tas', id));
        const updated = records.filter(r => r.id !== id);
        saveToLocalStorage(updated);
        showToast('Registro de TA removido com sucesso.', 'success');
        if (viewingRecord?.id === id) {
          setIsDetailModalOpen(false);
        }
      } catch (err) {
        console.error('Error deleting document from Firestore:', err);
        showToast('Erro ao deletar registro de TA na nuvem.', 'error');
      }
    }
  };

  // Handle Detail Open
  const handleOpenDetailModal = (record: TaRecord) => {
    setViewingRecord(record);
    setIsDetailModalOpen(true);
  };

  // Generate Text Report (like Carimbo de Fibras)
  const handleGerarRelatorioTa = (record: TaRecord) => {
    const formattedDate = new Date(record.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR');
    
    let content = `=========================================\n`;
    content += `       CARIMBO DE ATENDIMENTO - TA\n`;
    content += `=========================================\n`;
    content += `Nº DO TA: ${record.numeroTa}\n`;
    content += `TÉCNICO DE N1 TX: ${record.tecnicoN1Tx || 'N/A'}\n`;
    content += `NOME SUPORTE: ${record.suporteAtendente || 'N/A'}\n`;
    content += `DATA INÍCIO: ${formattedDate}\n`;
    content += `HORA INÍCIO: ${record.horaInicio}\n`;
    content += `HORA ACIONAMENTO: ${record.horaAcionado}\n`;
    content += `SOBRESSALENTE NECESSÁRIO: ${record.sobressalenteNecessario ? 'SIM' : 'NÃO'}\n`;
    if (record.sobressalenteNecessario) {
      content += `Nº CHAMADO SOBRESSALENTE: ${record.numeroChamadoSobressalente || 'N/A'}\n`;
    }
    content += `-----------------------------------------\n`;
    content += `DEFINIÇÕES DO CASO:\n`;
    content += `${record.definicoes}\n`;
    content += `-----------------------------------------\n`;
    content += `RESOLUÇÃO DA FALHA:\n`;
    content += `${record.resolucaoFalha}\n`;
    content += `=========================================\n`;
    content += `Gerado em: ${new Date().toLocaleString('pt-BR')} | Sistema Unificado de Redes\n`;
    
    setGeneratedReportText(content);
    setIsReportModalOpen(true);
  };

  const handleCopiarRelatorio = () => {
    if (!generatedReportText) {
      showToast('Nenhum relatório gerado.', 'error');
      return;
    }
    const cleanText = generatedReportText.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanText)
        .then(() => showToast('Carimbo do TA copiado com sucesso!', 'success'))
        .catch(() => handleFallbackCopy(cleanText));
    } else {
      handleFallbackCopy(cleanText);
    }
  };

  const handleFallbackCopy = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showToast('Carimbo do TA copiado com sucesso!', 'success');
      } else {
        showToast('Falha ao copiar automaticamente.', 'error');
      }
    } catch (err) {
      showToast('Erro ao copiar relatório.', 'error');
    }
    document.body.removeChild(textarea);
  };

  const handleExportarRelatorioPDF = (numeroTa: string) => {
    if (!generatedReportText) return;
    try {
      const docPdf = new jsPDF();
      docPdf.setFontSize(16);
      docPdf.setTextColor(16, 185, 129); // Success color / Accent
      docPdf.text('RELATÓRIO DO TERMO DE ATENDIMENTO', 20, 20);
      
      docPdf.setFontSize(10);
      docPdf.setTextColor(0, 0, 0);
      
      const lines = generatedReportText.split('\n');
      let y = 35;
      lines.forEach(line => {
        if (y > 275) {
          docPdf.addPage();
          y = 20;
        }
        docPdf.text(line, 20, y);
        y += 6.5;
      });
      
      docPdf.setFontSize(8);
      docPdf.setTextColor(128, 128, 128);
      docPdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Sistema Unificado de Redes`, 20, 285);
      
      const fileName = `Carimbo_TA_${numeroTa.replace(/\s+/g, '_')}.pdf`;
      docPdf.save(fileName);
      showToast('PDF gerado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar o arquivo PDF.', 'error');
    }
  };

  // Handle Backup Operations
  const handleExportBackup = () => {
    const dataStr = JSON.stringify(records, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_ta_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exportado backup da base de TAs!', 'success');
  };

  const handleImportBackup = async () => {
    if (!backupFileContent.trim()) {
      showToast('Por favor, selecione ou cole o conteúdo do arquivo de backup.', 'error');
      return;
    }

    try {
      const parsed = JSON.parse(backupFileContent);
      if (!Array.isArray(parsed)) {
        showToast('Formato inválido! O backup deve ser uma lista de registros.', 'error');
        return;
      }

      // Quick validation
      const isValid = parsed.every(item => item.id && item.numeroTa && item.definicoes);
      if (!isValid) {
        showToast('Formato inválido! Os registros de TA estão incompletos no arquivo.', 'error');
        return;
      }

      setLoading(true);
      const batch = writeBatch(db);

      parsed.forEach((record: TaRecord) => {
        const sanitized = sanitizeForFirestore(record);
        const ref = doc(db, 'tas', record.id);
        batch.set(ref, sanitized);
      });

      await batch.commit();

      saveToLocalStorage(parsed);
      setIsBackupModalOpen(false);
      setBackupFileContent('');
      showToast('Backup de TAs restaurado com sucesso!', 'success');
    } catch (e) {
      console.error('Error importing backup:', e);
      showToast('Falha ao processar arquivo de backup. Verifique se é um JSON válido.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLimparDB = async () => {
    if (confirm('ATENÇÃO: Isso irá excluir permanentemente TODOS os registros de TA da nuvem e do armazenamento local. Deseja prosseguir?')) {
      try {
        setLoading(true);
        const batch = writeBatch(db);
        records.forEach(r => {
          const ref = doc(db, 'tas', r.id);
          batch.delete(ref);
        });
        await batch.commit();

        saveToLocalStorage([]);
        showToast('Todos os registros de TA foram apagados!', 'warning');
      } catch (err) {
        console.error('Error clearing database', err);
        showToast('Erro ao limpar base de TAs na nuvem.', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBackupFileContent(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <div className="database-container" id="ta-container">
        <div className="db-header">
          <h2><i className="fas fa-file-signature"></i> CADASTRO E CONTROLE DE TA</h2>
          <p className="db-subtitle">Gerencie e registre termos, definições e resoluções de falhas</p>
        </div>

        {/* Stats Section */}
        <div className="stats-container">
          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <i className="fas fa-ticket-alt" style={{ color: 'var(--accent)', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{totalTAs}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Total de TAs</div>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
            <i className="fas fa-sync fa-spin" style={{ color: '#3b82f6', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{records.filter(r => (r.status || 'correlação') === 'correlação').length}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Em Correlação</div>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
            <i className="fas fa-check-double" style={{ color: '#10b981', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{records.filter(r => r.status === 'encerrado').length}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>TAs Encerrados</div>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <i className="fas fa-cubes" style={{ color: 'var(--warning)', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{totalSobressalentes}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Com Sobressalente</div>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <i className="fas fa-box" style={{ color: 'var(--success)', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{totalSemSobressalente}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Sem Sobressalente</div>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #a855f7' }}>
            <i className="fas fa-users-cog" style={{ color: '#a855f7', fontSize: '24px' }}></i>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--fg)' }}>{atendentesAtivosCount}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Técnicos de Suporte</div>
            </div>
          </div>
        </div>

        {/* Action and Search Controls */}
        <div className="db-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '20px' }}>
          <button className="db-btn primary" onClick={() => handleOpenFormModal()}>
            <i className="fas fa-plus-circle"></i> Registrar Novo TA
          </button>
          <button className="db-btn" onClick={() => setIsBackupModalOpen(true)}>
            <i className="fas fa-save"></i> Backup / Restauro
          </button>
          <button className="db-btn danger" onClick={handleLimparDB}>
            <i className="fas fa-trash"></i> Limpar Tudo
          </button>

          <div className="search-box" style={{ flex: '1', minWidth: '250px' }}>
            <i className="fas fa-search"></i>
            <input 
              type="text" 
              placeholder="Buscar por nº TA, definições, atendente..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Filter Panel */}
        <div className="filters-container" style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <div className="filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
            <label style={{ fontWeight: 600, color: 'var(--accent)' }}><i className="fas fa-filter"></i> Filtrar Uso de Sobressalente:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className={`filter-btn ${filterSobressalente === 'all' ? '' : 'secondary'}`} 
                onClick={() => setFilterSobressalente('all')}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Todos
              </button>
              <button 
                className={`filter-btn ${filterSobressalente === 'sim' ? '' : 'secondary'}`} 
                onClick={() => setFilterSobressalente('sim')}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Sim (Necessário)
              </button>
              <button 
                className={`filter-btn ${filterSobressalente === 'nao' ? '' : 'secondary'}`} 
                onClick={() => setFilterSobressalente('nao')}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Não Necessário
              </button>
            </div>
          </div>
        </div>

        {/* Content Listing - Optimized Mobile Card Design from Checkpoint */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '40px', color: 'var(--accent)', marginBottom: '15px' }}></i>
            <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Carregando dados da nuvem...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0', border: '2px dashed var(--border)', borderRadius: '15px' }}>
            <i className="fas fa-search-minus" style={{ fontSize: '45px', color: 'var(--muted)', marginBottom: '15px' }}></i>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--muted)' }}>Nenhum registro de TA encontrado.</p>
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Tente ajustar seus filtros de busca ou crie um novo registro.</p>
          </div>
        ) : (
          <>
            {/* Display in a Compact, High-Density Grid */}
            <div className="mobile-client-cards cards-view-active" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
              {paginatedRecords.map(record => {
                return (
                  <div 
                    key={record.id} 
                    className="client-mobile-card"
                    style={{ 
                      '--card-accent-color': record.sobressalenteNecessario ? '#f59e0b' : '#10b981',
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
                    {/* Visual accent top line */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '3px',
                      background: record.sobressalenteNecessario ? '#f59e0b' : '#10b981'
                    }} />

                    {/* Header: TA Number & Statuses */}
                    <div className="client-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0, padding: 0, border: 'none', gap: '4px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="ta-pill" style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          background: 'rgba(var(--accent-rgb), 0.1)',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          border: '1px solid rgba(var(--accent-rgb), 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <i className="fas fa-barcode"></i> {record.numeroTa}
                        </span>

                        <span className="status-badge" style={{
                          background: (record.status || 'correlação') === 'encerrado' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                          color: (record.status || 'correlação') === 'encerrado' ? '#10b981' : '#3b82f6',
                          border: `1px solid ${(record.status || 'correlação') === 'encerrado' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                          fontSize: '9px',
                          fontWeight: 800,
                          borderRadius: '4px',
                          padding: '1px 5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          margin: 0,
                          textTransform: 'uppercase'
                        }}>
                          <i className={(record.status || 'correlação') === 'encerrado' ? 'fas fa-lock' : 'fas fa-sync fa-spin'}></i>
                          {record.status || 'correlação'}
                        </span>

                        {record.historicoEdicoes && record.historicoEdicoes.length > 0 && (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            fontSize: '8px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            padding: '1px 4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            margin: 0
                          }} title="Reaberto/Editado">
                            <i className="fas fa-history"></i> ({record.historicoEdicoes.length})
                          </span>
                        )}
                      </div>
                      
                      <span 
                        className="status-badge" 
                        style={{ 
                          background: record.sobressalenteNecessario ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: record.sobressalenteNecessario ? '#f59e0b' : '#10b981',
                          border: `1px solid ${record.sobressalenteNecessario ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          fontSize: '9px',
                          fontWeight: 700,
                          borderRadius: '4px',
                          padding: '1px 5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          margin: 0
                        }}
                      >
                        <i className={record.sobressalenteNecessario ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'}></i>
                        {record.sobressalenteNecessario ? 'Com Spare' : 'Sem Spare'}
                      </span>
                    </div>

                    {/* Support & Technician Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '2px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-user-cog" style={{ color: 'var(--accent)', fontSize: '10px', width: '12px', textAlign: 'center' }}></i>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--muted)', fontSize: '10px', marginRight: '4px' }}>Téc:</span>
                          {record.tecnicoN1Tx || 'Não informado'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-headset" style={{ color: '#3b82f6', fontSize: '10px', width: '12px', textAlign: 'center' }}></i>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--muted)', fontSize: '10px', marginRight: '4px' }}>Sup:</span>
                          {record.suporteAtendente || 'Não informado'}
                        </span>
                      </div>
                    </div>

                    {/* Essential timestamps summary line */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      background: 'var(--bg)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '6px', 
                      padding: '4px 8px',
                      fontSize: '10px',
                      color: 'var(--muted)',
                      fontWeight: 600
                    }}>
                      <span><i className="far fa-calendar-alt" style={{ color: '#10b981', marginRight: '3px' }}></i>{new Date(record.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      <span><i className="far fa-bell" style={{ color: 'var(--accent)', marginRight: '3px' }}></i>{record.horaAcionado}</span>
                      <span><i className="far fa-clock" style={{ color: '#3b82f6', marginRight: '3px' }}></i>{record.horaInicio}</span>
                    </div>

                    {/* Footer Actions */}
                    <div className="client-card-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <button 
                        className="db-btn" 
                        onClick={() => handleGerarRelatorioTa(record)} 
                        title="Gerar Carimbo TA"
                        style={{ width: '100%', padding: '4px 6px', height: '28px', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', borderRadius: '5px', cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }}
                      >
                        <i className="fas fa-stamp"></i> Carimbo TA
                      </button>
                      <button 
                        className="db-btn secondary" 
                        onClick={() => handleOpenDetailModal(record)} 
                        title="Visualizar todos os detalhes (Definições, Resolução, etc)"
                        style={{ flex: 1, padding: '4px 6px', height: '28px', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        <i className="fas fa-eye"></i> Detalhes
                      </button>
                      
                      <button 
                        className="db-btn" 
                        onClick={() => handleEditClick(record)} 
                        title="Editar TA"
                        style={{ flex: 1, padding: '4px 6px', height: '28px', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
                      >
                        <i className="fas fa-edit"></i> Editar
                      </button>
                      
                      <button 
                        className="db-btn danger" 
                        onClick={() => handleDeleteRecord(record.id)} 
                        title="Excluir Registro"
                        style={{ padding: '4px', width: '28px', height: '28px', minWidth: '28px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px', cursor: 'pointer' }}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '30px' }}>
                <button 
                  className="db-btn" 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  style={{ padding: '8px 16px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <i className="fas fa-chevron-left"></i> Anterior
                </button>
                <span style={{ fontWeight: 600, color: 'var(--fg)', fontSize: '14px' }}>
                  Página {currentPage} de {totalPages}
                </span>
                <button 
                  className="db-btn" 
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  style={{ padding: '8px 16px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Próximo <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL 1: Form Cadastro / Edição */}
      {isFormModalOpen && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, overflowY: 'auto', padding: '15px' }}>
          <div className="modal-content large" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '650px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setIsFormModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-file-signature"></i>
              {editingRecord ? 'Editar Registro de TA' : 'Registrar Novo TA'}
            </h3>

            <form onSubmit={handleSaveRecord}>
              {/* STATUS DE CORRELAÇÃO OU ENCERRADO */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', padding: '15px', background: 'rgba(var(--accent-rgb), 0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <label style={{ fontWeight: 700, fontSize: '13px', color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-toggle-on"></i> STATUS DO ATENDIMENTO *
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className={`db-btn ${formStatus === 'correlação' ? 'primary' : 'secondary'}`}
                    onClick={() => setFormStatus('correlação')}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <i className="fas fa-sync fa-spin"></i> CORRELAÇÃO
                  </button>
                  <button
                    type="button"
                    className={`db-btn ${formStatus === 'encerrado' ? 'danger' : 'secondary'}`}
                    onClick={() => setFormStatus('encerrado')}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: formStatus === 'encerrado' ? '#ef4444' : undefined, color: formStatus === 'encerrado' ? '#fff' : undefined }}
                  >
                    <i className="fas fa-lock"></i> ENCERRADO
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Número do TA *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: TA-2026-0001" 
                    value={formNumeroTa}
                    onChange={(e) => setFormNumeroTa(e.target.value)}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Técnico de N1 TX <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 'normal' }}>(Opcional)</span></label>
                  <input 
                    type="text" 
                    placeholder="Nome do técnico de N1 TX" 
                    value={formTecnicoN1Tx}
                    onChange={(e) => setFormTecnicoN1Tx(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Nome Suporte <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 'normal' }}>(Opcional)</span></label>
                  <input 
                    type="text" 
                    placeholder="Nome do analista de suporte" 
                    value={formSuporteAtendente}
                    onChange={(e) => setFormSuporteAtendente(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Data Início Atendimento *</label>
                  <input 
                    type="date" 
                    value={formDataInicio}
                    onChange={(e) => setFormDataInicio(e.target.value)}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Hora Início Atendimento *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: 14:30"
                    value={formHoraInicio}
                    onChange={(e) => setFormHoraInicio(e.target.value)}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Hora que foi Acionado *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: 14:00"
                    value={formHoraAcionado}
                    onChange={(e) => setFormHoraAcionado(e.target.value)}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '15px', padding: '15px', background: 'rgba(var(--accent-rgb), 0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%' }}>
                  <input 
                    type="checkbox" 
                    id="formSobressalente"
                    checked={formSobressalenteNecessario}
                    onChange={(e) => {
                      setFormSobressalenteNecessario(e.target.checked);
                      if (!e.target.checked) setFormNumeroChamadoSobressalente('');
                    }}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="formSobressalente" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--fg)', cursor: 'pointer' }}>
                    Foi necessário sobressalente?
                  </label>
                </div>

                {formSobressalenteNecessario && (
                  <div className="form-group animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Nº Chamado Sobressalente <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 'normal' }}>(Opcional)</span></label>
                    <input 
                      type="text" 
                      placeholder="Número do chamado do spare-part (opcional)" 
                      value={formNumeroChamadoSobressalente}
                      onChange={(e) => setFormNumeroChamadoSobressalente(e.target.value)}
                      style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
                    />
                  </div>
                )}
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Definições do Atendimento *</label>
                <textarea 
                  rows={3}
                  placeholder="Descreva as definições, escopo, topologia ou detalhes iniciais do chamado..." 
                  value={formDefinicoes}
                  onChange={(e) => setFormDefinicoes(e.target.value)}
                  required
                  style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Resolução da Falha <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 'normal' }}>(Opcional)</span></label>
                <textarea 
                  rows={3}
                  placeholder="Descreva as ações tomadas e a resolução do problema (pode preencher depois)" 
                  value={formResolucaoFalha}
                  onChange={(e) => setFormResolucaoFalha(e.target.value)}
                  style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
                <button type="button" className="db-btn secondary" onClick={() => setIsFormModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="db-btn primary">
                  <i className="fas fa-save"></i> Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Detalhes do TA */}
      {isDetailModalOpen && viewingRecord && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' }}>
          <div className="modal-content large" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '650px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setIsDetailModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '2px solid var(--border)', paddingBottom: '15px', marginBottom: '20px' }}>
              <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: 'rgba(var(--accent-rgb), 0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--accent)', fontSize: '20px' }}>
                <i className="fas fa-file-signature"></i>
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--fg)', margin: 0 }}>Termo de Atendimento (TA)</h3>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{viewingRecord.numeroTa}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Técnico de N1 TX</span>
                <strong style={{ fontSize: '14px', color: 'var(--fg)' }}>{viewingRecord.tecnicoN1Tx || 'Não informado'}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Nome Suporte</span>
                <strong style={{ fontSize: '14px', color: 'var(--fg)' }}>{viewingRecord.suporteAtendente || 'Não informado'}</strong>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Necessidade de Sobressalente</span>
                <strong style={{ 
                  fontSize: '14px', 
                  color: viewingRecord.sobressalenteNecessario ? 'var(--warning)' : 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <i className={viewingRecord.sobressalenteNecessario ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'}></i>
                  {viewingRecord.sobressalenteNecessario ? 'Sim, necessário' : 'Não, desnecessário'}
                </strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Data e Hora de Início</span>
                <span style={{ fontSize: '14px', color: 'var(--fg)', fontWeight: 600 }}>
                  {new Date(viewingRecord.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} às {viewingRecord.horaInicio}
                </span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Hora de Acionamento</span>
                <span style={{ fontSize: '14px', color: 'var(--fg)', fontWeight: 600 }}>{viewingRecord.horaAcionado}</span>
              </div>
              {viewingRecord.sobressalenteNecessario && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Nº Chamado Sobressalente</span>
                  <span style={{ fontSize: '14px', color: 'var(--fg)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {viewingRecord.numeroChamadoSobressalente || 'Não informado'}
                    {(!viewingRecord.numeroChamadoSobressalente || !viewingRecord.numeroChamadoSobressalente.trim()) && (
                      <span className="animate-pulse" style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fas fa-exclamation-triangle"></i>
                        Pendente
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div className="client-card-history-block" style={{ borderLeftColor: 'var(--accent)', margin: 0 }}>
                <div className="history-block-title">
                  <i className="fas fa-align-left"></i> Definições do Caso
                </div>
                <div className="history-block-content">
                  {viewingRecord.definicoes}
                </div>
              </div>

              <div className="client-card-history-block" style={{ borderLeftColor: 'var(--success)', margin: 0 }}>
                <div className="history-block-title">
                  <i className="fas fa-check-circle"></i> Resolução da Falha
                </div>
                <div className="history-block-content">
                  {viewingRecord.resolucaoFalha}
                </div>
              </div>
            </div>

            {viewingRecord.historicoEdicoes && viewingRecord.historicoEdicoes.length > 0 && (
              <div style={{ 
                marginBottom: '15px', 
                padding: '12px', 
                background: 'rgba(245, 158, 11, 0.04)', 
                border: '1px dashed rgba(245, 158, 11, 0.3)', 
                borderRadius: '10px' 
              }}>
                <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '6px' }}>
                  <i className="fas fa-history"></i> Histórico de Reaberturas / Edições (Auditoria)
                </span>
                <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '12px', color: 'var(--fg)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {viewingRecord.historicoEdicoes.map((log, idx) => (
                    <li key={idx} style={{ fontStyle: 'italic' }}>{log}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
              <span>Criado em: {new Date(viewingRecord.dataCriacao).toLocaleString('pt-BR')}</span>
              <span>Última atualização: {new Date(viewingRecord.ultimaAtualizacao).toLocaleString('pt-BR')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="db-btn secondary" onClick={() => setIsDetailModalOpen(false)}>
                Fechar Detalhes
              </button>
              <button className="db-btn" onClick={() => { setIsDetailModalOpen(false); handleGerarRelatorioTa(viewingRecord); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                <i className="fas fa-stamp"></i> Gerar Carimbo TA
              </button>
              <button className="db-btn" onClick={() => { setIsDetailModalOpen(false); handleEditClick(viewingRecord); }}>
                <i className="fas fa-edit"></i> Editar
              </button>
              <button className="db-btn danger" onClick={() => handleDeleteRecord(viewingRecord.id)}>
                <i className="fas fa-trash"></i> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Backup / Restauração */}
      {isBackupModalOpen && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' }}>
          <div className="modal-content large" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '550px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setIsBackupModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-save"></i> Backup e Restauração de TAs
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
              Exporte seus registros atuais de TA para segurança ou importe um arquivo JSON previamente gerado para atualizar o banco na nuvem e local.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <button className="db-btn" onClick={handleExportBackup} style={{ height: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                <i className="fas fa-file-download" style={{ fontSize: '18px' }}></i> Exportar JSON
              </button>
              <label className="db-btn secondary" style={{ height: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                <i className="fas fa-file-upload" style={{ fontSize: '18px' }}></i> Carregar Arquivo
                <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>Conteúdo do Backup (JSON)</label>
              <textarea 
                rows={5}
                placeholder="Cole o JSON de backup aqui ou use a opção de carregar arquivo acima..." 
                value={backupFileContent}
                onChange={(e) => setBackupFileContent(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'monospace', fontSize: '11px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
              <button className="db-btn secondary" onClick={() => setIsBackupModalOpen(false)}>
                Fechar
              </button>
              <button className="db-btn primary" onClick={handleImportBackup} disabled={!backupFileContent.trim()}>
                <i className="fas fa-upload"></i> Importar e Restaurar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Relatório / Carimbo do TA */}
      {isReportModalOpen && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' }}>
          <div className="modal-content large" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '600px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setIsReportModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-stamp"></i> Carimbo do Termo de Atendimento (TA)
            </h3>
            
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
              Copie o relatório formatado em texto abaixo ou faça o download como arquivo PDF.
            </p>

            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <textarea 
                readOnly
                rows={12}
                value={generatedReportText}
                style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
              <button className="db-btn secondary" onClick={() => setIsReportModalOpen(false)}>
                Fechar
              </button>
              <button className="db-btn" onClick={handleCopiarRelatorio} style={{ background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-copy"></i> Copiar Texto
              </button>
              <button className="db-btn primary" onClick={() => handleExportarRelatorioPDF(viewingRecord?.numeroTa || 'TA')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-file-pdf"></i> Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal for closed ('encerrado') records */}
      {isPasswordModalOpen && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '15px' }}>
          <div className="modal-content" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '400px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setIsPasswordModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-key"></i> Autorização Requerida
            </h3>
            
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '15px' }}>
              Este registro de TA está <strong>ENCERRADO</strong>. Para poder editá-lo, por favor insira a senha secreta de confirmação.
            </p>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <input 
                type="password" 
                placeholder="Senha secreta..." 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVerifyPassword();
                  }
                }}
                style={{ padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)', textAlign: 'center', fontSize: '16px', letterSpacing: '2px' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="db-btn secondary" onClick={() => setIsPasswordModalOpen(false)}>
                Cancelar
              </button>
              <button className="db-btn danger" onClick={handleVerifyPassword} style={{ background: '#ef4444', color: '#fff', border: 'none' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal: Encerramento sem Resolução da Falha */}
      {showResolucaoWarningModal && (
        <div className="modal" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10001, padding: '15px' }}>
          <div className="modal-content" style={{ background: 'var(--card)', borderRadius: '15px', padding: '25px', maxWidth: '450px', width: '100%', position: 'relative', animation: 'scaleUp 0.3s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '2px solid var(--border)' }}>
            <span className="close" onClick={() => setShowResolucaoWarningModal(false)} style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '24px', cursor: 'pointer', color: 'var(--muted)' }}>&times;</span>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-exclamation-triangle"></i> Atenção: Resolução Pendente
            </h3>
            
            <p style={{ fontSize: '14px', color: 'var(--fg)', lineHeight: '1.5', marginBottom: '20px' }}>
              Você está tentando alterar o status deste TA para <strong>ENCERRADO</strong>, mas o campo de <strong>Resolução da Falha</strong> está vazio. 
              <br /><br />
              Deseja realmente prosseguir com o encerramento sem descrever as ações de resolução?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="db-btn secondary" onClick={() => setShowResolucaoWarningModal(false)}>
                Voltar e Preencher
              </button>
              <button className="db-btn" onClick={() => { setShowResolucaoWarningModal(false); executeSave(); }} style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>
                Sim, Encerrar Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
