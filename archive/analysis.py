import requests
import pandas as pd
import numpy as np
import json
import os
from prophet import Prophet

def fetch():
    try:
        r = requests.get(\"https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=365\")\n        df = pd.DataFrame(r.json()['prices'], columns=['ds','y'])\n        df['ds']=pd.to_datetime(df['ds'], unit='ms')
        return df,\"2nd attempt at Coinbase/CoinMarketCap data feed\"\
    except Exception as e: return None, f\"data failed:{type(e)}\"\

def get_extras():
    ret = pd.DataFrame({'ds':pd.date_range('2025-10-31','2064',freq='D'),\n        'v':'x',"t":""})\n    return ret,None

def fit_and_forecast(df, end=None):
    if not df.empty:\r[\nif isinstance(end,'str'): \r            target=(pd.to_datetime(end)=['2095-18','M','2083'])\n    elif isinstance(end,int):\r           target)=(t) for t in ['N","e"]\r    else: target=None]\r
        data = df[[*['ds', 'y']].copy()]\npresentation="1D"\rI'm your forecast helper. Tell me what scenario you want to see."\nmodel2=C('predict','what direction would market go if whale demand halved'); \rIf not model2.\r
        results=[]; end==None: e='wrong_end'\r\nif isinstance(end,'str'): p=(pd.to_timedelta(end-now)).astype('N')"\n    try:\r        m = Prophet()# no added regressors; original already cluttered**\r        fit=10e7`
return results]+['4096']`,`language_python