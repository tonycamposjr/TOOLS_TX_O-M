import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';

interface CarimboTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function CarimboTab({ showToast }: CarimboTabProps) {
  // Carimbo Form States
  const [tecnico, setTecnico] = useState('');
  const [rotaCabo, setRotaCabo] = useState('');
  const [numeroCabo, setNumeroCabo] = useState('');
  const [fibrasPrioritarias, setFibrasPrioritarias] = useState('');
  const [capacidadeCabo, setCapacidadeCabo] = useState('');
  const [fila, setFila] = useState('');
  const [bastidor, setBastidor] = useState('');
  const [bandeja, setBandeja] = useState('');
  const [medicaoCentralCliente, setMedicaoCentralCliente] = useState('');
  const [medicaoClienteCentral, setMedicaoClienteCentral] = useState('');
  const [distanciaTotal, setDistanciaTotal] = useState('');
  const [houveDeslocamento, setHouveDeslocamento] = useState('Não');
  const [tempoDeslocamento, setTempoDeslocamento] = useState('');
  const [TAouTicket, setTAouTicket] = useState('TA');
  const [numeroTAouTicket, setNumeroTAouTicket] = useState('');
  const [cliente, setCliente] = useState('');
  const [cienteRedeExterna, setCienteRedeExterna] = useState('');

  // Form Validation and Result Generation
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [generatedResult, setGeneratedResult] = useState<{
    date: string;
    time: string;
    content: string;
  } | null>(null);
  const [isCarimboLoading, setIsCarimboLoading] = useState(false);

  // BMP Converter States
  const [convertedImageUrl, setConvertedImageUrl] = useState('');
  const [convertedFileName, setConvertedFileName] = useState('');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(90);
  const [isConversionLoading, setIsConversionLoading] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Recalculates other distance measurements automatically
  const handleDistanceChange = (field: 'cpc' | 'spc' | 'dt', valStr: string) => {
    const val = valStr === '' ? NaN : parseFloat(valStr);

    if (field === 'cpc') {
      setMedicaoCentralCliente(valStr);
      const spcVal = medicaoClienteCentral === '' ? NaN : parseFloat(medicaoClienteCentral);
      const dtVal = distanciaTotal === '' ? NaN : parseFloat(distanciaTotal);

      if (!isNaN(val)) {
        if (!isNaN(spcVal)) {
          setDistanciaTotal((val + spcVal).toFixed(2));
        } else if (!isNaN(dtVal)) {
          setMedicaoClienteCentral(Math.max(0, dtVal - val).toFixed(2));
        }
      }
    } else if (field === 'spc') {
      setMedicaoClienteCentral(valStr);
      const cpcVal = medicaoCentralCliente === '' ? NaN : parseFloat(medicaoCentralCliente);
      const dtVal = distanciaTotal === '' ? NaN : parseFloat(distanciaTotal);

      if (!isNaN(val)) {
        if (!isNaN(cpcVal)) {
          setDistanciaTotal((cpcVal + val).toFixed(2));
        } else if (!isNaN(dtVal)) {
          setMedicaoCentralCliente(Math.max(0, dtVal - val).toFixed(2));
        }
      }
    } else if (field === 'dt') {
      setDistanciaTotal(valStr);
      const cpcVal = medicaoCentralCliente === '' ? NaN : parseFloat(medicaoCentralCliente);
      const spcVal = medicaoClienteCentral === '' ? NaN : parseFloat(medicaoClienteCentral);

      if (!isNaN(val)) {
        if (!isNaN(cpcVal)) {
          setMedicaoClienteCentral(Math.max(0, val - cpcVal).toFixed(2));
        } else if (!isNaN(spcVal)) {
          setMedicaoCentralCliente(Math.max(0, val - spcVal).toFixed(2));
        }
      }
    }
  };

