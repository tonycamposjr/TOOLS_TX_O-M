# Analisador e Certificador de Arquivos OTDR (.SOR) - Telcordia SR-4731

Aplicação robusta e modular em Python 3.10+ para parsing, validação de limites de aceitação, e geração automática de relatórios de certificação de fibra óptica a partir de arquivos `.SOR` (padrão Telcordia SR-4731 v1.0 e v2.0).

---

## 📁 Estrutura de Pastas do Projeto

```text
python_otdr/
├── parser.py                # Parser binário resiliente para arquivos .SOR
├── validator.py             # Motor de validação e verificação de limites de aceitação
├── report.py                # Gerador de relatórios (PDF com gráfico, Excel .xlsx e JSON)
├── cli.py                   # Interface de Linha de Comando (CLI com argparse)
├── main.py                  # Ponto de entrada do executável
├── generate_sample_sor.py   # Utilitário para geração de arquivos .SOR binários para testes
├── config_limits.json       # Arquivo de configuração de limites (formato JSON)
├── config_limits.yaml       # Arquivo de configuração de limites (formato YAML)
├── requirements.txt         # Lista de dependências Python
└── README.md                # Documentação técnica e guia de uso
```

---

## 🚀 Instalação e Requisitos

- **Python 3.10+** (Compatível com Windows, Linux e macOS)

### Instalação de dependências:

```bash
pip install -r requirements.txt
```

---

## ⚙️ Configuração dos Limites de Aceitação (`config_limits.json` / `.yaml`)

Você pode definir os critérios técnicos de aprovação no arquivo de configuração:

```json
{
  "max_splice_loss_db": 0.10,          // Perda máxima permitida em fusão/emenda (dB)
  "max_connector_loss_db": 0.50,       // Perda máxima permitida em conector (dB)
  "max_reflectance_db": -40.0,         // Refletância máxima permitida em conector (dB)
  "max_attenuation_1310_db_km": 0.38,  // Atenuação máxima em 1310 nm (dB/km)
  "max_attenuation_1550_db_km": 0.22,  // Atenuação máxima em 1550 nm (dB/km)
  "max_total_link_loss_db": 15.0,      // Perda total máxima do enlace (dB)
  "min_link_orl_db": 30.0              // Retorno óptico mínimo (ORL) (dB)
}
```

---

## 💻 Exemplos de Execução via Linha de Comando (CLI)

### 1. Gerar arquivos .SOR de exemplo para testes:
```bash
python generate_sample_sor.py
```

### 2. Processar um único arquivo `.SOR`:
```bash
python main.py -f amostras_otdr/exemplo_fibra_01.sor -v
```

### 3. Processar uma pasta inteira em lote:
```bash
python main.py -d amostras_otdr/ -c config_limits.yaml -o relatorios_certificacao -v
```

### 4. Opções e Flags disponíveis:
- `-f`, `--file`: Caminho de um arquivo `.SOR` individual
- `-d`, `--dir`: Caminho de um diretório para processamento em lote
- `-c`, `--config`: Arquivo de limites (`config_limits.json` ou `config_limits.yaml`)
- `-o`, `--out-dir`: Pasta onde serão salvos os relatórios gerados
- `--no-pdf`: Omitir geração de relatórios PDF
- `--no-excel`: Omitir geração de planilhas Excel
- `--no-json`: Omitir exportação JSON
- `-v`, `--verbose`: Exibir logs detalhados do processamento

---

## 📄 Exemplo e Descrição do Layout dos Relatórios Gerados

### 1. Relatório PDF (`reportlab` + `matplotlib`):
- **Cabeçalho Principal**: Título em destaque com nome da empresa/projeto.
- **Quadro de Resumo de Enlace**:
  - Dados de identificação: ID do Cabo, ID da Fibra, Comprimento de Onda, Técnico de Campo, Data/Hora.
  - Métricas do Enlace: Distância Total (km), Perda Total (dB), ORL (dB).
  - Badge de Resultado: Caixa destacada em **VERDE (APROVADO)** ou **VERMELHO (REPROVADO)**.
- **Gráfico do Traço OTDR**:
  - Curva de Atenuação (Eixo Y: Potência dB x Eixo X: Distância km).
  - Anotações visuais numeradas (`E1`, `E2`, `E3`...) indicando a localização exata de cada evento ao longo da fibra.
- **Tabela Técnica de Eventos**:
  - Colunas: `# Evento`, `Distância (km)`, `Tipo (Fusão/Conector/Fim)`, `Perda (dB)`, `Refletância (dB)`, `Status (Aprovado/Reprovado)`.

### 2. Planilha Excel (`openpyxl`):
- Aba formatada com cores institucionais, cabeçalhos de dados em azul escuro, formatação numérica de casas decimais e realce automático de células de status.

### 3. Arquivo JSON:
- Estrutura hierárquica legível contendo parâmetros fixos, parâmetros gerais, pontos brutos da curva e array de validação com motivos de reprovação (caso existam).
