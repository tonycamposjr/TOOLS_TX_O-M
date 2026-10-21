export interface OpticalBudgetParams {
  tx: number;
  rx: number;
  distancia: number;
  perdaFibra: number;
  numConectores: number;
  perdaConector: number;
  numEmendas: number;
  perdaEmenda: number;
  margem: number;
  perdaSplitters: number;
  penalidadeWdm: number;
  degradacaoLaser: number;
}

export interface OpticalBudgetResult {
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
}

export function validateOpticalBudget(params: Partial<OpticalBudgetParams>): string[] {
  const errors: string[] = [];
  
  const txVal = params.tx ?? NaN;
  const rxVal = params.rx ?? NaN;
  const distVal = params.distancia ?? NaN;
  const perdaFibraVal = params.perdaFibra ?? NaN;
  const numConectoresVal = params.numConectores ?? NaN;
  const perdaConectorVal = params.perdaConector ?? NaN;
  const numEmendasVal = params.numEmendas ?? NaN;
  const perdaEmendaVal = params.perdaEmenda ?? NaN;
  const margemVal = params.margem ?? NaN;
  const perdaSplittersVal = params.perdaSplitters ?? NaN;
  const penalidadeWdmVal = params.penalidadeWdm ?? NaN;
  const degradacaoLaserVal = params.degradacaoLaser ?? NaN;

  if (isNaN(txVal)) errors.push('tx');
  
  if (isNaN(rxVal) || rxVal > 0) {
    errors.push('rx');
  }
  
  if (!isNaN(txVal) && !isNaN(rxVal) && txVal <= rxVal) {
    if (!errors.includes('tx')) errors.push('tx');
    if (!errors.includes('rx')) errors.push('rx');
  }

  if (isNaN(distVal) || distVal < 0) errors.push('distancia');
  if (isNaN(perdaFibraVal) || perdaFibraVal < 0) errors.push('perdaFibra');
  if (isNaN(numConectoresVal) || numConectoresVal < 2) errors.push('numConectores');
  if (isNaN(perdaConectorVal) || perdaConectorVal < 0) errors.push('perdaConector');
  if (isNaN(numEmendasVal) || numEmendasVal < 0) errors.push('numEmendas');
  if (isNaN(perdaEmendaVal) || perdaEmendaVal < 0) errors.push('perdaEmenda');
  if (isNaN(margemVal) || margemVal < 0) errors.push('margem');
  if (isNaN(perdaSplittersVal) || perdaSplittersVal < 0) errors.push('perdaSplitters');
  if (isNaN(penalidadeWdmVal) || penalidadeWdmVal < 0) errors.push('penalidadeWdm');
  if (isNaN(degradacaoLaserVal) || degradacaoLaserVal < 0) errors.push('degradacaoLaser');

  return errors;
}

export function calculateOpticalBudget(params: OpticalBudgetParams): OpticalBudgetResult {
  const orcamentoBruto = params.tx - params.rx;
  const perdaTotalFibra = params.distancia * params.perdaFibra;
  const perdaTotalConectores = params.numConectores * params.perdaConector;
  const perdaTotalEmendas = params.numEmendas * params.perdaEmenda;
  const atenuacaoTotal = perdaTotalFibra + perdaTotalConectores + perdaTotalEmendas + params.perdaSplitters + params.penalidadeWdm + params.degradacaoLaser;
  const orcamentoLiquido = orcamentoBruto - atenuacaoTotal - params.margem;

  return {
    orcamentoBruto,
    atenuacaoTotal,
    perdaTotalFibra,
    perdaTotalConectores,
    perdaTotalEmendas,
    perdaSplitters: params.perdaSplitters,
    penalidadeWdm: params.penalidadeWdm,
    degradacaoLaser: params.degradacaoLaser,
    orcamentoLiquido,
    viable: orcamentoLiquido >= 0
  };
}
