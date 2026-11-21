"""Weather for the GB load-forecasting study, population-weighted over ten cities.

  weather_actual.csv     ERA5 reanalysis (Open-Meteo archive API), 2018 onward: for training
  weather_forecast.csv   the forecast made one day earlier (Open-Meteo previous-runs API,
                         *_previous_day1 variables): what a forecaster could know at the time
  bank_holidays.json     GOV.UK bank holidays (England and Wales, Scotland)

Open-Meteo data is CC BY 4.0. GOV.UK content is under the Open Government Licence.
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

RAW = pathlib.Path(__file__).parent / 'data' / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'blackstart-research/0.1'}

# (name, lat, lon, weight ~ metro population, millions)
CITIES = [
    ('London', 51.51, -0.13, 9.6), ('Birmingham', 52.48, -1.90, 2.9), ('Manchester', 53.48, -2.24, 2.8),
    ('Leeds', 53.80, -1.55, 1.9), ('Glasgow', 55.86, -4.25, 1.7), ('Newcastle', 54.97, -1.61, 1.1),
    ('Bristol', 51.45, -2.59, 1.0), ('Cardiff', 51.48, -3.18, 1.1), ('Edinburgh', 55.95, -3.19, 0.9),
    ('Southampton', 50.90, -1.40, 0.9),
]
VARS = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'cloud_cover', 'shortwave_radiation']


def get(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.load(urllib.request.urlopen(req, timeout=300))
        except Exception as e:  # rate limits: back off and retry
            print('   retry', attempt, e)
            time.sleep(20 * (attempt + 1))
    raise RuntimeError(url)


def weighted(frames):
    """Population-weighted mean of each variable over the cities."""
    import pandas as pd
    tot = sum(w for (_, _, _, w) in CITIES)
    out = None
    for (name, _, _, w), df in zip(CITIES, frames):
        part = df.set_index('time') * (w / tot)
        out = part if out is None else out.add(part, fill_value=0)
    return out.reset_index()


def city_series(base, start, end, var_suffix=''):
    import pandas as pd
    frames = []
    for name, lat, lon, _ in CITIES:
        q = {'latitude': lat, 'longitude': lon, 'start_date': start, 'end_date': end, 'timezone': 'UTC',
             'hourly': ','.join(v + var_suffix for v in VARS)}
        j = get(base + '?' + urllib.parse.urlencode(q))
        df = pd.DataFrame(j['hourly'])
        df.columns = [c.replace(var_suffix, '') if var_suffix else c for c in df.columns]
        df['time'] = pd.to_datetime(df['time'], utc=True)
        frames.append(df)
        print('  ', name, len(df))
        time.sleep(1.5)
    return weighted(frames)


if __name__ == '__main__':
    import pandas as pd
    a = RAW / 'weather_actual.csv'
    if not a.exists():
        print('ERA5 reanalysis')
        city_series('https://archive-api.open-meteo.com/v1/archive', '2018-01-01', '2026-11-14').to_csv(a, index=False)
    f = RAW / 'weather_forecast.csv'
    if not f.exists():
        print('day-ahead forecasts (previous runs)')
        city_series('https://previous-runs-api.open-meteo.com/v1/forecast', '2024-01-01', '2026-11-14', '_previous_day1').to_csv(f, index=False)
    b = RAW / 'bank_holidays.json'
    if not b.exists():
        req = urllib.request.Request('https://www.gov.uk/bank-holidays.json', headers=UA)
        b.write_bytes(urllib.request.urlopen(req, timeout=60).read())
        print('  bank holidays')
    for p in (a, f):
        d = pd.read_csv(p)
        print(p.name, d.shape, d['time'].min(), d['time'].max(), 'missing:', int(d.isna().sum().sum()))
