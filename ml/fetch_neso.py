"""Download NESO open data for the Great Britain load-forecasting study.

Outputs (ml/data/raw, not committed):
  demand_<year>.csv           Historic Demand Data: half-hourly national demand and embedded wind/solar
  da_forecast_performance.csv NESO day-ahead half-hourly forecast against outturn (the benchmark)
  da_forecast_history.csv     Historic day-ahead demand forecasts

Source: NESO Data Portal (api.neso.energy), NESO Open Data Licence.
"""
import json
import pathlib
import urllib.request

RAW = pathlib.Path(__file__).parent / 'data' / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'blackstart-research/0.1'}
API = 'https://api.neso.energy/api/3/action/package_show?id='


def package(pid):
    req = urllib.request.Request(API + pid, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=60))['result']['resources']


def fetch(url, out):
    if out.exists() and out.stat().st_size > 0:
        print('  cached', out.name)
        return
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(out, 'wb') as f:
        f.write(r.read())
    print(f'  {out.name}: {out.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    for res in package('historic-demand-data'):
        name = res.get('name', '')
        if name.startswith('Historic Demand Data') and res.get('format', '').upper() == 'CSV':
            year = int(name.split()[-1])
            if year >= 2018:
                fetch(res['url'], RAW / f'demand_{year}.csv')
    for res in package('day-ahead-half-hourly-demand-forecast-performance'):
        if res.get('format', '').upper() == 'CSV':
            fetch(res['url'], RAW / 'da_forecast_performance.csv')
    for res in package('1-day-ahead-demand-forecast'):
        if res.get('name', '').startswith('Historic') and res.get('format', '').upper() == 'CSV':
            fetch(res['url'], RAW / 'da_forecast_history.csv')
