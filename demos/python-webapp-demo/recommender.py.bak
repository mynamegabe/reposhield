import google.generativeai as genai
from typing import Dict, List
from modules.personality import load_profile_from_json
from modules.weather import WeatherCondition
import json
from config import GEMINI_API_KEY

class GeminiActivityRecommender:
    def __init__(self, api_key: str):
        """Initialize the Gemini API client"""
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-exp')

class GeminiActivityRecommender:
    def __init__(self, api_key: str):
        """Initialize the Gemini API client"""
        genai.configure(api_key=api_key)
        # Use the standard gemini-pro model
        self.model = genai.GenerativeModel('gemini-pro')

    def _create_prompt(self, personality: Dict, weather_days: List[Dict]) -> str:
        """Create a detailed prompt for Gemini based on personality and multiple days of weather"""
        example_response = {
            "Monday": [
                {
                    "name": "Group Hiking",
                    "description": "A moderate-intensity group hike on local trails with scenic views",
                    "duration_minutes": 120
                }
            ]
        }
        
        # Format weather conditions for each day
        weather_info = "\n".join([
            f"- {day}:\n  Temperature: {conditions[0]}°C\n  Condition: {conditions[1]}"
            for day, conditions in weather_days.items()
        ])
        
        prompt = f"""As an activity recommendation expert, suggest 3 activities for each day based on the following personality profile and weather conditions:

            Personality Traits:
            - Extraversion: {personality['extraversion']:.2f} (0-1 scale)
            - Openness: {personality['openness']:.2f}
            - Conscientiousness: {personality['conscientiousness']:.2f}
            - Agreeableness: {personality['agreeableness']:.2f}
            - Neuroticism: {personality['neuroticism']:.2f}

            Additional Preferences:
            - Energy Level: {personality['energy_level']:.2f} (0-1 scale)
            - Preferred Time: {personality['preferred_time']}
            - Social Preference: {personality['social_preference']:.2f} (0-1 scale, higher means more social)
            - Interests: {', '.join(personality['interests'])}

            Weather Conditions for Each Day:
            {weather_info}

            Note: Outdoor activities are recommended when conditions are not rainy, stormy, or snowy.

            IMPORTANT: Return a JSON object with days as keys, each containing an array of exactly 3 activities. Use this exact format:
            {json.dumps(example_response, indent=2)}

            Requirements for each field:
            - name: string, minimum 3 characters
            - description: string, minimum 10 characters
            - duration_minutes: number between 15 and 240

            RESPONSE RULES:
            1. Return ONLY the JSON array - no additional text.
            2. All numeric values must be numbers, not strings
            3. Provide exactly 3 activities
            4. Each activity must match the personality traits and weather conditions
            5. Activities should vary in type and required equipment
            6. Do not wrap response in Markdown code blocks"""

        return prompt

    def _parse_gemini_response(self, response_text: str) -> Dict[str, List[Dict]]:
        """Parse Gemini's response into structured activity data by day"""
        try:
            # Remove markdown code block markers if present
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]  # Remove ```json
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]  # Remove ```
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]  # Remove trailing ```
            
            # Parse the cleaned JSON
            cleaned_text = cleaned_text.strip()
            daily_activities = json.loads(cleaned_text)
            
            # Validate the response structure
            if not isinstance(daily_activities, dict):
                raise ValueError("Response must be a dictionary with days as keys")
                
            for day, activities in daily_activities.items():
                # Ensure each day has exactly 3 activities
                if len(activities) != 3:
                    raise ValueError(f"Expected 3 activities for {day}, but got {len(activities)}")
                
                # Validate each activity
                for activity in activities:
                    # Check for missing fields
                    required_fields = {'name', 'description', 'duration_minutes'}
                    if not all(field in activity for field in required_fields):
                        raise KeyError(f"Missing required fields in activity for {day}. Required: {required_fields}")
                    
                    # Validate types and ranges
                    if not isinstance(activity['name'], str) or len(activity['name']) < 3:
                        raise ValueError(f"Invalid name in activity for {day}: {activity['name']}")
                        
                    if not isinstance(activity['description'], str) or len(activity['description']) < 10:
                        raise ValueError(f"Invalid description in activity for {day}")

                    activity['duration_minutes'] = int(activity['duration_minutes'])
                    if not 15 <= activity['duration_minutes'] <= 240:
                        raise ValueError(f"Duration must be between 15 and 240 minutes in activity for {day}")
            
            return daily_activities
        except json.JSONDecodeError as e:
            print("Failed to parse JSON response. Raw response:", response_text)
            raise ValueError(f"Failed to parse Gemini response as JSON: {str(e)}")
        except Exception as e:
            print("Error while parsing response. Raw response:", response_text)
            raise

    async def get_recommendations(self, personality: Dict, weather: List[WeatherCondition]) -> List[Dict]:
        """Get activity recommendations using Gemini"""
        try:
            prompt = self._create_prompt(personality, weather)
            response = await self.model.generate_content_async(prompt)
            
            # Extract the text response
            response_text = response.text
            # Parse and validate the response
            activities = self._parse_gemini_response(response_text)
            
            return activities
        except Exception as e:
            raise Exception(f"Failed to get recommendations from Gemini: {str(e)}")