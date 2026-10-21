import struct
import os
import datetime

def create_sample_sor(filepath: str, cable_id="CABO-SP-01", fiber_id="FIBRA-12", wavelength=1550, num_events=4):
    """
    Gera um arquivo .SOR binário simplificado que segue a estrutura Telcordia SR-4731
    para uso em testes e homologação de rotinas.
    """
    buffer = bytearray()

    # Auxiliar para escrever strings terminadas em NULL
    def write_null_str(s: str):
        return s.encode('latin-1') + b'\x00'

    # Bloco Map
    # Map header
    map_bytes = bytearray()
    map_bytes += b"Map"
    map_bytes += struct.pack("<H", 6) # 6 blocos

    # Tabela de blocos
    blocks = [
        ("GenParams", 100, 180),
        ("SupParams", 100, 100),
        ("FxdParams", 100, 80),
        ("KeyEvents", 100, 150),
        ("LinkParams", 100, 50),
        ("DataPts", 100, 2000)
    ]

    for b_id, b_rev, b_size in blocks:
        map_bytes += write_null_str(b_id)
        map_bytes += struct.pack("<HI", b_rev, b_size)

    buffer += map_bytes

    # 1. GenParams
    gen_bytes = bytearray()
    gen_bytes += b"GenParams"
    gen_bytes += write_null_str("PT") # Language
    gen_bytes += write_null_str(cable_id)
    gen_bytes += write_null_str(fiber_id)
    gen_bytes += struct.pack("<H", wavelength)
    gen_bytes += write_null_str("Estação Central")
    gen_bytes += write_null_str("POP Destino")
    gen_bytes += write_null_str("COD-100")
    gen_bytes += write_null_str("BC-01")
    gen_bytes += write_null_str("Técnico OTDR")
    gen_bytes += write_null_str("Certificação de Campo")
    buffer += gen_bytes

    # 2. SupParams
    sup_bytes = bytearray()
    sup_bytes += b"SupParams"
    sup_bytes += write_null_str("EXFO Inc.")
    sup_bytes += write_null_str("FTB-1v2-123456")
    sup_bytes += write_null_str("FTBx-730C-789")
    sup_bytes += write_null_str("v8.32")
    buffer += sup_bytes

    # 3. FxdParams
    fxd_bytes = bytearray()
    fxd_bytes += b"FxdParams"
    now_ts = int(datetime.datetime.now().timestamp())
    fxd_bytes += struct.pack("<I", now_ts)
    fxd_bytes += b"km"
    fxd_bytes += struct.pack("<H", wavelength * 10)
    fxd_bytes += struct.pack("<i", 0) # acq_offset
    fxd_bytes += struct.pack("<H", 100) # pulse_width ns
    fxd_bytes += struct.pack("<I", 2000) # sample spacing
    fxd_bytes += struct.pack("<I", 1000) # num_points
    fxd_bytes += struct.pack("<I", 146820) # ior
    buffer += fxd_bytes

    # 4. KeyEvents
    key_bytes = bytearray()
    key_bytes += b"KeyEvents"
    key_bytes += struct.pack("<H", num_events)

    # Eventos de teste
    test_events = [
        (10000, 0, -4200, b"1R0000"),  # Conector de Entrada (1.0 km, Refl -42 dB)
        (35000, 80, -3000, b"0E0000"), # Emenda por fusão (3.5 km, Perda 0.08 dB)
        (68000, 120, -3000, b"0E0000"),# Emenda por fusão (6.8 km, Perda 0.12 dB - pode falhar se limite for 0.10)
        (120000, 450, -3000, b"999900") # Fim de Fibra (12.0 km)
    ]

    for dist, slope, refl, code in test_events[:num_events]:
        key_bytes += struct.pack("<Ihh6s", dist, slope, refl, code)

    buffer += key_bytes

    # 5. LinkParams
    link_bytes = bytearray()
    link_bytes += b"LinkParams"
    link_bytes += struct.pack("<III", 12000, 3100, 36500) # 12km, 3.1 dB total loss, 36.5 dB ORL
    buffer += link_bytes

    # 6. DataPts
    data_bytes = bytearray()
    data_bytes += b"DataPts"
    num_pts = 1000
    data_bytes += struct.pack("<IH", num_pts, 1) # scale factor = 1 -> 0.001 dB
    
    # Gerar curva simulada com atenuação e picos
    power = 35000 # 35 dB
    for i in range(num_pts):
        power -= 2 # atenuação
        if i == 100: # conector 1
            power += 5000
        elif i == 350: # fusao 1
            power -= 80
        elif i == 680: # fusao 2
            power -= 120
        elif i == 950: # fim de fibra
            power += 8000

        data_bytes += struct.pack("<H", max(0, min(65535, power)))

    buffer += data_bytes

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(buffer)

    print(f"Arquivo .SOR de exemplo criado com sucesso em: {filepath}")

if __name__ == "__main__":
    create_sample_sor("amostras_otdr/exemplo_fibra_01.sor", cable_id="CABO-SP-LESTE", fiber_id="FIBRA-01", wavelength=1550)
    create_sample_sor("amostras_otdr/exemplo_fibra_02.sor", cable_id="CABO-SP-LESTE", fiber_id="FIBRA-02", wavelength=1310)
