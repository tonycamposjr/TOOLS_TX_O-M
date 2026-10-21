import json
import os
from typing import Dict, Any, List

class OTDRValidator:
    """
    Validador de limites de aceitação para testes de fibra óptica (OTDR).
    Compara parâmetros do enlace e eventos com regras configuráveis (.json ou .yaml).
    """

    DEFAULT_LIMITS = {
        "max_splice_loss_db": 0.10,          # Perda máx em fusão (dB)
        "max_connector_loss_db": 0.50,       # Perda máx em conector (dB)
        "max_reflectance_db": -40.0,         # Refletância máx em conector (dB) (ex: -45 dB é APROVADO, -30 dB é REPROVADO)
        "max_attenuation_1310_db_km": 0.38,  # Atenuação máx em 1310nm (dB/km)
        "max_attenuation_1550_db_km": 0.22,  # Atenuação máx em 1550nm (dB/km)
        "max_total_link_loss_db": 15.0,      # Perda total máx do enlace (dB)
        "min_link_orl_db": 30.0              # ORL mínimo (dB)
    }

    def __init__(self, config_path: str = None):
        self.limits = self.DEFAULT_LIMITS.copy()
        if config_path and os.path.exists(config_path):
            self.load_config(config_path)

    def load_config(self, config_path: str):
        """Carrega arquivo de limites JSON ou YAML."""
        try:
            if config_path.endswith(".json"):
                with open(config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.limits.update(data)
            elif config_path.endswith((".yaml", ".yml")):
                try:
                    import yaml
                    with open(config_path, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f)
                        if data:
                            self.limits.update(data)
                except ImportError:
                    print("Aviso: PyYAML não instalado. Usando JSON ou padrões.")
        except Exception as e:
            print(f"Erro ao carregar configurações de limites ({config_path}): {e}")

    def validate(self, sor_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executa a validação do arquivo OTDR processado.
        Retorna status geral (APROVADO/REPROVADO), eventos avaliados e lista de falhas.
        """
        gen_params = sor_data.get("general_params", {})
        fxd_params = sor_data.get("fixed_params", {})
        link_params = sor_data.get("link_params", {})
        events = sor_data.get("key_events", [])
        
        wavelength = fxd_params.get("wavelength_nm", gen_params.get("wavelength_nm", 1550))
        
        failures: List[str] = []
        evaluated_events = []
        
        # 1. Validação dos Eventos
        for ev in events:
            ev_status = "APROVADO"
            ev_reasons = []
            ev_type = ev.get("event_type", "")
            loss = ev.get("loss_db", 0.0)
            refl = ev.get("reflectance_db")

            # Validação de fusão / junção
            if "Emenda" in ev_type or "Fusão" in ev_type or "Junção" in ev_type:
                limit_loss = self.limits["max_splice_loss_db"]
                if isinstance(loss, (int, float)) and loss > limit_loss:
                    ev_status = "REPROVADO"
                    ev_reasons.append(f"Perda da fusão ({loss:.3f} dB) excede o limite de {limit_loss:.2f} dB")

            # Validação de conector
            elif "Conector" in ev_type:
                limit_loss = self.limits["max_connector_loss_db"]
                limit_refl = self.limits["max_reflectance_db"]

                if isinstance(loss, (int, float)) and loss > limit_loss:
                    ev_status = "REPROVADO"
                    ev_reasons.append(f"Perda do conector ({loss:.3f} dB) excede o limite de {limit_loss:.2f} dB")

                if isinstance(refl, (int, float)) and refl > limit_refl:
                    ev_status = "REPROVADO"
                    ev_reasons.append(f"Refletância ({refl:.1f} dB) está acima do limite de {limit_refl:.1f} dB")

            if ev_status == "REPROVADO":
                failures.append(f"Evento {ev.get('event_number')} ({ev_type} em {ev.get('distance_km')} km): " + ", ".join(ev_reasons))

            ev_copy = ev.copy()
            ev_copy["status"] = ev_status
            ev_copy["reasons"] = ev_reasons
            evaluated_events.append(ev_copy)

        # 2. Validação do Enlace
        tot_loss = link_params.get("total_loss_db", 0.0)
        max_tot_loss = self.limits["max_total_link_loss_db"]
        if tot_loss > max_tot_loss:
            failures.append(f"Perda total do enlace ({tot_loss:.2f} dB) excede o limite de {max_tot_loss:.2f} dB")

        orl = link_params.get("orl_db", 0.0)
        min_orl = self.limits["min_link_orl_db"]
        if isinstance(orl, (int, float)) and orl < min_orl and orl > 0:
            failures.append(f"ORL do enlace ({orl:.1f} dB) abaixo do mínimo exigido de {min_orl:.1f} dB")

        overall_status = "REPROVADO" if failures else "APROVADO"

        return {
            "overall_status": overall_status,
            "limits_used": self.limits,
            "failures": failures,
            "evaluated_events": evaluated_events
        }
