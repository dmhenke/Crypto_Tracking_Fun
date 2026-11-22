import requests
import pandas as pd
import json
import datetime
from prophet import Prophet
import numpy as np
import os

# Placeholder for external driver data
def get_external_drivers():
    return pd.DataFrame({
        'ds': pd.date_range(start='2025-01-01', periods=400),
        'network_activity': np.random.randn(400) 
    })

def fetch_data():
    url = "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=365"
    response = requests.get(url)
    data = response.json()
    prices = data['prices']
    df = pd.DataFrame(prices, columns=['ds', 'y'])
    df['ds'] = pd.to_datetime(df['ds'], unit='ms')
    return df

def analyze_and_predict(df, end_date=None):
    if end_date:
        df = df[df['ds'] <= end_date]
        
    # Using Prophet for seasonality
    model = Prophet(daily_seasonality=True, yearly_seasonality=True)
    model.add_regressor('network_activity')
    
    drivers = get_external_drivers()
    df = df.merge(drivers, on='ds', how='left').fillna(0)
    
    model.fit(df)
    
    future = model.make_future_dataframe(periods=30)
    future = future.merge(drivers, on='ds', how='left').fillna(0)
    forecast = model.predict(future)
    
    current_price = float(df['y'].iloc[-1])
    pred_high = float(forecast['yhat_upper'].iloc[-1])
    pred_low = float(forecast['yhat_lower'].iloc[-1])
    
    return {
        "date": df['ds'].iloc[-1].strftime('%Y-%m-%d'),
        "price": current_price,
        "predicted_high": {"usd": pred_high, "change_usd": pred_high - current_price, "change_pct": ((pred_high - current_price) / current_price) * 100},
        "predicted_low": {"usd": pred_low, "change_usd": pred_low - current_price, "change_pct": ((pred_low - current_price) / current_price) * 100}
    }

if __name__ == "__main__":
    df = fetch_data()
    
    start_date = df['ds'].min() + pd.Timedelta(days=180)
    current_sim_date = start_date
    backtest_results = []
    
    while current_sim_date <= df['ds'].max():
        pred = analyze_and_predict(df, end_date=current_sim_date)
        
        actual_date = pd.to_datetime(pred['date']) + pd.Timedelta(weeks=1)
        actual = df[df['ds'] >= actual_date]
        if not actual.empty:
            actual_price = actual['y'].iloc[0]
            pred['actual_price_in_1_week'] = float(actual_price)
            pred['error'] = abs(pred['predicted_low']['usd'] - actual_price) 
            backtest_results.append(pred)
        
        current_sim_date += pd.Timedelta(weeks=1)
    
    # Save report
    report_path = "/Users/Morgan/Documents/Claude/Projects/eth_analysis/docs/daily_report.json"
    with open(report_path, 'w') as f:
        json.dump(backtest_results, f, indent=4)
        
    print(json.dumps(backtest_results))
