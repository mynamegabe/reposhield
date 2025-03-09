import requests
from config import WEATHER_CLIENT_ID, WEATHER_CLIENT_SECRET

class WeatherCondition:
    def __init__(self, temperature: float, condition: str):
        self.temperature = temperature
        self.condition = condition
        self.is_outdoor_friendly = self._check_outdoor_friendly()

    def _check_outdoor_friendly(self) -> bool:
        unfriendly_conditions = ['rain', 'storm', 'snow', 'extreme']
        return not any(cond in self.condition.lower() for cond in unfriendly_conditions)

async def get_forecast(location: str, num_days: str, days_skipped: str):
    url = f"https://data.api.xweather.com/forecasts/?p={location}&skip={days_skipped}&limit={num_days}&client_id={WEATHER_CLIENT_ID}&client_secret={WEATHER_CLIENT_SECRET}"
    r = requests.get(url)
    response = r.json()
    if response['success']:
        result = response['response'][0]
        return [{"weather": period['weather'], "avgTempC": period['avgTempC'], "date": period['validTime']} for period in result['periods']]
    return []