import React, { useState, useEffect } from 'react';

interface NsapTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function NsapTab({ showToast }: NsapTabProps) {
  const [nsapInput, setNsapInput] = useState('39076F800000000000000300E10007720F61541D');
  const [nsapError, setNsapError] = useState('');
  const [len, setLen] = useState(0);

  const [afi, setAfi] = useState('–');
  const [idi, setIdi] = useState('–');
  const [ver, setVer] = useState('–');
  const [auth, setAuth] = useState('–');
  const [res, setRes] = useState('–');
  const [dom, setDom] = useState('–');
  const [area, setArea] = useState('–');
  const [sys, setSys] = useState('–');
  const [sel, setSel] = useState('–');

  const normalize = (s: string) => {
    return (s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  };

  const isHex = (s: string) => {
    return /^[0-9A-F]*$/.test(s);
  };

  const clearOutputs = () => {
    setAfi('–');
    setIdi('–');
    setVer('–');
    setAuth('–');
    setRes('–');
    setDom('–');
    setArea('–');
    setSys('–');
    setSel('–');
    setNsapError('');
  };

  const parseNsap = (val: string) => {
    clearOutputs();
    const s = normalize(val);
    setLen(s.length);

    if (!s) {
      setNsapError('Cole a string NSAP (40 caracteres hexadecimais).');
      return;
    }

    if (!isHex(s)) {
      setNsapError('Somente caracteres hexadecimais (0-9, A-F).');
      return;
    }

    if (s.length !== 40) {
      setNsapError(`A string precisa ter 40 hex. Você forneceu ${s.length}.`);
      return;
    }

    setAfi(s.slice(0, 2));
    setIdi(s.slice(2, 6));
    setVer(s.slice(6, 8));
    setAuth(s.slice(8, 14));
    setRes(s.slice(14, 18));
    setDom(s.slice(18, 22));
    setArea(s.slice(22, 26));
    setSys(s.slice(26, 38));
    setSel(s.slice(38, 40));

    showToast('NSAP analisado com sucesso!', 'success');
  };

  useEffect(() => {
    const norm = normalize(nsapInput);
    setLen(norm.length);
    if (norm.length === 40) {
      parseNsap(nsapInput);
    } else {
      clearOutputs();
      if (norm.length > 0) {
        setNsapError(`A string precisa ter 40 hex. Você forneceu ${norm.length}.`);
      }
    }
  }, [nsapInput]);

  const handleManualParse = () => {
    parseNsap(nsapInput);
  };

  const handleClear = () => {
    setNsapInput('');
    setLen(0);
    clearOutputs();
  };

  const handleCopyField = (fieldName: string, value: string) => {
    if (value === '–') return;
    navigator.clipboard.writeText(value)
      .then(() => showToast(`${fieldName.toUpperCase()} copiado!`, 'success'))
      .catch(() => showToast('Erro ao copiar.', 'error'));
  };

  const handleCopyAll = () => {
    if (afi === '–') {
      showToast('Nenhum dado decodificado para copiar.', 'error');
      return;
    }

    const fullText = `AFI: ${afi}
IDI: ${idi}
VER: ${ver}
AUTH: ${auth}
RES: ${res}
DOM: ${dom}
Area Address: ${area}
System ID: ${sys}
NSAP Selector: ${sel}`;

    navigator.clipboard.writeText(fullText)
      .then(() => showToast('Todos os campos copiados!', 'success'))
      .catch(() => showToast('Erro ao copiar.', 'error'));
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <div className="nsap-container">
        <div className="nsap-header">
          <i className="fas fa-code-branch"></i>
          <h2>Separador de NSAP (formato Q3 da tela "NE Settings")</h2>
        </div>

        <div className="nsap-main">
          <section className="nsap-panel">
            <label className="nsap-label" htmlFor="nsapInput">
              <i className="fas fa-paste"></i> Cole aqui a string NSAP (40 hex):
            </label>
            <input
              className="nsap-input"
              id="nsapInput"
              type="text"
              value={nsapInput}
              onChange={(e) => setNsapInput(e.target.value)}
              placeholder="Ex.: 39076F800000000000000300E10007720F61541D"
              autoComplete="off"
            />
            <div className="nsap-actions">
              <button className="nsap-btn primary" onClick={handleManualParse}>
                <i className="fas fa-cut"></i> Separar
              </button>
              <button className="nsap-btn" onClick={handleClear}>
                <i className="fas fa-eraser"></i> Limpar
              </button>
              <button className="nsap-btn" onClick={handleCopyAll}>
                <i className="fas fa-copy"></i> Copiar Tudo
              </button>
              <span className="nsap-pill">
                <i className="fas fa-ruler"></i> Comprimento: <span id="len">{len}</span>/40
              </span>
            </div>
            
            {nsapError && (
              <div className="nsap-error" style={{ display: 'flex' }}>
                <i className="fas fa-exclamation-circle"></i> {nsapError}
              </div>
            )}

            <p className="nsap-muted">
              <i className="fas fa-info-circle"></i> Estrutura: <br />
              <span className="nsap-mono">AFI(2) | IDI(4) | VER(2) | AUTH(6) | RES(4) | DOM(4) | Area(4) | SystemID(12) | NSAP Selector(2)</span>
            </p>
          </section>

          <section className="nsap-panel" aria-live="polite">
            <div className="nsap-row">
              <div className="nsap-key">AFI</div>
              <div className="nsap-value">
                {afi}
                {afi !== '–' && <button className="copy-btn" onClick={() => handleCopyField('afi', afi)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">IDI</div>
              <div className="nsap-value">
                {idi}
                {idi !== '–' && <button className="copy-btn" onClick={() => handleCopyField('idi', idi)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">VER</div>
              <div className="nsap-value">
                {ver}
                {ver !== '–' && <button className="copy-btn" onClick={() => handleCopyField('ver', ver)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">AUTH</div>
              <div className="nsap-value">
                {auth}
                {auth !== '–' && <button className="copy-btn" onClick={() => handleCopyField('auth', auth)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">RES</div>
              <div className="nsap-value">
                {res}
                {res !== '–' && <button className="copy-btn" onClick={() => handleCopyField('res', res)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">DOM</div>
              <div className="nsap-value">
                {dom}
                {dom !== '–' && <button className="copy-btn" onClick={() => handleCopyField('dom', dom)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">Area Address</div>
              <div className="nsap-value">
                {area}
                {area !== '–' && <button className="copy-btn" onClick={() => handleCopyField('area address', area)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">System ID</div>
              <div className="nsap-value">
                {sys}
                {sys !== '–' && <button className="copy-btn" onClick={() => handleCopyField('system id', sys)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
            <div className="nsap-row">
              <div className="nsap-key">NSAP Selector</div>
              <div className="nsap-value">
                {sel}
                {sel !== '–' && <button className="copy-btn" onClick={() => handleCopyField('nsap selector', sel)} style={{ display: 'inline-block' }}>Copiar</button>}
              </div>
            </div>
          </section>
        </div>

        <div className="nsap-footer">
          <i className="fas fa-lightbulb"></i> Dica: a string pode ser colada com espaços ou hífens; o sistema normaliza automaticamente.
        </div>
      </div>
    </div>
  );
}
