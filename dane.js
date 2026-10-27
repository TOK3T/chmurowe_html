const maxPunktowNaWykresie = 10;
const konfiguracjaWykresow = [
    { pole: 'Temp', canvasId: 'TempChart', kolor: 'rgb(255, 99, 132)' },
    { pole: 'Humi', canvasId: 'HumiChart', kolor: 'rgb(54, 162, 235)' },
    { pole: 'Press', canvasId: 'PressChart', kolor: 'rgb(75, 192, 192)' },
    { pole: 'AirCon', canvasId: 'AirConChart', kolor: 'rgb(255, 159, 64)' }
];
const wykresy = {};
const wyborMiasta = document.querySelector('.City select');
const API_KEY = '0860c69403aa231da6543b23f40ebc09';

const tytulySenseHat = [
    "Sense HAT — temperatura",
    "Sense HAT — wilgotność",
    "Sense HAT — ciśnienie",
    "Temperatura CPU"
];
const tytulyRaspberryPi = [
    "Użycie CPU",
    "Użycie RAM",
    "Zajętość dysku",
    "Transfer Wi-Fi"
];


konfiguracjaWykresow.forEach(({ pole, canvasId, kolor }) => {
    const ctx = document.getElementById(canvasId).getContext('2d');
    wykresy[pole] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: kolor,
                backgroundColor: kolor.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: false
                }
            }
        }
    });
});

function dodajDaneDoWykresu(wykres, wartosc) {
    wykres.data.labels.push('');
    wykres.data.datasets[0].data.push(wartosc);

    if (wykres.data.labels.length > maxPunktowNaWykresie) {
        wykres.data.labels.shift();
        wykres.data.datasets[0].data.shift();
    }

    wykres.update();
}

function pobierzDane(){
    fetch('/pomiary')
        .then(response => {
            if (!response.ok) throw new Error(`Błąd HTTP ${response.status}`);
            return response.json();
        })
        .then(pomiar => {
            if (pomiar.message) return;

            const data = {
                Temp: pomiar.tempESP,
                Humi: pomiar.humiESP,
                Press: pomiar.pressESP,
                AirCon: pomiar.aqiESP
            };

            Object.entries(data).forEach(([key, wartosc]) => {
                document.getElementById(key).textContent = wartosc;
            });

            konfiguracjaWykresow.forEach(({ pole }) => {
                const wartosc = Number(data[pole]);
                if (Number.isFinite(wartosc)) {
                    dodajDaneDoWykresu(wykresy[pole], wartosc);
                }
            });
            const srednie = obliczSrednie();
            konfiguracjaWykresow.forEach(({ pole }) => {
                const element = document.getElementById(`Avg${pole}`);
                if (element && srednie[pole] !== undefined) {
                    element.textContent = srednie[pole].toFixed(1);
                }
            });
        })
        .catch(error => {
            console.error('Błąd:', error);
        });
}

function obliczSrednie() {
    const wynik = {};

    konfiguracjaWykresow.forEach(({ pole }) => {
        const wartosci = wykresy[pole].data.datasets[0].data;

        if (wartosci.length > 0) {
            wynik[pole] =
                wartosci.reduce((suma, wartosc) => suma + wartosc, 0) /
                wartosci.length;
        }
    });

    return wynik;
}

let trybSenseHat = false;

async function pobierzDaneRaspberryPi() {
    const status = document.getElementById("RaspberryStatus");
    const adres = trybSenseHat ? "/sensehat" : "/system";

    try {
        const response = await fetch(adres);
        const dane = await response.json();
        if (!response.ok) {
            throw new Error(dane.detail || `Błąd HTTP ${response.status}`);
        }

        const wartosci = trybSenseHat
            ? [
                `${dane.temp} °C`,
                `${dane.humi} %`,
                `${dane.press} hPa`,
                `${dane.cpu_temp} °C`
            ]
            : [
                `${dane.cpu_percent} %`,
                `${dane.ram_percent} %`,
                `${dane.disk_percent} %`,
                `Odebrane: ${dane.wifi_received_mb} MB, wysłane: ${dane.wifi_sent_mb} MB`
            ];

        wartosci.forEach((wartosc, index) => {
            document.getElementById(`raspberryValue${index + 1}`).textContent = wartosc;
        });
        status.textContent = "";
    } catch (error) {
        status.textContent = `Nie udało się pobrać danych: ${error.message}`;
        console.error("Błąd danych Raspberry Pi:", error);
    }
}

function ustawTytuly() {
    const tytuly = trybSenseHat ? tytulySenseHat : tytulyRaspberryPi;
    tytuly.forEach((tytul, index) => {
        document.getElementById(`title${index + 1}`).textContent = tytul;
    });
    document.getElementById("modeToggle").textContent =
        trybSenseHat ? "Pokaż statystyki Raspberry Pi" : "Pokaż dane Sense HAT";
}

function przelaczDane() {
    trybSenseHat = !trybSenseHat;
    ustawTytuly();
    pobierzDaneRaspberryPi();
}

ustawTytuly();
pobierzDaneRaspberryPi();
setInterval(pobierzDaneRaspberryPi, 10000);

async function pobierzPogode(miasto) {
    const status = document.getElementById('WeatherStatus');
    status.textContent = `Pobieram pogodę dla: ${miasto}...`;

    const parametry = new URLSearchParams({
        q: `${miasto},PL`,
        appid: API_KEY,
        units: 'metric',
        lang: 'pl'
    });

    const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?${parametry}`
    );

    const dane = await response.json();

    if (!response.ok) {
        throw new Error(dane.message || `Błąd HTTP ${response.status}`);
    }

    document.getElementById('WeatherTemp').textContent = dane.main.temp.toFixed(1);
    document.getElementById('WeatherHumidity').textContent = dane.main.humidity;
    document.getElementById('WeatherPressure').textContent = dane.main.pressure;
    document.getElementById('WeatherWind').textContent = dane.wind.speed.toFixed(1);
    status.textContent = `Pogoda dla: ${dane.name}`;
}

wyborMiasta.addEventListener('change', () => {
    pobierzPogode(wyborMiasta.value)
        .catch(error => {
            document.getElementById('WeatherStatus').textContent =
                `Nie udało się pobrać pogody: ${error.message}`;
            console.error('Błąd OpenWeather:', error);
        });
});

pobierzDane();
setInterval(pobierzDane, 10000);

pobierzPogode(wyborMiasta.value).catch(error => {
    document.getElementById('WeatherStatus').textContent =
        `Nie udało się pobrać pogody: ${error.message}`;
    console.error('Błąd OpenWeather:', error);
});