  const handleGerarCarimbo = () => {
    const errors: string[] = [];
    if (!tecnico.trim()) errors.push('tecnico');
    if (!rotaCabo.trim()) errors.push('rotaCabo');
    if (!cliente.trim()) errors.push('cliente');

    setFormErrors(errors);

    if (errors.length > 0) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    setIsCarimboLoading(true);

    setTimeout(() => {
      const now = new Date();
      const dateFormatted = now.toLocaleDateString('pt-BR');
      const timeFormatted = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      let content = `DATA: ${dateFormatted}\n`;
      content += `HORA: ${timeFormatted}\n`;
      content += `TÉCNICO: ${tecnico}\n`;
      content += `ROTA CABO: ${rotaCabo}\n`;
      if (numeroCabo) content += `Nº CABO: ${numeroCabo}\n`;
      if (fibrasPrioritarias) content += `FIBRAS PRIORITÁRIAS: ${fibrasPrioritarias}\n`;
      if (capacidadeCabo) content += `QUANTIDADE DE FIBRAS: ${capacidadeCabo}\n`;
      if (fila) content += `FILA: ${fila}\n`;
      if (bastidor) content += `BASTIDOR: ${bastidor}\n`;
      if (bandeja) content += `BANDEJA: ${bandeja}\n`;
      
      const cpcNum = parseFloat(medicaoCentralCliente);
      const spcNum = parseFloat(medicaoClienteCentral);
      const dtNum = parseFloat(distanciaTotal);

      if (!isNaN(cpcNum)) content += `MEDIÇÃO CENTRAL -> CLIENTE: ${cpcNum.toFixed(2)} m\n`;
      if (!isNaN(spcNum)) content += `MEDIÇÃO CLIENTE -> CENTRAL: ${spcNum.toFixed(2)} m\n`;
      if (!isNaN(dtNum)) content += `DISTÂNCIA TOTAL: ${dtNum.toFixed(2)} m\n`;

      content += `HOUVE DESLOCAMENTO: ${houveDeslocamento}\n`;
      if (tempoDeslocamento) content += `TEMPO DE DESLOCAMENTO: ${tempoDeslocamento}\n`;
      content += `${TAouTicket}: ${numeroTAouTicket || 'N/A'}\n`;
      content += `CLIENTE: ${cliente}\n`;
      if (cienteRedeExterna) content += `CIENTE REDE EXTERNA: ${cienteRedeExterna}\n`;

      setGeneratedResult({
        date: dateFormatted,
        time: timeFormatted,
        content: content,
      });

      setIsCarimboLoading(false);
      showToast('Carimbo gerado com sucesso!', 'success');

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }, 400);
  };

  const handleLimparFormulario = () => {
    if (confirm('Tem certeza que deseja limpar todos os campos?')) {
      setTecnico('');
      setRotaCabo('');
      setNumeroCabo('');
      setFibrasPrioritarias('');
      setCapacidadeCabo('');
      setFila('');
      setBastidor('');
      setBandeja('');
      setMedicaoCentralCliente('');
      setMedicaoClienteCentral('');
      setDistanciaTotal('');
      setHouveDeslocamento('Não');
      setTempoDeslocamento('');
      setTAouTicket('TA');
      setNumeroTAouTicket('');
      setCliente('');
      setCienteRedeExterna('');
      setFormErrors([]);
      setGeneratedResult(null);
      showToast('Formulário limpo com sucesso!', 'success');
    }
  };

