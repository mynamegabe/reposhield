from typing import Dict, List
import json

class PersonalityProfile:
    def __init__(
        self,
        extraversion: float,
        openness: float,
        conscientiousness: float,
        agreeableness: float,
        neuroticism: float,
        interests: List[str],
        energy_level: float,
        preferred_time: str,
        social_preference: float
    ):
        self.extraversion = extraversion
        self.openness = openness
        self.conscientiousness = conscientiousness
        self.agreeableness = agreeableness
        self.neuroticism = neuroticism
        self.interests = interests
        self.energy_level = energy_level
        self.preferred_time = preferred_time
        self.social_preference = social_preference

    def to_dict(self) -> Dict:
        return {
            'extraversion': self.extraversion,
            'openness': self.openness,
            'conscientiousness': self.conscientiousness,
            'agreeableness': self.agreeableness,
            'neuroticism': self.neuroticism,
            'interests': self.interests,
            'energy_level': self.energy_level,
            'preferred_time': self.preferred_time,
            'social_preference': self.social_preference
        }

def load_profile_from_json(filepath: str) -> PersonalityProfile:
    """Load a personality profile from a JSON file."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        return PersonalityProfile(
            extraversion=data['extraversion'],
            openness=data['openness'],
            conscientiousness=data['conscientiousness'],
            agreeableness=data['agreeableness'],
            neuroticism=data['neuroticism'],
            interests=data['interests'],
            energy_level=data['energy_level'],
            preferred_time=data['preferred_time'],
            social_preference=data['social_preference']
        )
    except FileNotFoundError:
        print(f"Error: Could not find file {filepath}")
        return None
    except json.JSONDecodeError:
        print(f"Error: {filepath} is not a valid JSON file")
        return None
    except KeyError as e:
        print(f"Error: Missing required field in JSON file: {e}")
        return None
