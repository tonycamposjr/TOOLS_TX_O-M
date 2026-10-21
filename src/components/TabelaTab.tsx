import React, { useState } from 'react';

export default function TabelaTab() {
  const [searchTable, setSearchTable] = useState('');

  const tableData = [
    { pulso: '30ns', distancia: '20km', duracao: '1 minuto' },
    { pulso: '100ns', distancia: '50km', duracao: '1 minuto' },
    { pulso: '300ns', distancia: '80km ou 100km', duracao: '2 minutos' },
    { pulso: '1us', distancia: '100km ou 120km', duracao: '2 minutos' },
    { pulso: '3us/5us', distancia: '120km', duracao: '3 minutos' },
    { pulso: '10us/20us', distancia: '150km', duracao: '3 minutos' }
  ];

  const filteredData = tableData.filter(row => {
    const term = searchTable.toLowerCase();
    return (
      row.pulso.toLowerCase().includes(term) ||
      row.distancia.toLowerCase().includes(term) ||
      row.duracao.toLowerCase().includes(term)
    );
  });

  return (
    <div className="tab-content active" style={{ display: 'block' }}>
      <div className="logo-container">
        <img src="https://logopng.com.br/logos/vivo-120.svg" alt="Logo Vivo Telecom - O&M BACKBONE TX/MÓVEL" referrerPolicy="no-referrer" />
        <div className="logo-text">O&M BACKBONE TX/MÓVEL</div>
      </div>

      <h2><i className="fas fa-table"></i> TABELA PADRÃO ÁBACO</h2>

      <div className="form-group" style={{ marginBottom: '30px' }}>
        <label htmlFor="searchTable"><i className="fas fa-search"></i> Buscar na tabela:</label>
        <input
          type="text"
          id="searchTable"
          value={searchTable}
          onChange={(e) => setSearchTable(e.target.value)}
          placeholder="Digite pulso, distância ou duração..."
        />
      </div>

      <div className="table-container" style={{ minHeight: 'auto' }}>
        <table id="abacoTable" style={{ minWidth: '100%' }}>
          <thead>
            <tr>
              <th>Pulso</th>
              <th>Distância</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, index) => (
              <tr key={index}>
                <td>{row.pulso}</td>
                <td>{row.distancia}</td>
                <td>{row.duracao}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <strong><i className="fas fa-info-circle"></i> No ato de abertura de TA de Rede Externa</strong>, deverá ser anexado curvas de OTDR em arquivo .sor e utilizar o padrão para nomear as fibras: 
                <br /><br />
                <code>CT#XXX_XXX_XX_FXX_TX</code> (Ex: CT#220_ARQ_FI_F17_TX e CT#220_ARQ_FI_F17_RX).
                <br /><br />
                <strong><i className="fas fa-folder"></i> Para facilitar a inserção dos anexos ao TA</strong>, deverá ser montada uma pasta com os arquivos com o nome da Rota e a data de criação, e a mesma deverá ser compactada 
                (Ex: <code>ARQ_FI_SCL_NJ_27_06_23.zip</code>).
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
