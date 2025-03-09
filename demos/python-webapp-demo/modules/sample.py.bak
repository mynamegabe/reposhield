from reccomender import GeminiActivityRecommender
from personality import load_profile_from_json
from quiz import run_personality_quiz
from weather import WeatherCondition
from config import GEMINI_API_KEY
import asyncio
import json

def main():
    
    # Initialize the recommender
    recommender = GeminiActivityRecommender(GEMINI_API_KEY)
    
    # Sample personality profile (in practice, this would come from your quiz)
    # run_personality_quiz()
    sample_personality  =load_profile_from_json('personality_profile.json')
    
    # Sample weather
    weather_data = {
        "Monday": [22.0, "sunny"],
        "Tuesday": [20.0, "rainy"],
        "Wednesday": [21.0, "cloudy"]
    }


    # Get recommendations
    recommendations = asyncio.run(
        recommender.get_recommendations(sample_personality.to_dict(), weather_data)
    )
    
    # Print recommendations
    for day, activities in recommendations.items():
        print(f"\n=== {day} ===")
        print(f"Weather: {weather_data[day][0]}°C, {weather_data[day][1]}")
        print("-" * 50)
        
        for i, activity in enumerate(activities, 1):
            try:
                print(f"\n{i}. {activity.get('name', 'Unnamed Activity')}")
                print(f"Description: {activity.get('description', 'No description available')}")
                print(f"Duration: {activity.get('duration_minutes', 0)} minutes")
                print("-" * 30)
            except Exception as e:
                print(f"Error printing activity {i}: {str(e)}")
                print("Raw activity data:", activity)
        
        # Save recommendations
        with open('recommendations.json', 'w') as f:
            json.dump(recommendations, f, indent=2)
            print("\nRecommendations saved to 'recommendations.json'")



if __name__ == "__main__":
    main()