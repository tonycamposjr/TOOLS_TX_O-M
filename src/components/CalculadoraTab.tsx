import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { validateOpticalBudget, calculateOpticalBudget } from '../utils/opticalBudget';

interface CalculadoraTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function CalculadoraTab({ showToast }: CalculadoraTabProps) {
  const [tx, setTx] = useState('-5');
  const [rx, setRx] = useState('-25');
  const [distancia, setDistancia] = useState('40');
  const [perdaFibra, setPerdaFibra] = useState('0.22');
  const [numConectores, setNumConectores] = useState('2');
  const [perdaConector, setPerdaConector] = useState('0.75');
  const [numEmendas, setNumEmendas] = useState('4');
  const [perdaEmenda, setPerdaEmenda] = useState('0.1');
  const [margem, setMargem] = useState('3');
  const [perdaSplitters, setPerdaSplitters] = useState('0');
  const [penalidadeWdm, setPenalidadeWdm] = useState('0');
  const [degradacaoLaser, setDegradacaoLaser] = useState('0');
  const [activePreset, setActivePreset] = useState('default');

  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isCalcLoading, setIsCalcLoading] = useState(false);
  const [calculoResult, setCalculoResult] = useState<{
    orcamentoBruto: number;
    atenuacaoTotal: number;
    perdaTotalFibra: number;
    perdaTotalConectores: number;
    perdaTotalEmendas: number;
    perdaSplitters: number;
    penalidadeWdm: number;
    degradacaoLaser: number;
    orcamentoLiquido: number;
    viable: boolean;
  } | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  // Load saved config on mount
  useEffect(() => {
    const saved = localStorage.getItem('calcConfig');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.tx !== undefined) setTx(config.tx);
        if (config.rx !== undefined) setRx(config.rx);
        if (config.distancia !== undefined) setDistancia(config.distancia);
        if (config.perdaFibra !== undefined) setPerdaFibra(config.perdaFibra);
        if (config.numConectores !== undefined) setNumConectores(config.numConectores);
        if (config.perdaConector !== undefined) setPerdaConector(config.perdaConector);
        if (config.numEmendas !== undefined) setNumEmendas(config.numEmendas);
        if (config.perdaEmenda !== undefined) setPerdaEmenda(config.perdaEmenda);
        if (config.margem !== undefined) setMargem(config.margem);
        if (config.perdaSplitters !== undefined) setPerdaSplitters(config.perdaSplitters);
        if (config.penalidadeWdm !== undefined) setPenalidadeWdm(config.penalidadeWdm);
        if (config.degradacaoLaser !== undefined) setDegradacaoLaser(config.degradacaoLaser);
      } catch (err) {
        console.error('Error parsing calcConfig', err);
      }
    }
  }, []);

  const presets: Record<string, Record<string, string>> = {
    'default': { tx: '-5', rx: '-25', distancia: '40', perdaFibra: '0.22', numConectores: '2', perdaConector: '0.75', numEmendas: '4', perdaEmenda: '0.1', margem: '3', perdaSplitters: '0', penalidadeWdm: '0', degradacaoLaser: '0' },
    '1310nm': { tx: '-3', rx: '-23', distancia: '25', perdaFibra: '0.35', numConectores: '2', perdaConector: '0.75', numEmendas: '2', perdaEmenda: '0.1', margem: '3', perdaSplitters: '0', penalidadeWdm: '0', degradacaoLaser: '0' },
    '1550nm': { tx: '0', rx: '-28', distancia: '80', perdaFibra: '0.22', numConectores: '4', perdaConector: '0.5', numEmendas: '8', perdaEmenda: '0.05', margem: '4', perdaSplitters: '0', penalidadeWdm: '0', degradacaoLaser: '0' },
    'long-haul': { tx: '3', rx: '-30', distancia: '120', perdaFibra: '0.18', numConectores: '6', perdaConector: '0.3', numEmendas: '12', perdaEmenda: '0.05', margem: '5', perdaSplitters: '0', penalidadeWdm: '0', degradacaoLaser: '0' },
    'short-haul': { tx: '-7', rx: '-20', distancia: '10', perdaFibra: '0.35', numConectores: '2', perdaConector: '1.0', numEmendas: '0', perdaEmenda: '0', margem: '2', perdaSplitters: '0', penalidadeWdm: '0', degradacaoLaser: '0' }
  };

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    const config = presets[presetKey];
    if (config) {
      setTx(config.tx);
      setRx(config.rx);
      setDistancia(config.distancia);
      setPerdaFibra(config.perdaFibra);
      setNumConectores(config.numConectores);
      setPerdaConector(config.perdaConector);
      setNumEmendas(config.numEmendas);
      setPerdaEmenda(config.perdaEmenda);
      setMargem(config.margem);
      setPerdaSplitters(config.perdaSplitters || '0');
      setPenalidadeWdm(config.penalidadeWdm || '0');
      setDegradacaoLaser(config.degradacaoLaser || '0');
      
      const ptNames: Record<string, string> = {
        'default': 'Padrão',
        '1310nm': 'Fibra 1310nm',
        '1550nm': 'Fibra 1550nm',
        'long-haul': 'Longa Distância',
        'short-haul': 'Curta Distância'
      };
      showToast(`Preset "${ptNames[presetKey] || presetKey}" aplicado!`, 'success');
    }
  };

  const handleCalcularEnlace = () => {
    const txVal = parseFloat(tx);
    const rxVal = parseFloat(rx);
    const distVal = parseFloat(distancia);
    const perdaFibraVal = parseFloat(perdaFibra);
    const numConectoresVal = parseInt(numConectores, 10);
    const perdaConectorVal = parseFloat(perdaConector);
    const numEmendasVal = parseInt(numEmendas, 10);
    const perdaEmendaVal = parseFloat(perdaEmenda);
    const margemVal = parseFloat(margem);
    
    const perdaSplittersVal = parseFloat(perdaSplitters);
    const penalidadeWdmVal = parseFloat(penalidadeWdm);
    const degradacaoLaserVal = parseFloat(degradacaoLaser);

    const params = {
      tx: txVal,
      rx: rxVal,
      distancia: distVal,
      perdaFibra: perdaFibraVal,
      numConectores: numConectoresVal,
      perdaConector: perdaConectorVal,
      numEmendas: numEmendasVal,
      perdaEmenda: perdaEmendaVal,
      margem: margemVal,
      perdaSplitters: perdaSplittersVal,
      penalidadeWdm: penalidadeWdmVal,
      degradacaoLaser: degradacaoLaserVal
    };

    const errors = validateOpticalBudget(params);
    setFormErrors(errors);

    if (errors.length > 0) {
      if (txVal <= rxVal) {
        showToast('Potência Tx deve ser maior que a Sensibilidade Rx.', 'error');
      } else if (rxVal > 0) {
        showToast('A Sensibilidade Rx deve ser um valor negativo (ex: -25 dBm).', 'error');
      } else {
        showToast('Verifique os campos destacados. Valores devem ser válidos.', 'error');
      }
      return;
    }

    setIsCalcLoading(true);

    setTimeout(() => {
      const result = calculateOpticalBudget(params);
      setCalculoResult(result);

      setIsCalcLoading(false);
      showToast('Cálculo realizado com sucesso!', 'success');

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }, 400);
  };

  const handleSalvarConfig = () => {
    const config = {
      tx, rx, distancia, perdaFibra, numConectores, perdaConector, numEmendas, perdaEmenda, margem,
      perdaSplitters, penalidadeWdm, degradacaoLaser
    };
    localStorage.setItem('calcConfig', JSON.stringify(config));
    showToast('Configuração salva com sucesso!', 'success');
  };

  const handleGerarRelatorio = () => {
    if (!calculoResult) {
      showToast('Calcule o enlace primeiro para gerar o relatório.', 'error');
      return;
    }

    setIsCalcLoading(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(0, 122, 255);
        doc.text('Relatório de Cálculo de Enlace Óptico', 20, 20);

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);

        let y = 40;
        doc.text(`Potência de Transmissão (Tx): ${tx} dBm`, 20, y); y += 7;
        doc.text(`Sensibilidade do Receptor (Rx): ${rx} dBm (limiar de recepção)`, 20, y); y += 7;
        doc.text(`Distância: ${distancia} km`, 20, y); y += 7;
        doc.text(`Atenuação da Fibra: ${perdaFibra} dB/km`, 20, y); y += 15;

        doc.setFontSize(14);
        doc.text('Resultados do Orçamento Óptico (Link Budget)', 20, y); y += 10;
        doc.setFontSize(10);

        doc.text(`Orçamento Óptico Bruto (Link Budget): ${calculoResult.orcamentoBruto.toFixed(2)} dB`, 20, y); y += 7;
        doc.text(`Atenuação Total Estimada: ${calculoResult.atenuacaoTotal.toFixed(2)} dB`, 20, y); y += 7;
        doc.text(`  - Perda na Fibra (${distancia} km): ${calculoResult.perdaTotalFibra.toFixed(2)} dB`, 25, y); y += 7;
        doc.text(`  - Perda nos Conectores (${numConectores} un.): ${calculoResult.perdaTotalConectores.toFixed(2)} dB`, 25, y); y += 7;
        doc.text(`  - Perda nas Emendas (${numEmendas} un.): ${calculoResult.perdaTotalEmendas.toFixed(2)} dB`, 25, y); y += 7;
        if (calculoResult.perdaSplitters > 0) {
          doc.text(`  - Perda nos Splitters: ${calculoResult.perdaSplitters.toFixed(2)} dB`, 25, y); y += 7;
        }
        if (calculoResult.penalidadeWdm > 0) {
          doc.text(`  - Penalidade WDM: ${calculoResult.penalidadeWdm.toFixed(2)} dB`, 25, y); y += 7;
        }
        if (calculoResult.degradacaoLaser > 0) {
          doc.text(`  - Margem de Degradação do Laser: ${calculoResult.degradacaoLaser.toFixed(2)} dB`, 25, y); y += 7;
        }
        doc.text(`Margem de Segurança Configurada: ${margem} dB`, 20, y); y += 7;
        doc.text(`Margem Efetiva Restante: ${(calculoResult.orcamentoLiquido + parseFloat(margem)).toFixed(2)} dB`, 20, y); y += 10;

        doc.setFontSize(12);
        doc.text(`Margem Disponível (Sobra Líquida): ${calculoResult.orcamentoLiquido.toFixed(2)} dB`, 20, y); y += 10;

        const statusStr = calculoResult.viable ? 'ENLACE VIÁVEL' : 'ENLACE INVIÁVEL';
        doc.text(`Status: ${statusStr}`, 20, y);

        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Sistema Unificado de Ferramentas de Rede`, 20, 285);

        const dataFile = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        doc.save(`Relatorio_Optico_${dataFile}.pdf`);

        setIsCalcLoading(false);
        showToast('Relatório PDF gerado com sucesso!', 'success');
      } catch (err) {
        setIsCalcLoading(false);
        showToast('Erro ao exportar PDF.', 'error');
        console.error(err);
      }
    }, 400);
  };

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <h2><i className="fas fa-calculator"></i> Calculadora Avançada de Enlace Óptico</h2>

      {/* Preset Selector */}
      <div className="preset-selector">
        <button
          className={`preset-btn ${activePreset === 'default' ? 'active' : ''}`}
          onClick={() => applyPreset('default')}
        >
          Padrão
        </button>
        <button
          className={`preset-btn ${activePreset === '1310nm' ? 'active' : ''}`}
          onClick={() => applyPreset('1310nm')}
        >
          Fibra 1310nm
        </button>
        <button
          className={`preset-btn ${activePreset === '1550nm' ? 'active' : ''}`}
          onClick={() => applyPreset('1550nm')}
        >
          Fibra 1550nm
        </button>
        <button
          className={`preset-btn ${activePreset === 'long-haul' ? 'active' : ''}`}
          onClick={() => applyPreset('long-haul')}
        >
          Longa Distância
        </button>
        <button
          className={`preset-btn ${activePreset === 'short-haul' ? 'active' : ''}`}
          onClick={() => applyPreset('short-haul')}
        >
          Curta Distância
        </button>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label htmlFor="tx">
            <i className="fas fa-broadcast-tower"></i> Potência de Transmissão (Tx) [dBm]
            <span className="tooltip-icon">?<span className="tooltip-text">Potência do sinal na saída do transmissor. Fornecida pelo fabricante do módulo (SFP, GBIC). Valores típicos: -5 a +3 dBm.</span></span>
          </label>
          <input
            type="number"
            id="tx"
            value={tx}
            onChange={(e) => setTx(e.target.value)}
            step="0.01"
            className={formErrors.includes('tx') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="rx">
            <i className="fas fa-satellite-dish"></i> Sensibilidade do Receptor (Rx) [dBm]
            <span className="tooltip-icon">?<span className="tooltip-text">Mínima potência de sinal que o receptor consegue detectar. Valor negativo em dBm (ex: -28). Valores típicos: -18 a -28 dBm.</span></span>
          </label>
          <input
            type="number"
            id="rx"
            value={rx}
            onChange={(e) => setRx(e.target.value)}
            step="0.01"
            placeholder="Valor negativo (ex: -28)"
            className={formErrors.includes('rx') ? 'invalid' : ''}
          />
          <small className="help-text" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>Ex: -25 ou -28 (sempre negativo)</small>
        </div>

        <div className="input-group">
          <label htmlFor="distancia">
            <i className="fas fa-road"></i> Distância do Enlace [km]
            <span className="tooltip-icon">?<span className="tooltip-text">Comprimento total do cabo de fibra óptica entre o transmissor e o receptor. Inclua todos os segmentos.</span></span>
          </label>
          <input
            type="number"
            id="distancia"
            value={distancia}
            onChange={(e) => setDistancia(e.target.value)}
            step="0.1"
            min="0"
            className={formErrors.includes('distancia') ? 'invalid' : ''}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label htmlFor="perdaFibra">
            <i className="fas fa-wave-square"></i> Atenuação da Fibra [dB/km]
            <span className="tooltip-icon">?<span className="tooltip-text">Perda de sinal por quilômetro na fibra. 0.35 dB/km para 1310nm ou 0.22 dB/km para 1550nm são valores típicos.</span></span>
          </label>
          <input
            type="number"
            id="perdaFibra"
            value={perdaFibra}
            onChange={(e) => setPerdaFibra(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('perdaFibra') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="numConectores">
            <i className="fas fa-plug"></i> Número de Conectores (Mínimo 2)
            <span className="tooltip-icon">?<span className="tooltip-text">Total de acopladores ópticos no caminho (ex: nos DIOs). Mínimo de 2 (um em cada ponta). Deve ser um número inteiro.</span></span>
          </label>
          <input
            type="number"
            id="numConectores"
            value={numConectores}
            onChange={(e) => setNumConectores(e.target.value)}
            step="1"
            min="2"
            className={formErrors.includes('numConectores') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="perdaConector">
            <i className="fas fa-plug"></i> Perda por Conector [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Perda de sinal em cada conector. Um valor típico e seguro é 0.75 dB. Para conectores APC pode ser menor.</span></span>
          </label>
          <input
            type="number"
            id="perdaConector"
            value={perdaConector}
            onChange={(e) => setPerdaConector(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('perdaConector') ? 'invalid' : ''}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label htmlFor="numEmendas">
            <i className="fas fa-link"></i> Número de Emendas
            <span className="tooltip-icon">?<span className="tooltip-text">Total de fusões (emendas) ao longo do cabo. Deve ser um número inteiro.</span></span>
          </label>
          <input
            type="number"
            id="numEmendas"
            value={numEmendas}
            onChange={(e) => setNumEmendas(e.target.value)}
            step="1"
            min="0"
            className={formErrors.includes('numEmendas') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="perdaEmenda">
            <i className="fas fa-link"></i> Perda por Emenda [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Perda de sinal em cada fusão. Um valor típico é 0.1 dB para emendas bem feitas.</span></span>
          </label>
          <input
            type="number"
            id="perdaEmenda"
            value={perdaEmenda}
            onChange={(e) => setPerdaEmenda(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('perdaEmenda') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="margem">
            <i className="fas fa-shield-alt"></i> Margem de Segurança [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Valor de segurança para cobrir degradação do laser, reparos futuros e outras perdas não previstas. Recomenda-se no mínimo 3 dB.</span></span>
          </label>
          <input
            type="number"
            id="margem"
            value={margem}
            onChange={(e) => setMargem(e.target.value)}
            step="0.1"
            min="0"
            className={formErrors.includes('margem') ? 'invalid' : ''}
          />
        </div>
      </div>

      {/* Advanced section with splitters, penalidade WDM, degradação do laser */}
      <div style={{ marginTop: '20px', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="fas fa-sliders-h"></i> Parâmetros Avançados (Opcionais)
      </div>
      <div className="form-row">
        <div className="input-group">
          <label htmlFor="perdaSplitters">
            <i className="fas fa-sitemap"></i> Atenuação de Splitters [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Perda por divisores ópticos (splitters). Ex: 3.5 dB para 1:2, 7.2 dB para 1:4, 10.5 dB para 1:8, 14 dB para 1:16, 17 dB para 1:32.</span></span>
          </label>
          <input
            type="number"
            id="perdaSplitters"
            value={perdaSplitters}
            onChange={(e) => setPerdaSplitters(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('perdaSplitters') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="penalidadeWdm">
            <i className="fas fa-compress-arrows-alt"></i> Penalidade WDM [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Perda induzida por acopladores ou multiplexadores WDM. Típico: 0.5 a 1.5 dB.</span></span>
          </label>
          <input
            type="number"
            id="penalidadeWdm"
            value={penalidadeWdm}
            onChange={(e) => setPenalidadeWdm(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('penalidadeWdm') ? 'invalid' : ''}
          />
        </div>

        <div className="input-group">
          <label htmlFor="degradacaoLaser">
            <i className="fas fa-hourglass-half"></i> Degradação do Laser [dB]
            <span className="tooltip-icon">?<span className="tooltip-text">Atenuação adicional para cobrir o envelhecimento natural do transmissor laser. Típico: 1 a 2 dB.</span></span>
          </label>
          <input
            type="number"
            id="degradacaoLaser"
            value={degradacaoLaser}
            onChange={(e) => setDegradacaoLaser(e.target.value)}
            step="0.01"
            min="0"
            className={formErrors.includes('degradacaoLaser') ? 'invalid' : ''}
          />
        </div>
      </div>

      <div className="btn-container">
        <button className="btn btn-primary" onClick={handleCalcularEnlace}>
          <i className="fas fa-calculator"></i> Calcular Enlace
        </button>
        <button className="btn btn-success" onClick={handleGerarRelatorio}>
          <i className="fas fa-file-pdf"></i> Gerar Relatório
        </button>
        <button className="btn btn-secondary" onClick={handleSalvarConfig}>
          <i className="fas fa-save"></i> Salvar Config
        </button>
      </div>

      {isCalcLoading && <div className="loading-spinner" style={{ display: 'block' }}></div>}

      {calculoResult && (
        <div id="resultadoCalculadora" ref={resultRef} style={{ display: 'block' }}>
          <h4><i className="fas fa-chart-line"></i> Análise do Orçamento Óptico (Link Budget)</h4>
          <p><strong>Orçamento Óptico Bruto (Link Budget):</strong> {calculoResult.orcamentoBruto.toFixed(2)} dB</p>
          <p><strong>Atenuação Total Estimada:</strong> {calculoResult.atenuacaoTotal.toFixed(2)} dB</p>
          <ul style={{ paddingLeft: '20px', listStyleType: 'disc', margin: '5px 0 15px 0' }}>
            <li>Perda na Fibra ({distancia} km): {calculoResult.perdaTotalFibra.toFixed(2)} dB</li>
            <li>Perda nos Conectores ({numConectores} un.): {calculoResult.perdaTotalConectores.toFixed(2)} dB</li>
            <li>Perda nas Emendas ({numEmendas} un.): {calculoResult.perdaTotalEmendas.toFixed(2)} dB</li>
            {calculoResult.perdaSplitters > 0 && (
              <li>Perda por Splitters: {calculoResult.perdaSplitters.toFixed(2)} dB</li>
            )}
            {calculoResult.penalidadeWdm > 0 && (
              <li>Penalidade WDM: {calculoResult.penalidadeWdm.toFixed(2)} dB</li>
            )}
            {calculoResult.degradacaoLaser > 0 && (
              <li>Degradação do Laser: {calculoResult.degradacaoLaser.toFixed(2)} dB</li>
            )}
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: 'rgba(var(--accent-rgb), 0.05)', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}>
            <p style={{ margin: 0 }}><strong>Margem de Segurança Configurada:</strong> {parseFloat(margem).toFixed(2)} dB</p>
            <p style={{ margin: 0 }}><strong>Margem Efetiva Restante:</strong> {(calculoResult.orcamentoLiquido + parseFloat(margem)).toFixed(2)} dB</p>
          </div>
          <hr style={{ margin: '15px 0', borderColor: 'var(--border)' }} />
          <p><strong>Margem disponível (dB) / Sobra Líquida:</strong> {calculoResult.orcamentoLiquido.toFixed(2)} dB</p>

          {calculoResult.viable ? (
            <div className="status viavel">
              <i className="fas fa-check-circle"></i> ENLACE VIÁVEL
            </div>
          ) : (
            <div>
              <div className="status inviavel">
                <i className="fas fa-times-circle"></i> ENLACE INVIÁVEL
              </div>
              <p style={{ textAlign: 'center', color: 'var(--err)', marginTop: '10px' }}>
                Faltam <b>{Math.abs(calculoResult.orcamentoLiquido).toFixed(2)} dB</b> no orçamento para que o enlace funcione.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
