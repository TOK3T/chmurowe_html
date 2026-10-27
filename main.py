import shutil
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()
KATALOG_PROJEKTU = Path(__file__).resolve().parent


class Pomiar(BaseModel):
    tempESP: float
    humiESP: float
    pressESP: float
    aqiESP: float


ostatni_pomiar: Optional[Pomiar] = None


@app.post("/pomiary")
def odbierz_pomiar(pomiar: Pomiar):
    global ostatni_pomiar
    ostatni_pomiar = pomiar
    return {"status": "ok"}


@app.get("/pomiary")
def pobierz_pomiar():
    if ostatni_pomiar is None:
        return {"message": "Brak danych"}
    return ostatni_pomiar


def pobierz_temperature_cpu():
    plik_temperatury = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        return int(plik_temperatury.read_text().strip()) / 1000
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można odczytać temperatury CPU Raspberry Pi",
        ) from error


def pobierz_czasy_cpu():
    try:
        linia_cpu = Path("/proc/stat").read_text().splitlines()[0]
        wartosci = [int(wartosc) for wartosc in linia_cpu.split()[1:]]
        if len(wartosci) < 8:
            raise ValueError("Niepełne statystyki CPU")
    except (OSError, ValueError, IndexError) as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można odczytać użycia CPU Raspberry Pi",
        ) from error

    return sum(wartosci[:8]), wartosci[3] + wartosci[4]


def pobierz_uzycie_cpu():
    suma_przed, bezczynne_przed = pobierz_czasy_cpu()
    time.sleep(0.1)
    suma_po, bezczynne_po = pobierz_czasy_cpu()
    roznica_czasu = suma_po - suma_przed

    if roznica_czasu <= 0:
        raise HTTPException(status_code=503, detail="Nie można obliczyć użycia CPU")

    roznica_bezczynnosci = bezczynne_po - bezczynne_przed
    return round((1 - roznica_bezczynnosci / roznica_czasu) * 100, 1)


def pobierz_uzycie_ram():
    try:
        dane_pamieci = {}
        for linia in Path("/proc/meminfo").read_text().splitlines():
            nazwa, wartosc = linia.split(":", 1)
            dane_pamieci[nazwa] = int(wartosc.strip().split()[0])
        pamiec_calkowita = dane_pamieci["MemTotal"]
        pamiec_dostepna = dane_pamieci["MemAvailable"]
    except (OSError, ValueError, IndexError, KeyError) as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można odczytać użycia RAM Raspberry Pi",
        ) from error

    return round((pamiec_calkowita - pamiec_dostepna) / pamiec_calkowita * 100, 1)


def pobierz_interfejs_wifi():
    katalog_interfejsow = Path("/sys/class/net")
    try:
        interfejsy = sorted(
            interfejs
            for interfejs in katalog_interfejsow.iterdir()
            if (interfejs / "wireless").exists()
        )
    except OSError as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można odczytać interfejsu Wi-Fi Raspberry Pi",
        ) from error

    if not interfejsy:
        raise HTTPException(status_code=503, detail="Nie znaleziono interfejsu Wi-Fi")

    return interfejsy[0]


@app.get("/sensehat")
def pobierz_dane_sensehat():
    try:
        from sense_hat import SenseHat

        sense = SenseHat()
        return {
            "temp": round(sense.get_temperature(), 1),
            "humi": round(sense.get_humidity(), 1),
            "press": round(sense.get_pressure(), 1),
            "cpu_temp": round(pobierz_temperature_cpu(), 1),
        }
    except ImportError as error:
        raise HTTPException(
            status_code=503,
            detail="Brak biblioteki Sense HAT. Zainstaluj pakiet sense-hat.",
        ) from error
    except OSError as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można połączyć się z Sense HAT",
        ) from error


@app.get("/system")
def pobierz_dane_systemu():
    interfejs_wifi = pobierz_interfejs_wifi()
    statystyki_wifi = interfejs_wifi / "statistics"

    try:
        odebrane_bajty = int((statystyki_wifi / "rx_bytes").read_text().strip())
        wyslane_bajty = int((statystyki_wifi / "tx_bytes").read_text().strip())
        miejsce_na_dysku = shutil.disk_usage("/")
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=503,
            detail="Nie można odczytać statystyk systemowych Raspberry Pi",
        ) from error

    return {
        "cpu_percent": pobierz_uzycie_cpu(),
        "ram_percent": pobierz_uzycie_ram(),
        "disk_percent": round(miejsce_na_dysku.used / miejsce_na_dysku.total * 100, 1),
        "wifi_received_mb": round(odebrane_bajty / 1024**2, 1),
        "wifi_sent_mb": round(wyslane_bajty / 1024**2, 1),
    }


@app.get("/", include_in_schema=False)
def strona_glowna():
    return FileResponse(KATALOG_PROJEKTU / "index.html")


@app.get("/dane.js", include_in_schema=False)
def skrypt_strony():
    return FileResponse(KATALOG_PROJEKTU / "dane.js")


@app.get("/style.css", include_in_schema=False)
def style_strony():
    return FileResponse(KATALOG_PROJEKTU / "style.css")
