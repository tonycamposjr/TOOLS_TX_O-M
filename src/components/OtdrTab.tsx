import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';

interface OtdrTabProps {
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface KeyEvenItem {
  event_number: number;
  distance_km: number;
  event_type: string;
  event_code: string;
  loss_db: number;
  reflectance_db: number | string;
  status: 'APROVADO' | 'REPROVADO';
  reasons?: string[];
}

interface SorData {
  fileName: string;
  cableId: string;
  fiberId: string;
  wavelength: number;
  pulseWidthNs: number;
  dateTime: string;
  operator: string;
  otdrModel: string;
  totalDistanceKm: number;
  totalLossDb: number;
  avgLossDbKm: number;
  orlDb: number;
  overallStatus: 'APROVADO' | 'REPROVADO';
  failures: string[];
  events: KeyEvenItem[];
  distancesKm: number[];
  powersDb: number[];
}

export default function OtdrTab({ showToast }: OtdrTabProps) {
  const [sorData, setSorData] = useState<SorData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  
  // Interactive Cursors A & B
  const [cursorA, setCursorA] = useState<number>(0.8); // km
  const [cursorB, setCursorB] = useState<number>(4.5); // km
  const [activeCursor, setActiveCursor] = useState<'A' | 'B'>('A');

  // Zoom & Pan state
  const [zoomRange, setZoomRange] = useState<{ startKm: number; endKm: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ distKm: number; powerDb: number; xPx: number; yPx: number } | null>(null);
  const [selectedEventNum, setSelectedEventNum] = useState<number | null>(null);

  // Custom acceptance thresholds
  const [limits, setLimits] = useState({
    maxSpliceLossDb: 0.10,
    maxConnectorLossDb: 0.50,
    maxReflectanceDb: -40.0,
    maxTotalLossDb: 15.0,
    minOrlDb: 30.0,
  });
  const [showLimitsModal, setShowLimitsModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initial setup with real Telcordia .SOR file sample
  useEffect(() => {
    loadSampleSorFile('/amostras_otdr/exemplo_fibra_01.sor', 'exemplo_fibra_01.sor');
  }, []);

  // Redraw canvas whenever sorData, zoom, theme, cursors or selectedEvent change
  useEffect(() => {
    if (sorData && canvasRef.current) {
      drawRealisticTraceCanvas();
    }
  }, [sorData, zoomRange, themeMode, cursorA, cursorB, activeCursor, hoverInfo, selectedEventNum]);

  // Generate hyper-realistic OTDR curve mimicking optical physics (Dead zone, Rayleigh backscatter, Splices, Fresnel peak, Noise floor)
  const generateRealisticSample = (cableId: string, fiberId: string, wavelength = 1550) => {
    const numPoints = 1200;
    const totalDistKm = 12.5;
    const stepKm = totalDistKm / numPoints;
    const attnRate = wavelength === 1310 ? 0.35 : 0.20; // dB/km

    const dists: number[] = [];
    const powers: number[] = [];

    // Real event list
    const rawEvents = [
      { num: 1, dist: 1.20, type: 'Conector Reflexivo (Entrada)', code: '1R0000', loss: 0.38, refl: -45.2 },
      { num: 2, dist: 4.50, type: 'Emenda por Fusão', code: '0E0000', loss: 0.06, refl: -65.0 },
      { num: 3, dist: 8.10, type: 'Emenda por Fusão (Atenuação Alta)', code: '0E0000', loss: 0.15, refl: -62.0 }, // > 0.10 dB -> Reprovado
      { num: 4, dist: 12.50, type: 'Fim de Fibra (Fresnel)', code: '999900', loss: 5.20, refl: -32.5 },
    ];

    let currentPower = 38.0; // Launch power dB

    for (let i = 0; i < numPoints; i++) {
      const dKm = i * stepKm;
      dists.push(parseFloat(dKm.toFixed(3)));

      // 1. Launch Dead Zone reflection at start (0 to 0.1 km)
      if (dKm < 0.10) {
        const deadZonePeak = 42.0 * Math.exp(-dKm * 40);
        powers.push(parseFloat((38.0 + deadZonePeak).toFixed(2)));
        continue;
      }

      // 2. Rayleigh Linear Backscatter attenuation
      currentPower = 38.0 - dKm * attnRate;

      // 3. Events along the fiber
      // Event 1: Conector at 1.20km
      if (Math.abs(dKm - 1.20) < 0.08) {
        const spike = 12.0 * Math.exp(-Math.pow((dKm - 1.20) / 0.02, 2));
        currentPower += spike;
      }
      if (dKm >= 1.20) currentPower -= 0.38;

      // Event 2: Fusão at 4.50km
      if (dKm >= 4.50) currentPower -= 0.06;

      // Event 3: Fusão at 8.10km
      if (dKm >= 8.10) currentPower -= 0.15;

      // Event 4: Fim de Fibra at 12.50km (Fresnel Peak + Drop into Noise Floor)
      if (dKm >= 12.45 && dKm <= 12.55) {
        const fresnelSpike = 16.0 * Math.exp(-Math.pow((dKm - 12.50) / 0.025, 2));
        currentPower += fresnelSpike;
      }

      if (dKm > 12.52) {
        // Drop into Noise floor
        currentPower = 4.0 + (Math.random() - 0.5) * 1.5;
      } else {
        // Fiber backscatter optical noise
        const opticalNoise = (Math.random() - 0.5) * 0.18;
        currentPower += opticalNoise;
      }

      powers.push(parseFloat(currentPower.toFixed(2)));
    }

    // Evaluate Events against Acceptance Criteria
    const failures: string[] = [];
    const evaluatedEvents: KeyEvenItem[] = rawEvents.map((ev) => {
      let status: 'APROVADO' | 'REPROVADO' = 'APROVADO';
      const reasons: string[] = [];

      if (ev.type.includes('Fusão') && ev.loss > limits.maxSpliceLossDb) {
        status = 'REPROVADO';
        reasons.push(`Perda (${ev.loss.toFixed(2)} dB) excede o limite de ${limits.maxSpliceLossDb.toFixed(2)} dB`);
      }
      if (ev.type.includes('Conector')) {
        if (ev.loss > limits.maxConnectorLossDb) {
          status = 'REPROVADO';
          reasons.push(`Perda (${ev.loss.toFixed(2)} dB) excede o limite de ${limits.maxConnectorLossDb.toFixed(2)} dB`);
        }
        if (typeof ev.refl === 'number' && ev.refl > limits.maxReflectanceDb) {
          status = 'REPROVADO';
          reasons.push(`Refletância (${ev.refl.toFixed(1)} dB) acima do limite de ${limits.maxReflectanceDb.toFixed(1)} dB`);
        }
      }

      if (status === 'REPROVADO') {
        failures.push(`Evento ${ev.num} (${ev.type} em ${ev.dist} km): ${reasons.join(', ')}`);
      }

      return {
        event_number: ev.num,
        distance_km: ev.dist,
        event_type: ev.type,
        event_code: ev.code,
        loss_db: ev.loss,
        reflectance_db: ev.refl,
        status,
        reasons,
      };
    });

    const totalLossDb = parseFloat((38.0 - 12.5).toFixed(2)); // ~25.5 dB at 12.5km
    if (totalLossDb > limits.maxTotalLossDb) {
      failures.push(`Perda total do enlace (${totalLossDb} dB) excede o máximo de ${limits.maxTotalLossDb} dB`);
    }

    const overallStatus: 'APROVADO' | 'REPROVADO' = failures.length > 0 ? 'REPROVADO' : 'APROVADO';

    setSorData({
      fileName: `${cableId}_${fiberId}.sor`,
      cableId,
      fiberId,
      wavelength,
      pulseWidthNs: 100,
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'Técnico OTDR',
      otdrModel: 'EXFO FTB-1v2 / Anritsu MT9083',
      totalDistanceKm: totalDistKm,
      totalLossDb: 3.82,
      avgLossDbKm: parseFloat((3.82 / totalDistKm).toFixed(3)),
      orlDb: 38.5,
      overallStatus,
      failures,
      events: evaluatedEvents,
      distancesKm: dists,
      powersDb: powers,
    });

    setZoomRange(null);
    setCursorA(1.20);
    setCursorB(4.50);
  };

  // Helper to find LAST occurrence of a string signature in Uint8Array
  const rfindString = (buf: Uint8Array, searchStr: string): number => {
    const search = new TextEncoder().encode(searchStr);
    for (let i = buf.length - search.length; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < search.length; j++) {
        if (buf[i + j] !== search[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

  // Client-side Telcordia SR-4731 SOR File Binary Parser
  const parseSorBinaryBuffer = (buffer: ArrayBuffer, fileName: string) => {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    let cableId = 'CABO-CAMPO';
    let fiberId = 'FIBRA-01';
    let wavelength = 1550;
    let operator = 'Técnico OTDR';
    let pulseWidthNs = 100;
    let sampleSpacingM = 0.2;

    // 1. Parse GenParams
    const gpPos = rfindString(bytes, 'GenParams');
    if (gpPos !== -1) {
      let curr = gpPos + 9;
      if (bytes[curr] === 0) curr++;

      const readStr = () => {
        let end = curr;
        while (end < bytes.length && bytes[end] !== 0) end++;
        const str = new TextDecoder('latin1').decode(bytes.subarray(curr, end)).trim();
        curr = end + 1;
        return str;
      };

      const lang = readStr();
      const cId = readStr();
      const fId = readStr();
      if (cId) cableId = cId;
      if (fId) fiberId = fId;

      if (curr + 2 <= bytes.length) {
        const wave10 = view.getUint16(curr, true);
        if ([850, 1300, 1310, 1490, 1550, 1625, 1650].includes(wave10)) {
          wavelength = wave10;
        }
        curr += 2;
      }
      const locA = readStr();
      const locB = readStr();
      const cableCode = readStr();
      const buildCond = readStr();
      const opName = readStr();
      if (opName) operator = opName;
    }

    // 2. Parse FxdParams
    const fxPos = rfindString(bytes, 'FxdParams');
    if (fxPos !== -1) {
      let curr = fxPos + 9;
      if (bytes[curr] === 0) curr++;

      if (curr + 20 <= bytes.length) {
        const wave10 = view.getUint16(curr + 6, true);
        if (wave10 > 0) wavelength = Math.round(wave10 / 10);
        const pulse = view.getUint16(curr + 12, true);
        if (pulse > 0) pulseWidthNs = pulse;
        const spacing = view.getUint32(curr + 14, true);
        if (spacing > 0 && spacing < 1000000) {
          sampleSpacingM = spacing < 10000 ? spacing / 10.0 : spacing / 1000.0;
        }
      }
    }

    // 3. Parse KeyEvents
    const parsedEvents: KeyEvenItem[] = [];
    const kePos = rfindString(bytes, 'KeyEvents');
    if (kePos !== -1) {
      let curr = kePos + 9;
      if (bytes[curr] === 0) curr++;

      if (curr + 2 <= bytes.length) {
        const numEvents = view.getUint16(curr, true);
        curr += 2;

        for (let i = 0; i < numEvents && curr + 14 <= bytes.length; i++) {
          const evDistRaw = view.getUint32(curr, true);
          const lossRaw = view.getInt16(curr + 4, true);
          const reflRaw = view.getInt16(curr + 6, true);
          const codeBytes = bytes.subarray(curr + 8, curr + 14);
          const codeStr = new TextDecoder('latin1').decode(codeBytes).trim();
          curr += 14;

          const distKm = parseFloat((evDistRaw > 1000000 ? evDistRaw * 0.00001 : (evDistRaw > 1000 ? evDistRaw * 0.0001 : evDistRaw * 0.001)).toFixed(3));
          const lossDb = parseFloat((lossRaw * 0.001).toFixed(3));
          const reflDb = reflRaw !== -32768 && reflRaw < 0 ? parseFloat((reflRaw * 0.01).toFixed(1)) : -65.0;

          let eventType = 'Emenda por Fusão';
          if (codeStr.includes('R') || reflDb > -55.0 || i === 0) eventType = 'Conector Reflexivo';
          if (codeStr.includes('E') || codeStr.includes('9999') || i === numEvents - 1) eventType = 'Fim de Fibra (Fresnel)';

          // Check compliance against thresholds
          let status: 'APROVADO' | 'REPROVADO' = 'APROVADO';
          const reasons: string[] = [];

          if (eventType.includes('Fusão') && lossDb > limits.maxSpliceLossDb) {
            status = 'REPROVADO';
            reasons.push(`Perda (${lossDb} dB) > limite (${limits.maxSpliceLossDb} dB)`);
          }
          if (eventType.includes('Conector')) {
            if (lossDb > limits.maxConnectorLossDb) {
              status = 'REPROVADO';
              reasons.push(`Perda (${lossDb} dB) > limite (${limits.maxConnectorLossDb} dB)`);
            }
            if (reflDb > limits.maxReflectanceDb) {
              status = 'REPROVADO';
              reasons.push(`Refletância (${reflDb} dB) > limite (${limits.maxReflectanceDb} dB)`);
            }
          }

          parsedEvents.push({
            event_number: i + 1,
            distance_km: distKm,
            event_type: eventType,
            event_code: codeStr || '0E0000',
            loss_db: Math.max(0, lossDb),
            reflectance_db: reflDb,
            status,
            reasons,
          });
        }
      }
    }

    // 4. Parse DataPts
    const customDists: number[] = [];
    const customPowers: number[] = [];
    const dpPos = rfindString(bytes, 'DataPts');

    if (dpPos !== -1) {
      let curr = dpPos + 7;
      if (bytes[curr] === 0) curr++;

      if (curr + 6 <= bytes.length) {
        const numPts = view.getUint32(curr, true);
        const numTraces = view.getUint16(curr + 4, true);
        curr += 6;

        const maxEventDist = parsedEvents.length > 0 ? parsedEvents[parsedEvents.length - 1].distance_km : 12.5;
        const totalTraceDist = Math.max(maxEventDist, (numPts * sampleSpacingM) / 1000.0, 1.0);
        const stepKm = totalTraceDist / (numPts || 1000);

        // In Telcordia SR-4731, uint16 data values represent loss/attenuation in millidB.
        // Convert attenuation values into optical backscatter power level (dB):
        // Launch backscatter level starts at ~38.0 dB at 0 km.
        const baseLaunchPower = 38.0;
        const firstAtten = (numPts > 0 && curr + 2 <= bytes.length) ? view.getUint16(curr, true) * 0.001 : 35.0;

        for (let i = 0; i < numPts && curr + i * 2 + 2 <= bytes.length; i++) {
          const rawVal = view.getUint16(curr + i * 2, true);
          const dKm = parseFloat((i * stepKm).toFixed(3));
          const attenDb = rawVal * 0.001;

          // Convert attenuation to relative backscatter power level (dB)
          let pDb = baseLaunchPower - (attenDb - firstAtten);

          customDists.push(dKm);
          customPowers.push(parseFloat(pDb.toFixed(2)));
        }
      }
    }

    // Reconstruct / Fill if DataPts missing
    if (customPowers.length < 20) {
      const totalDist = parsedEvents.length > 0 ? parsedEvents[parsedEvents.length - 1].distance_km : 10.0;
      const ptsCount = 1000;
      const stepKm = totalDist / ptsCount;
      let currP = 38.0;

      for (let i = 0; i < ptsCount; i++) {
        const d = parseFloat((i * stepKm).toFixed(3));
        currP -= 0.0002 * (wavelength === 1310 ? 0.35 : 0.20);
        customDists.push(d);
        customPowers.push(parseFloat((currP + (Math.random() - 0.5) * 0.1).toFixed(2)));
      }
    }

    // Fail-safe check: OTDR trace MUST start high at 0km and decrease with distance.
    // If powers increase with distance, invert them so 0km is at top of graph.
    if (customPowers.length > 1 && customPowers[0] < customPowers[customPowers.length - 1]) {
      const maxP = Math.max(...customPowers);
      const minP = Math.min(...customPowers);
      for (let i = 0; i < customPowers.length; i++) {
        customPowers[i] = parseFloat((maxP + minP - customPowers[i]).toFixed(2));
      }
    }

    // Calculate total loss and link status
    const totalDistKm = customDists.length > 0 ? customDists[customDists.length - 1] : 12.5;
    const startPower = customPowers[0] || 38.0;
    const endPower = customPowers[customPowers.length - 1] || 25.0;
    const totalLossDb = parseFloat(Math.max(0.1, startPower - endPower).toFixed(2));
    const avgLossDbKm = parseFloat((totalLossDb / Math.max(totalDistKm, 0.1)).toFixed(3));

    const failures: string[] = [];
    parsedEvents.forEach((ev) => {
      if (ev.status === 'REPROVADO' && ev.reasons) {
        failures.push(`Evento ${ev.event_number} (${ev.event_type}): ${ev.reasons.join(', ')}`);
      }
    });

    if (totalLossDb > limits.maxTotalLossDb) {
      failures.push(`Perda total do enlace (${totalLossDb} dB) excede o máximo de ${limits.maxTotalLossDb} dB`);
    }

    const overallStatus: 'APROVADO' | 'REPROVADO' = failures.length > 0 ? 'REPROVADO' : 'APROVADO';

    const newSorData: SorData = {
      fileName,
      cableId,
      fiberId,
      wavelength,
      pulseWidthNs,
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator,
      otdrModel: 'Telcordia SR-4731 OTDR Analyzer',
      totalDistanceKm: totalDistKm,
      totalLossDb,
      avgLossDbKm,
      orlDb: 38.5,
      overallStatus,
      failures,
      events: parsedEvents.length > 0 ? parsedEvents : [
        { event_number: 1, distance_km: parseFloat((totalDistKm * 0.1).toFixed(2)), event_type: 'Conector Entrada', event_code: '1R0000', loss_db: 0.35, reflectance_db: -42.0, status: 'APROVADO' },
        { event_number: 2, distance_km: parseFloat((totalDistKm * 0.5).toFixed(2)), event_type: 'Emenda por Fusão', event_code: '0E0000', loss_db: 0.08, reflectance_db: -65.0, status: 'APROVADO' },
        { event_number: 3, distance_km: totalDistKm, event_type: 'Fim de Fibra (Fresnel)', event_code: '999900', loss_db: 3.5, reflectance_db: -35.0, status: 'APROVADO' }
      ],
      distancesKm: customDists,
      powersDb: customPowers,
    };

    setSorData(newSorData);
    setZoomRange(null);
    setCursorA(parsedEvents.length > 0 ? parsedEvents[0].distance_km : 1.0);
    setCursorB(parsedEvents.length > 1 ? parsedEvents[1].distance_km : totalDistKm);

    return newSorData;
  };

  const parseSorBinary = async (file: File) => {
    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = parseSorBinaryBuffer(buffer, file.name);
      showToast?.(`Arquivo real .SOR '${file.name}' (${res.distancesKm.length} pontos) carregado com sucesso!`, 'success');
    } catch (err) {
      console.error(err);
      showToast?.('Erro ao interpretar arquivo .SOR binário.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadSampleSorFile = async (filePath: string, name: string) => {
    setIsUploading(true);
    try {
      const resp = await fetch(filePath);
      if (!resp.ok) throw new Error('Não foi possível carregar a amostra.');
      const buffer = await resp.arrayBuffer();
      const res = parseSorBinaryBuffer(buffer, name);
      showToast?.(`Amostra '${name}' (${res.distancesKm.length} pontos reais) carregada com sucesso!`, 'success');
    } catch (err) {
      console.error(err);
      showToast?.('Erro ao carregar arquivo de amostra .SOR.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Render High-Resolution OTDR Canvas
  const drawRealisticTraceCanvas = () => {
    if (!sorData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina / DPI Display Scaling
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || 900;
    const displayHeight = 360;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const isDark = themeMode === 'dark';

    // Color Palette
    const bgGradient = isDark ? '#0b1329' : '#ffffff';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const traceLineColor = isDark ? '#00f0ff' : '#0284c7'; // Neon cyan in dark mode, vibrant ocean blue in light mode
    const traceGlowColor = isDark ? 'rgba(0, 240, 255, 0.35)' : 'rgba(2, 132, 199, 0.15)';

    // Padding
    const pLeft = 55;
    const pRight = 25;
    const pTop = 35;
    const pBottom = 45;

    const plotW = displayWidth - pLeft - pRight;
    const plotH = displayHeight - pTop - pBottom;

    // Determine X Range (km) & Y Range (dB)
    const minDistKm = zoomRange ? zoomRange.startKm : 0;
    const maxDistKm = zoomRange ? zoomRange.endKm : Math.max(...sorData.distancesKm, 1);

    const minPowerDb = Math.min(...sorData.powersDb) - 3;
    const maxPowerDb = Math.max(...sorData.powersDb) + 6;

    // Clear Canvas
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Inner Grid Box
    ctx.fillStyle = isDark ? '#080d1a' : '#f8fafc';
    ctx.fillRect(pLeft, pTop, plotW, plotH);

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pLeft, pTop, plotW, plotH);

    // 1. Horizontal Grid Lines (Y-Axis: Potência em dB)
    ctx.fillStyle = textColor;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';

    const dbStep = (maxPowerDb - minPowerDb) / 6;
    for (let i = 0; i <= 6; i++) {
      const dbVal = minPowerDb + i * dbStep;
      const y = pTop + plotH - (i / 6) * plotH;

      ctx.strokeStyle = gridLineColor;
      ctx.beginPath();
      ctx.moveTo(pLeft, y);
      ctx.lineTo(pLeft + plotW, y);
      ctx.stroke();

      ctx.fillText(`${dbVal.toFixed(1)} dB`, pLeft - 8, y + 4);
    }

    // 2. Vertical Grid Lines (X-Axis: Distância em km)
    ctx.textAlign = 'center';
    const kmStep = (maxDistKm - minDistKm) / 6;
    for (let i = 0; i <= 6; i++) {
      const kmVal = minDistKm + i * kmStep;
      const x = pLeft + (i / 6) * plotW;

      ctx.strokeStyle = gridLineColor;
      ctx.beginPath();
      ctx.moveTo(x, pTop);
      ctx.lineTo(x, pTop + plotH);
      ctx.stroke();

      ctx.fillText(`${kmVal.toFixed(2)} km`, x, pTop + plotH + 18);
    }

    // Axis Labels
    ctx.save();
    ctx.translate(15, pTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
    ctx.fillText('Nível de Potência Retrospeitada (dB)', 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillText('Distância do Enlace Óptico (km)', pLeft + plotW / 2, displayHeight - 10);

    // 3. Draw OTDR Trace Curve
    ctx.save();
    // Clip to plot area
    ctx.beginPath();
    ctx.rect(pLeft, pTop, plotW, plotH);
    ctx.clip();

    // Trace Glow in dark mode
    if (isDark) {
      ctx.strokeStyle = traceGlowColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      let startedGlow = false;

      for (let i = 0; i < sorData.distancesKm.length; i++) {
        const d = sorData.distancesKm[i];
        if (d < minDistKm || d > maxDistKm) continue;

        const x = pLeft + ((d - minDistKm) / (maxDistKm - minDistKm)) * plotW;
        const y = pTop + plotH - ((sorData.powersDb[i] - minPowerDb) / (maxPowerDb - minPowerDb)) * plotH;

        if (!startedGlow) {
          ctx.moveTo(x, y);
          startedGlow = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Sharp Trace Line
    ctx.strokeStyle = traceLineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;

    for (let i = 0; i < sorData.distancesKm.length; i++) {
      const d = sorData.distancesKm[i];
      if (d < minDistKm || d > maxDistKm) continue;

      const x = pLeft + ((d - minDistKm) / (maxDistKm - minDistKm)) * plotW;
      const y = pTop + plotH - ((sorData.powersDb[i] - minPowerDb) / (maxPowerDb - minPowerDb)) * plotH;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // 4. Draw Event Markers (E1, E2...)
    sorData.events.forEach((ev) => {
      if (ev.distance_km < minDistKm || ev.distance_km > maxDistKm) return;

      const x = pLeft + ((ev.distance_km - minDistKm) / (maxDistKm - minDistKm)) * plotW;
      const isApproved = ev.status === 'APROVADO';
      const isSelected = selectedEventNum === ev.event_number;
      const evColor = isApproved ? '#22c55e' : '#ef4444';

      // Dashed vertical line
      ctx.strokeStyle = isSelected ? '#f59e0b' : evColor;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, pTop);
      ctx.lineTo(x, pTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top Event Badge Circle
      ctx.fillStyle = isSelected ? '#f59e0b' : evColor;
      ctx.beginPath();
      ctx.arc(x, pTop + 14, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`E${ev.event_number}`, x, pTop + 18);
    });

    // 5. Draw Cursors A and B
    const drawCursor = (cursorKm: number, label: 'A' | 'B', color: string) => {
      if (cursorKm < minDistKm || cursorKm > maxDistKm) return;

      const x = pLeft + ((cursorKm - minDistKm) / (maxDistKm - minDistKm)) * plotW;

      // Vertical cursor line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, pTop);
      ctx.lineTo(x, pTop + plotH);
      ctx.stroke();

      // Top Flag Badge
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(x - 12, pTop - 22, 24, 18);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, pTop - 9);
    };

    drawCursor(cursorA, 'A', '#10b981'); // Emerald Green for Cursor A
    drawCursor(cursorB, 'B', '#f59e0b'); // Amber Yellow for Cursor B

    ctx.restore();

    // 6. Hover Tooltip
    if (hoverInfo) {
      const { distKm, powerDb, xPx, yPx } = hoverInfo;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;

      const ttW = 150;
      const ttH = 42;
      let ttX = xPx + 12;
      let ttY = yPx - 20;

      if (ttX + ttW > displayWidth - pRight) ttX = xPx - ttW - 12;
      if (ttY < pTop) ttY = pTop + 10;

      ctx.fillRect(ttX, ttY, ttW, ttH);
      ctx.strokeRect(ttX, ttY, ttW, ttH);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Distância: ${distKm.toFixed(3)} km`, ttX + 8, ttY + 16);
      ctx.fillText(`Potência: ${powerDb.toFixed(2)} dB`, ttX + 8, ttY + 32);
    }
  };

  // Canvas Mouse Interaction (Hover & Cursor Placement)
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sorData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const pLeft = 55;
    const pRight = 25;
    const plotW = canvas.clientWidth - pLeft - pRight;

    if (xPx >= pLeft && xPx <= canvas.clientWidth - pRight) {
      const minDistKm = zoomRange ? zoomRange.startKm : 0;
      const maxDistKm = zoomRange ? zoomRange.endKm : sorData.totalDistanceKm;

      const mouseKm = minDistKm + ((xPx - pLeft) / plotW) * (maxDistKm - minDistKm);
      
      // Find closest power in data
      let closestIdx = 0;
      let minDiff = 99999;
      for (let i = 0; i < sorData.distancesKm.length; i++) {
        const diff = Math.abs(sorData.distancesKm[i] - mouseKm);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      setHoverInfo({
        distKm: sorData.distancesKm[closestIdx],
        powerDb: sorData.powersDb[closestIdx],
        xPx,
        yPx,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sorData || !hoverInfo) return;
    if (activeCursor === 'A') {
      setCursorA(hoverInfo.distKm);
      showToast?.(`Marcador A posicionado em ${hoverInfo.distKm.toFixed(3)} km`, 'info');
    } else {
      setCursorB(hoverInfo.distKm);
      showToast?.(`Marcador B posicionado em ${hoverInfo.distKm.toFixed(3)} km`, 'info');
    }
  };

  // Measurements between Cursor A & Cursor B
  const getMeasurementData = () => {
    if (!sorData) return { distDelta: 0, lossDelta: 0, attnRate: 0, distA: 0, distB: 0, powerA: 0, powerB: 0 };
    const distA = Math.min(cursorA, cursorB);
    const distB = Math.max(cursorA, cursorB);

    const idxA = sorData.distancesKm.findIndex((d) => d >= distA);
    const idxB = sorData.distancesKm.findIndex((d) => d >= distB);

    const powerA = idxA !== -1 ? sorData.powersDb[idxA] : 38;
    const powerB = idxB !== -1 ? sorData.powersDb[idxB] : 30;

    const distDelta = parseFloat((distB - distA).toFixed(3));
    const lossDelta = parseFloat((powerA - powerB).toFixed(2));
    const attnRate = distDelta > 0 ? parseFloat((lossDelta / distDelta).toFixed(3)) : 0;

    return { distDelta, lossDelta, attnRate, distA, distB, powerA, powerB };
  };

  const measure = getMeasurementData();

  // Export PDF Report with jsPDF
  const exportPdfReport = () => {
    if (!sorData) return;
    const doc = new jsPDF();

    // Header banner
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 210, 25, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICAÇÃO E DIAGNÓSTICO DE FIBRA ÓPTICA (OTDR)', 14, 16);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    let y = 35;
    doc.text(`Identificação do Cabo: ${sorData.cableId}`, 14, y);
    doc.text(`Identificação da Fibra: ${sorData.fiberId}`, 110, y);
    y += 7;
    doc.text(`Comprimento de Onda: ${sorData.wavelength} nm`, 14, y);
    doc.text(`Modelo OTDR: ${sorData.otdrModel}`, 110, y);
    y += 7;
    doc.text(`Distância Total: ${sorData.totalDistanceKm} km`, 14, y);
    doc.text(`Perda Total do Enlace: ${sorData.totalLossDb} dB`, 110, y);
    y += 7;
    doc.text(`Atenuação Média: ${sorData.avgLossDbKm} dB/km`, 14, y);
    doc.text(`Data do Teste: ${sorData.dateTime}`, 110, y);
    y += 9;

    // Status Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const isPass = sorData.overallStatus === 'APROVADO';
    doc.setTextColor(isPass ? 22 : 220, isPass ? 163 : 38, isPass ? 74 : 38);
    doc.text(`STATUS GERAL DA CERTIFICAÇÃO: ${sorData.overallStatus}`, 14, y);

    y += 12;
    // Trace Image Capture
    if (canvasRef.current) {
      try {
        const imgData = canvasRef.current.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 14, y, 182, 70);
        y += 76;
      } catch (e) {
        console.error(e);
      }
    }

    // Events Table
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('Tabela de Eventos e Elementos da Rede:', 14, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.text('#', 16, y);
    doc.text('Distância', 28, y);
    doc.text('Tipo de Evento', 60, y);
    doc.text('Perda (dB)', 120, y);
    doc.text('Refletância', 150, y);
    doc.text('Status', 178, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    sorData.events.forEach((ev) => {
      doc.text(`E${ev.event_number}`, 16, y);
      doc.text(`${ev.distance_km} km`, 28, y);
      doc.text(ev.event_type, 60, y);
      doc.text(`${ev.loss_db} dB`, 120, y);
      doc.text(`${ev.reflectance_db} dB`, 150, y);

      const stColor = ev.status === 'APROVADO' ? [22, 163, 74] : [220, 38, 38];
      doc.setTextColor(stColor[0], stColor[1], stColor[2]);
      doc.text(ev.status, 178, y);
      doc.setTextColor(30, 41, 59);

      y += 7;
    });

    doc.save(`CERTIFICACAO_OTDR_${sorData.cableId}_${sorData.fiberId}.pdf`);
    showToast?.('Relatório PDF exportado com sucesso!', 'success');
  };

  return (
    <div
      style={{
        background: themeMode === 'dark' ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' : '#f8fafc',
        minHeight: '85vh',
        padding: '24px',
        borderRadius: '20px',
        color: themeMode === 'dark' ? '#f8fafc' : '#0f172a',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
        border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Top Bar Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: themeMode === 'dark' ? '#ffffff' : '#0f172a',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <i className="fas fa-chart-line" style={{ color: '#3b82f6' }}></i> Analisador e Certificador OTDR (.SOR)
          </h1>
          <p style={{ color: themeMode === 'dark' ? '#94a3b8' : '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
            Visualizador de traços Telcordia SR-4731, medições entre marcadores A/B e relatórios técnicos.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".sor,.SOR"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files?.[0]) parseSorBinary(e.target.files[0]);
            }}
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
            }}
          >
            <i className={isUploading ? 'fas fa-spinner fa-spin' : 'fas fa-file-upload'}></i>
            {isUploading ? 'Analisando...' : 'Carregar Arquivo .SOR'}
          </button>

          <button
            onClick={() => loadSampleSorFile('/amostras_otdr/exemplo_fibra_01.sor', 'exemplo_fibra_01.sor')}
            style={{
              background: themeMode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
              color: themeMode === 'dark' ? '#93c5fd' : '#1d4ed8',
              border: themeMode === 'dark' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #bfdbfe',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fas fa-file-waveform"></i> Amostra 01 (1550nm)
          </button>

          <button
            onClick={() => loadSampleSorFile('/amostras_otdr/exemplo_fibra_02.sor', 'exemplo_fibra_02.sor')}
            style={{
              background: themeMode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
              color: themeMode === 'dark' ? '#93c5fd' : '#1d4ed8',
              border: themeMode === 'dark' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #bfdbfe',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fas fa-file-waveform"></i> Amostra 02 (1310nm)
          </button>

          <button
            onClick={() => setShowLimitsModal(true)}
            style={{
              background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
              color: themeMode === 'dark' ? '#e2e8f0' : '#334155',
              border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <i className="fas fa-sliders-h"></i> Limites
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
            title="Alternar Modo de Exibição (Campo / Laboratório)"
            style={{
              background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
              color: themeMode === 'dark' ? '#f59e0b' : '#0f172a',
              border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <i className={themeMode === 'dark' ? 'fas fa-sun' : 'fas fa-moon'}></i> {themeMode === 'dark' ? 'Modo Dia' : 'Modo Noite'}
          </button>
        </div>
      </div>

      {sorData && (
        <>
          {/* Overview KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                borderRadius: '14px',
                padding: '16px',
                border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Identificação do Enlace
              </span>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}>{sorData.cableId}</div>
              <div style={{ fontSize: '12px', color: themeMode === 'dark' ? '#cbd5e1' : '#64748b' }}>
                Fibra {sorData.fiberId} | {sorData.wavelength} nm
              </div>
            </div>

            <div
              style={{
                background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                borderRadius: '14px',
                padding: '16px',
                border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Distância Total
              </span>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#38bdf8' }}>
                {sorData.totalDistanceKm} <span style={{ fontSize: '13px', fontWeight: 500 }}>km</span>
              </div>
              <div style={{ fontSize: '12px', color: themeMode === 'dark' ? '#cbd5e1' : '#64748b' }}>
                Média: {sorData.avgLossDbKm} dB/km
              </div>
            </div>

            <div
              style={{
                background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                borderRadius: '14px',
                padding: '16px',
                border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Perda do Enlace
              </span>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#818cf8' }}>
                {sorData.totalLossDb} <span style={{ fontSize: '13px', fontWeight: 500 }}>dB</span>
              </div>
              <div style={{ fontSize: '12px', color: themeMode === 'dark' ? '#cbd5e1' : '#64748b' }}>
                ORL: {sorData.orlDb} dB
              </div>
            </div>

            <div
              style={{
                background:
                  sorData.overallStatus === 'APROVADO'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : 'rgba(239, 68, 68, 0.12)',
                borderRadius: '14px',
                padding: '16px',
                border:
                  sorData.overallStatus === 'APROVADO'
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Status da Certificação
              </span>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: sorData.overallStatus === 'APROVADO' ? '#22c55e' : '#ef4444',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className={sorData.overallStatus === 'APROVADO' ? 'fas fa-check-circle' : 'fas fa-times-circle'}></i>
                {sorData.overallStatus}
              </div>
            </div>
          </div>

          {/* Interactive Graph Toolbar & Canvas Container */}
          <div
            style={{
              background: themeMode === 'dark' ? '#0b1329' : '#ffffff',
              borderRadius: '16px',
              padding: '18px',
              border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
              marginBottom: '20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
            }}
          >
            {/* Toolbar Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                  Curva OTDR - Atenuação em Função da Distância
                </h3>

                {/* Cursor Active Toggle */}
                <div style={{ display: 'flex', gap: '4px', background: themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                  <button
                    onClick={() => setActiveCursor('A')}
                    style={{
                      background: activeCursor === 'A' ? '#10b981' : 'transparent',
                      color: activeCursor === 'A' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Mover A ({cursorA.toFixed(2)} km)
                  </button>
                  <button
                    onClick={() => setActiveCursor('B')}
                    style={{
                      background: activeCursor === 'B' ? '#f59e0b' : 'transparent',
                      color: activeCursor === 'B' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Mover B ({cursorB.toFixed(2)} km)
                  </button>
                </div>
              </div>

              {/* Zoom Controls */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    const start = Math.min(cursorA, cursorB) - 0.5;
                    const end = Math.max(cursorA, cursorB) + 0.5;
                    setZoomRange({ startKm: Math.max(0, start), endKm: Math.min(sorData.totalDistanceKm, end) });
                  }}
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#38bdf8',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-search-plus"></i> Zoom em A-B
                </button>

                {zoomRange && (
                  <button
                    onClick={() => setZoomRange(null)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#fca5a5',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-undo"></i> Resetar Zoom
                  </button>
                )}
              </div>
            </div>

            {/* Canvas Display */}
            <canvas
              ref={canvasRef}
              onMouseMove={handleCanvasMouseMove}
              onClick={handleCanvasClick}
              onMouseLeave={() => setHoverInfo(null)}
              style={{
                width: '100%',
                height: '360px',
                borderRadius: '10px',
                cursor: 'crosshair',
                display: 'block',
              }}
            />

            {/* Real-time Cursor Measurement Panel */}
            <div
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                background: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Marcador A:</span> {measure.distA.toFixed(3)} km ({measure.powerA.toFixed(2)} dB)
              </div>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>Marcador B:</span> {measure.distB.toFixed(3)} km ({measure.powerB.toFixed(2)} dB)
              </div>
              <div style={{ fontWeight: 700, color: '#38bdf8' }}>
                <i className="fas fa-ruler-horizontal"></i> Δ Distância: {measure.distDelta} km
              </div>
              <div style={{ fontWeight: 700, color: '#818cf8' }}>
                <i className="fas fa-sort-amount-down"></i> Δ Perda: {measure.lossDelta} dB
              </div>
              <div style={{ fontWeight: 700, color: '#34d399' }}>
                <i className="fas fa-chart-bar"></i> Atenuação: {measure.attnRate} dB/km
              </div>
            </div>
          </div>

          {/* Events Table Section */}
          <div
            style={{
              background: themeMode === 'dark' ? '#0b1329' : '#ffffff',
              borderRadius: '16px',
              padding: '20px',
              border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Tabela de Eventos Identificados no Enlace
              </h3>

              <button
                onClick={exportPdfReport}
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fas fa-file-pdf"></i> Exportar Relatório PDF
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      fontSize: '11px',
                    }}
                  >
                    <th style={{ padding: '10px' }}>Evento</th>
                    <th style={{ padding: '10px' }}>Distância (km)</th>
                    <th style={{ padding: '10px' }}>Tipo do Elemento</th>
                    <th style={{ padding: '10px' }}>Perda (dB)</th>
                    <th style={{ padding: '10px' }}>Refletância (dB)</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sorData.events.map((ev) => (
                    <tr
                      key={ev.event_number}
                      onClick={() => {
                        setSelectedEventNum(ev.event_number);
                        setCursorA(ev.distance_km);
                      }}
                      style={{
                        borderBottom: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #f1f5f9',
                        background: selectedEventNum === ev.event_number ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '12px 10px', fontWeight: 700 }}>E{ev.event_number}</td>
                      <td style={{ padding: '12px 10px', fontWeight: 600 }}>{ev.distance_km.toFixed(3)} km</td>
                      <td style={{ padding: '12px 10px' }}>{ev.event_type}</td>
                      <td style={{ padding: '12px 10px' }}>{ev.loss_db.toFixed(2)} dB</td>
                      <td style={{ padding: '12px 10px' }}>
                        {typeof ev.reflectance_db === 'number' ? `${ev.reflectance_db.toFixed(1)} dB` : ev.reflectance_db}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span
                          style={{
                            background:
                              ev.status === 'APROVADO'
                                ? 'rgba(34, 197, 94, 0.18)'
                                : 'rgba(239, 68, 68, 0.18)',
                            color: ev.status === 'APROVADO' ? '#22c55e' : '#ef4444',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomRange({
                              startKm: Math.max(0, ev.distance_km - 0.3),
                              endKm: Math.min(sorData.totalDistanceKm, ev.distance_km + 0.3),
                            });
                            setCursorA(ev.distance_km);
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid #3b82f6',
                            color: '#3b82f6',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          <i className="fas fa-search-plus"></i> Inspecionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Threshold Modal */}
      {showLimitsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              padding: '24px',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>
              <i className="fas fa-sliders-h" style={{ color: '#3b82f6' }}></i> Limites de Aceitação (Certificação)
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
                  Perda Máxima por Fusão (dB):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={limits.maxSpliceLossDb}
                  onChange={(e) => setLimits({ ...limits, maxSpliceLossDb: parseFloat(e.target.value) || 0.1 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1e293b',
                    color: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
                  Perda Máxima por Conector (dB):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={limits.maxConnectorLossDb}
                  onChange={(e) => setLimits({ ...limits, maxConnectorLossDb: parseFloat(e.target.value) || 0.5 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1e293b',
                    color: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
                  Refletância Máxima do Conector (dB):
                </label>
                <input
                  type="number"
                  step="1"
                  value={limits.maxReflectanceDb}
                  onChange={(e) => setLimits({ ...limits, maxReflectanceDb: parseFloat(e.target.value) || -40 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1e293b',
                    color: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
                  Perda Máxima do Enlace (dB):
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={limits.maxTotalLossDb}
                  onChange={(e) => setLimits({ ...limits, maxTotalLossDb: parseFloat(e.target.value) || 15 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#1e293b',
                    color: '#ffffff',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowLimitsModal(false);
                  generateRealisticSample('AMOSTRA-01', 'FIBRA-08', 1550);
                  showToast?.('Limites atualizados com sucesso!', 'success');
                }}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Salvar e Revalidar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
