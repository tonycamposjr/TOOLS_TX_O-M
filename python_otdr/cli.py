import argparse
import os
import sys
import glob
from parser import OTDRSorParser
from validator import OTDRValidator
from report import OTDRReportGenerator

def process_file(filepath: str, validator: OTDRValidator, out_dir: str, export_pdf=True, export_excel=True, export_json=True, verbose=False):
    """Processa um único arquivo .SOR."""
    if verbose:
        print(f"\n[+] Processando: {filepath}")

    try:
        parser = OTDRSorParser(filepath)
        sor_data = parser.parse()
        
        val_result = validator.validate(sor_data)

        if verbose:
            gen = sor_data.get("general_params", {})
            fxd = sor_data.get("fixed_params", {})
            link = sor_data.get("link_params", {})
            print(f"    Cabo: {gen.get('cable_id')} | Fibra: {gen.get('fiber_id')} | WL: {fxd.get('wavelength_nm')}nm")
            print(f"    Distância Total: {link.get('total_distance_km')} km | Perda: {link.get('total_loss_db')} dB")
            print(f"    Status da Validação: {val_result.get('overall_status')}")

        report_gen = OTDRReportGenerator(sor_data, val_result)

        generated_files = []
        if export_json:
            p = report_gen.export_json(out_dir)
            generated_files.append(p)
        if export_excel:
            p = report_gen.export_excel(out_dir)
            generated_files.append(p)
        if export_pdf:
            p = report_gen.export_pdf(out_dir)
            generated_files.append(p)

        if verbose:
            print("    Arquivos gerados:")
            for f in generated_files:
                print(f"      - {f}")

        return {
            "status": "SUCCESS",
            "filepath": filepath,
            "overall": val_result.get("overall_status"),
            "outputs": generated_files
        }

    except Exception as e:
        print(f"[-] Erro ao processar arquivo '{filepath}': {e}", file=sys.stderr)
        return {
            "status": "ERROR",
            "filepath": filepath,
            "error": str(e)
        }

def run_cli():
    """Função principal da interface CLI."""
    parser = argparse.ArgumentParser(
        description="Analisador e Certificador de Arquivos OTDR (.SOR) - Telcordia SR-4731"
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-f", "--file", type=str, help="Caminho para um arquivo .SOR individual")
    group.add_argument("-d", "--dir", type=str, help="Caminho para um diretório com arquivos .SOR para processamento em lote")

    parser.add_argument("-c", "--config", type=str, default="config_limits.json", help="Arquivo de configuração de limites de aceitação (.json ou .yaml)")
    parser.add_argument("-o", "--out-dir", type=str, default="relatorios_otdr", help="Diretório de saída para os relatórios gerados")
    
    parser.add_argument("--no-pdf", action="store_true", help="Desativar geração de relatórios em PDF")
    parser.add_argument("--no-excel", action="store_true", help="Desativar geração de planilhas Excel")
    parser.add_argument("--no-json", action="store_true", help="Desativar exportação para JSON")
    parser.add_argument("-v", "--verbose", action="store_true", help="Exibir informações detalhadas durante a execução")

    args = parser.parse_args()

    validator = OTDRValidator(args.config)
    export_pdf = not args.no_pdf
    export_excel = not args.no_excel
    export_json = not args.no_json

    print("==========================================================")
    print("      ANALISADOR E CERTIFICADOR DE ARQUIVOS OTDR (.SOR)  ")
    print("==========================================================")

    if args.file:
        files = [args.file]
    else:
        files = glob.glob(os.path.join(args.dir, "*.sor")) + glob.glob(os.path.join(args.dir, "*.SOR"))

    if not files:
        print("Nenhum arquivo .SOR encontrado para processamento.")
        sys.exit(1)

    print(f"Total de arquivos a processar: {len(files)}")
    results = []

    for f in files:
        res = process_file(
            f,
            validator,
            args.out_dir,
            export_pdf=export_pdf,
            export_excel=export_excel,
            export_json=export_json,
            verbose=args.verbose
        )
        results.append(res)

    # Resumo Final
    success_count = sum(1 for r in results if r["status"] == "SUCCESS")
    approved_count = sum(1 for r in results if r.get("overall") == "APROVADO")
    reproved_count = sum(1 for r in results if r.get("overall") == "REPROVADO")

    print("\n----------------- RESUMO DO PROCESSAMENTO -----------------")
    print(f"Arquivos processados com sucesso: {success_count} / {len(files)}")
    print(f"Enlaces APROVADOS: {approved_count}")
    print(f"Enlaces REPROVADOS: {reproved_count}")
    print(f"Relatórios salvos em: {os.path.abspath(args.out_dir)}")
    print("-----------------------------------------------------------\n")

if __name__ == "__main__":
    run_cli()