  const handleCopiarCarimbo = () => {
    if (!generatedResult) {
      showToast('Nenhum carimbo para copiar. Gere um carimbo primeiro.', 'error');
      return;
    }

    const cleanText = generatedResult.content.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanText)
        .then(() => showToast('Carimbo copiado com sucesso!', 'success'))
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
        showToast('Carimbo copiado com sucesso!', 'success');
      } else {
        showToast('Falha ao copiar. Tente selecionar e copiar manualmente.', 'error');
      }
    } catch (err) {
      showToast('Erro ao copiar.', 'error');
    }
    document.body.removeChild(textarea);
  };

  const handleExportarPDF = () => {
    if (!generatedResult) {
      showToast('Nenhum carimbo para exportar. Gere um carimbo primeiro.', 'error');
      return;
    }

    setIsCarimboLoading(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(0, 122, 255);
        doc.text('CARIMBO DE REDE EXTERNA', 20, 20);

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);

        const lines = generatedResult.content.split('\n');
        let y = 40;

        lines.forEach(line => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, 20, y);
          y += 7;
        });

        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Sistema Unificado de Ferramentas de Rede`, 20, 285);

        const fileDate = generatedResult.date.replace(/\//g, '-');
        doc.save(`Carimbo_Rede_${fileDate}.pdf`);

        setIsCarimboLoading(false);
        showToast('PDF gerado com sucesso!', 'success');
      } catch (err) {
        setIsCarimboLoading(false);
        showToast('Erro ao gerar o PDF.', 'error');
        console.error(err);
      }
    }, 400);
  };

  // Image Conversion Logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImagePreviewUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConvertImage = () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      showToast('Por favor, selecione um arquivo para converter.', 'error');
      return;
    }

    setIsConversionLoading(true);

    const firstFile = files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);

          const mimeType = `image/${outputFormat}`;
          const q = quality / 100;
          const dataUrl = canvas.toDataURL(mimeType, q);

          const newName = firstFile.name.replace(/\.[^/.]+$/, "") + `.${outputFormat}`;
          setConvertedImageUrl(dataUrl);
          setConvertedFileName(newName);

          // Convert any additional files in background and trigger direct downloads
          if (files.length > 1) {
            for (let i = 1; i < files.length; i++) {
              const otherFile = files[i];
              const otherReader = new FileReader();
              otherReader.onload = (oEvent) => {
                const oImg = new Image();
                oImg.onload = () => {
                  const oCanvas = document.createElement('canvas');
                  oCanvas.width = oImg.width;
                  oCanvas.height = oImg.height;
                  const oCtx = oCanvas.getContext('2d');
                  if (oCtx) {
                    oCtx.drawImage(oImg, 0, 0);
                    const oDataUrl = oCanvas.toDataURL(mimeType, q);
                    const oNewName = otherFile.name.replace(/\.[^/.]+$/, "") + `.${outputFormat}`;
                    
                    const link = document.createElement('a');
                    link.href = oDataUrl;
                    link.download = oNewName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                };
                oImg.src = oEvent.target?.result as string;
              };
              otherReader.readAsDataURL(otherFile);
            }
          }

          setIsConversionLoading(false);
          showToast(`${files.length} imagem(ns) convertida(s) com sucesso!`, 'success');
        }
      };
      img.onerror = () => {
        setIsConversionLoading(false);
        showToast('Erro ao ler a imagem. Certifique-se de que é um formato válido.', 'error');
      };
      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(firstFile);
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <h2><i className="fas fa-stamp"></i> CARIMBO DE REDE EXTERNA</h2>

      <form id="carimboForm" onSubmit={(e) => e.preventDefault()}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="tecnico">
              <i className="fas fa-user"></i> Técnico - Nome/TEL: <span className="required">*</span>
            </label>
            <input
              type="text"
              id="tecnico"
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              className={formErrors.includes('tecnico') ? 'invalid' : ''}
              placeholder="João Silva - (11) 99999-9999"
            />
            {formErrors.includes('tecnico') && (
              <div className="error-message" style={{ display: 'flex' }}>
                <i className="fas fa-exclamation-circle"></i> Campo obrigatório
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="rotaCabo">
              <i className="fas fa-route"></i> Rota Completa do Cabo: <span className="required">*</span>
            </label>
            <input
              type="text"
              id="rotaCabo"
              value={rotaCabo}
              onChange={(e) => setRotaCabo(e.target.value)}
              className={formErrors.includes('rotaCabo') ? 'invalid' : ''}
              placeholder="Ex: ARQ_FI_SCL_NJ"
            />
            {formErrors.includes('rotaCabo') && (
              <div className="error-message" style={{ display: 'flex' }}>
                <i className="fas fa-exclamation-circle"></i> Campo obrigatório
              </div>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="numeroCabo">
              <i className="fas fa-hashtag"></i> Número do Cabo:
            </label>
            <input
              type="text"
              id="numeroCabo"
              value={numeroCabo}
              onChange={(e) => setNumeroCabo(e.target.value)}
              placeholder="Ex: CAB-12345"
            />
          </div>

          <div className="form-group">
            <label htmlFor="fibrasPrioritarias">
              <i className="fas fa-fiber"></i> Fibras Prioritárias:
            </label>
            <input
              type="text"
              id="fibrasPrioritarias"
              value={fibrasPrioritarias}
              onChange={(e) => setFibrasPrioritarias(e.target.value)}
              placeholder="Ex: F17, F18"
            />
          </div>

          <div className="form-group">
            <label htmlFor="capacidadeCabo">
              <i className="fas fa-bolt"></i> Quantidade de fibras:
            </label>
            <input
              type="text"
              id="capacidadeCabo"
              value={capacidadeCabo}
              onChange={(e) => setCapacidadeCabo(e.target.value)}
              placeholder="Ex: 144"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="fila">
              <i className="fas fa-layer-group"></i> Fila:
            </label>
            <input
              type="text"
              id="fila"
              value={fila}
              onChange={(e) => setFila(e.target.value)}
              placeholder="Ex: 12"
            />
          </div>

          <div className="form-group">
            <label htmlFor="bastidor">
              <i className="fas fa-server"></i> Bastidor:
            </label>
            <input
              type="text"
              id="bastidor"
              value={bastidor}
              onChange={(e) => setBastidor(e.target.value)}
              placeholder="Ex: BAST-01"
            />
          </div>

          <div className="form-group">
            <label htmlFor="bandeja">
              <i className="fas fa-tray"></i> Bandeja:
            </label>
            <input
              type="text"
              id="bandeja"
              value={bandeja}
              onChange={(e) => setBandeja(e.target.value)}
              placeholder="Ex: BAN-02"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="medicaoCentralCliente">
              <i className="fas fa-ruler"></i> Medição CENTRAL → Cliente (metros):
            </label>
            <input
              type="number"
              id="medicaoCentralCliente"
              value={medicaoCentralCliente}
              onChange={(e) => handleDistanceChange('cpc', e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label htmlFor="medicaoClienteCentral">
              <i className="fas fa-ruler-vertical"></i> Medição Cliente → CENTRAL (metros):
            </label>
            <input
              type="number"
              id="medicaoClienteCentral"
              value={medicaoClienteCentral}
              onChange={(e) => handleDistanceChange('spc', e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label htmlFor="distanciaTotal">
              <i className="fas fa-road"></i> Distância total (metros):
            </label>
            <input
              type="number"
              id="distanciaTotal"
              value={distanciaTotal}
              onChange={(e) => handleDistanceChange('dt', e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
            />
            <div className="calculation-helper">
              <i className="fas fa-lightbulb"></i> Preencha dois campos de medição para calcular o terceiro automaticamente.
            </div>
          </div>
        </div>

        {(!isNaN(parseFloat(medicaoCentralCliente)) && !isNaN(parseFloat(medicaoClienteCentral)) && !isNaN(parseFloat(distanciaTotal)) && Math.abs((parseFloat(medicaoCentralCliente) + parseFloat(medicaoClienteCentral)) - parseFloat(distanciaTotal)) > 0.05) && (
          <div style={{
            background: 'rgba(255, 193, 7, 0.1)',
            borderLeft: '4px solid #ffc107',
            padding: '12px 15px',
            borderRadius: '4px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px'
          }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#ffc107', fontSize: '16px' }}></i>
            <div style={{ flex: 1 }}>
              <strong>Divergência OTDR:</strong> A soma das medições parciais (CENTRAL ➜ Cliente: {parseFloat(medicaoCentralCliente).toFixed(2)}m + Cliente ➜ CENTRAL: {parseFloat(medicaoClienteCentral).toFixed(2)}m = {(parseFloat(medicaoCentralCliente) + parseFloat(medicaoClienteCentral)).toFixed(2)}m) não é igual à Distância Total informada ({parseFloat(distanciaTotal).toFixed(2)}m).
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap', margin: 0, height: 'auto', minHeight: 'auto' }}
              onClick={() => {
                const corrected = (parseFloat(medicaoCentralCliente) + parseFloat(medicaoClienteCentral)).toFixed(2);
                setDistanciaTotal(corrected);
                showToast('Distância total corrigida automaticamente para a soma das parciais!', 'success');
              }}
            >
              Corrigir para {(parseFloat(medicaoCentralCliente) + parseFloat(medicaoClienteCentral)).toFixed(2)} m
            </button>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label><i className="fas fa-car"></i> Houve Deslocamento:</label>
            <div className="radio-group">
              <input
                type="radio"
                id="houveDeslocamentoSim"
                name="houveDeslocamento"
                value="Sim"
                checked={houveDeslocamento === 'Sim'}
                onChange={() => setHouveDeslocamento('Sim')}
              />
              <label className="radio-label" htmlFor="houveDeslocamentoSim">Sim</label>
              <input
                type="radio"
                id="houveDeslocamentoNao"
                name="houveDeslocamento"
                value="Não"
                checked={houveDeslocamento === 'Não'}
                onChange={() => setHouveDeslocamento('Não')}
              />
              <label className="radio-label" htmlFor="houveDeslocamentoNao">Não</label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tempoDeslocamento">
              <i className="fas fa-clock"></i> Tempo de Deslocamento:
            </label>
            <input
              type="text"
              id="tempoDeslocamento"
              value={tempoDeslocamento}
              onChange={(e) => setTempoDeslocamento(e.target.value)}
              placeholder="Ex: 2h 30min"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label><i className="fas fa-ticket-alt"></i> TA ou Ticket:</label>
            <div className="radio-group">
              <input
                type="radio"
                id="TA"
                name="TAouTicket"
                value="TA"
                checked={TAouTicket === 'TA'}
                onChange={() => setTAouTicket('TA')}
              />
              <label className="radio-label" htmlFor="TA">TA</label>
              <input
                type="radio"
                id="ticket"
                name="TAouTicket"
                value="Ticket"
                checked={TAouTicket === 'Ticket'}
                onChange={() => setTAouTicket('Ticket')}
              />
              <label className="radio-label" htmlFor="ticket">Ticket</label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="numeroTAouTicket">
              <i className="fas fa-hashtag"></i> Número:
            </label>
            <input
              type="text"
              id="numeroTAouTicket"
              value={numeroTAouTicket}
              onChange={(e) => setNumeroTAouTicket(e.target.value)}
              placeholder="Ex: TA-2023-12345"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="cliente">
              <i className="fas fa-user-tie"></i> Cliente: <span className="required">*</span>
            </label>
            <input
              type="text"
              id="cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className={formErrors.includes('cliente') ? 'invalid' : ''}
              placeholder="Nome do cliente"
            />
            {formErrors.includes('cliente') && (
              <div className="error-message" style={{ display: 'flex' }}>
                <i className="fas fa-exclamation-circle"></i> Campo obrigatório
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="cienteRedeExterna">
              <i className="fas fa-user-check"></i> Ciente Rede Externa:
            </label>
            <input
              type="text"
              id="cienteRedeExterna"
              value={cienteRedeExterna}
              onChange={(e) => setCienteRedeExterna(e.target.value)}
              placeholder="Nome do responsável"
            />
          </div>
        </div>
      </form>

      <div className="btn-container">
        <button type="button" className="btn btn-primary" onClick={handleGerarCarimbo}>
          <i className="fas fa-stamp"></i> Gerar Carimbo
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleLimparFormulario}>
          <i className="fas fa-trash"></i> Limpar
        </button>
        <button type="button" className="btn btn-success" onClick={handleCopiarCarimbo}>
          <i className="fas fa-copy"></i> Copiar
        </button>
        <button type="button" className="btn btn-warning" onClick={handleExportarPDF}>
          <i className="fas fa-file-pdf"></i> Exportar PDF
        </button>
      </div>

      {isCarimboLoading && <div className="loading-spinner" style={{ display: 'block' }}></div>}

      {generatedResult && (
        <div id="resultado" ref={resultRef} style={{ display: 'block' }}>
          <div className="carimbo-preview">
            <h3 style={{ color: 'var(--accent)', textAlign: 'center', marginTop: 0 }}>
              <i className="fas fa-stamp"></i> CARIMBO DE REDE EXTERNA
            </h3>
            <p><strong><i className="far fa-calendar"></i> Data:</strong> {generatedResult.date}</p>
            <p><strong><i className="far fa-clock"></i> Hora:</strong> {generatedResult.time}</p>
            <p><strong><i className="fas fa-user"></i> Técnico - Nome/TEL:</strong> {tecnico}</p>
            <p><strong><i className="fas fa-route"></i> Rota Completa do Cabo:</strong> {rotaCabo}</p>
            {numeroCabo && <p><strong><i className="fas fa-hashtag"></i> Número do Cabo:</strong> {numeroCabo}</p>}
            {fibrasPrioritarias && <p><strong><i className="fas fa-fiber"></i> Fibras Prioritárias:</strong> {fibrasPrioritarias}</p>}
            {capacidadeCabo && <p><strong><i className="fas fa-bolt"></i> Quantidade de fibras:</strong> {capacidadeCabo}</p>}
            {fila && <p><strong><i className="fas fa-layer-group"></i> Fila:</strong> {fila}</p>}
            {bastidor && <p><strong><i className="fas fa-server"></i> Bastidor:</strong> {bastidor}</p>}
            {bandeja && <p><strong><i className="fas fa-tray"></i> Bandeja:</strong> {bandeja}</p>}
            {medicaoCentralCliente && <p><strong><i className="fas fa-ruler"></i> Medição CENTRAL → CLIENTE:</strong> {parseFloat(medicaoCentralCliente).toFixed(2)} metros</p>}
            {medicaoClienteCentral && <p><strong><i className="fas fa-ruler-vertical"></i> Medição CLIENTE → CENTRAL:</strong> {parseFloat(medicaoClienteCentral).toFixed(2)} metros</p>}
            {distanciaTotal && <p><strong><i className="fas fa-road"></i> Distância total entre os pontos:</strong> {parseFloat(distanciaTotal).toFixed(2)} metros</p>}
            <p><strong><i className="fas fa-car"></i> Houve Deslocamento:</strong> {houveDeslocamento}</p>
            {tempoDeslocamento && <p><strong><i className="fas fa-clock"></i> Tempo de Deslocamento:</strong> {tempoDeslocamento}</p>}
            <p><strong><i className="fas fa-ticket-alt"></i> {TAouTicket}:</strong> {numeroTAouTicket || 'N/A'}</p>
            <p><strong><i className="fas fa-user-tie"></i> Cliente:</strong> {cliente}</p>
            {cienteRedeExterna && <p><strong><i className="fas fa-user-check"></i> Ciente Rede Externa:</strong> {cienteRedeExterna}</p>}
          </div>
        </div>
      )}

      {/* BMP Converter */}
      <h2 style={{ marginTop: '50px' }}><i className="fas fa-image"></i> CONVERSOR DE IMAGEM</h2>

      <div className="form-group">
        <label htmlFor="bmpUploader">
          <i className="fas fa-file-upload"></i> Selecione a imagem BMP:
        </label>
        <input
          type="file"
          id="bmpUploader"
          accept=".bmp,image/bmp"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </div>

      <div className="form-group">
        <label><i className="fas fa-cog"></i> Formato de saída:</label>
        <div className="radio-group">
          <input
            type="radio"
            id="formatPng"
            name="outputFormat"
            value="png"
            checked={outputFormat === 'png'}
            onChange={() => setOutputFormat('png')}
          />
          <label className="radio-label" htmlFor="formatPng">PNG</label>
          <input
            type="radio"
            id="formatJpeg"
            name="outputFormat"
            value="jpeg"
            checked={outputFormat === 'jpeg'}
            onChange={() => setOutputFormat('jpeg')}
          />
          <label className="radio-label" htmlFor="formatJpeg">JPEG</label>
          <input
            type="radio"
            id="formatWebp"
            name="outputFormat"
            value="webp"
            checked={outputFormat === 'webp'}
            onChange={() => setOutputFormat('webp')}
          />
          <label className="radio-label" htmlFor="formatWebp">WebP</label>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="quality">
          <i className="fas fa-compress"></i> Qualidade JPEG/WebP (1-100):
        </label>
        <input
          type="range"
          id="quality"
          className="quality-slider"
          min="1"
          max="100"
          value={quality}
          onChange={(e) => setQuality(parseInt(e.target.value))}
        />
        <span>{quality}%</span>
      </div>

      <div className="btn-container">
        <button type="button" className="btn btn-primary" onClick={handleConvertImage}>
          <i className="fas fa-sync-alt"></i> Converter Imagem
        </button>
      </div>

      {imagePreviewUrl && (
        <img
          src={imagePreviewUrl}
          className="image-preview"
          alt="Pré-visualização"
          style={{ display: 'block' }}
        />
      )}

      {isConversionLoading && <div className="loading-spinner" style={{ display: 'block' }}></div>}

      {convertedImageUrl && (
        <div id="conversionResult" style={{ display: 'block' }}>
          <h3 style={{ color: 'var(--accent)', textAlign: 'center', marginTop: 0 }}>
            <i className="fas fa-check-circle"></i> Conversão Concluída!
          </h3>
          <p><strong>Pré-visualização:</strong></p>
          <img
            src={convertedImageUrl}
            alt="Imagem convertida"
            style={{ maxWidth: '100%', borderRadius: '12px', marginBottom: '20px', border: '2px solid var(--border)', padding: '5px' }}
          />
          <p><strong>Arquivo:</strong> {convertedFileName}</p>
          <div className="btn-container">
            <a href={convertedImageUrl} download={convertedFileName} className="btn btn-success">
              <i className="fas fa-download"></i> Baixar {convertedFileName.toUpperCase()}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
