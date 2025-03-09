from typing import List, Dict, NamedTuple
import json

class QuizQuestion(NamedTuple):
    text: str
    trait: str
    scale: float  # How strongly this question correlates with the trait (-1 to 1)

def clear_screen():
    print("\n" * 50)

def get_valid_input(prompt: str, min_val: int, max_val: int) -> int:
    while True:
        try:
            value = int(input(prompt))
            if min_val <= value <= max_val:
                return value
            print(f"Please enter a number between {min_val} and {max_val}")
        except ValueError:
            print("Please enter a valid number")

def run_personality_quiz():
    """Run the personality quiz and return a profile compatible with PersonalityProfile"""
    
    questions = [
        # Extraversion questions
        QuizQuestion("I enjoy being the center of attention", "extraversion", 0.8),
        QuizQuestion("I feel energized after social interactions", "extraversion", 0.7),
        QuizQuestion("I prefer working in groups rather than alone", "extraversion", 0.6),
        
        # Openness questions
        QuizQuestion("I enjoy trying new experiences", "openness", 0.8),
        QuizQuestion("I am interested in abstract ideas", "openness", 0.7),
        QuizQuestion("I enjoy artistic and creative activities", "openness", 0.6),
        
        # Conscientiousness questions
        QuizQuestion("I like to follow a schedule", "conscientiousness", 0.8),
        QuizQuestion("I pay attention to details", "conscientiousness", 0.7),
        QuizQuestion("I keep my belongings organized", "conscientiousness", 0.6),
        
        # Agreeableness questions
        QuizQuestion("I care about others' feelings", "agreeableness", 0.8),
        QuizQuestion("I enjoy helping others", "agreeableness", 0.7),
        QuizQuestion("I try to avoid conflicts", "agreeableness", 0.6),
        
        # Neuroticism questions
        QuizQuestion("I often worry about things", "neuroticism", 0.8),
        QuizQuestion("I get stressed easily", "neuroticism", 0.7),
        QuizQuestion("My mood changes frequently", "neuroticism", 0.6),
    ]
    
    clear_screen()
    print("Welcome to the Activity Recommender Personality Quiz!")
    print("\nPart 1: Personality Assessment")
    print("Rate how much you agree with each statement (1 = Strongly Disagree, 5 = Strongly Agree)")
    print("-" * 80)
    
    responses = {}
    for q in questions:
        print(f"\n{q.text}")
        response = get_valid_input("Your rating (1-5): ", 1, 5)
        responses[q.text] = (response - 1) / 4  # Normalize to 0-1 scale
    
    # Calculate trait scores
    trait_scores = {
        "extraversion": 0,
        "openness": 0,
        "conscientiousness": 0,
        "agreeableness": 0,
        "neuroticism": 0
    }
    
    # Calculate weighted averages for each trait
    for q in questions:
        trait_scores[q.trait] += responses[q.text] * q.scale
        
    # Normalize scores
    for trait in trait_scores:
        relevant_questions = [q for q in questions if q.trait == trait]
        total_scale = sum(q.scale for q in relevant_questions)
        trait_scores[trait] /= total_scale
        trait_scores[trait] = min(max(trait_scores[trait], 0), 1)  # Clamp to 0-1
    
    clear_screen()
    print("\nPart 2: Activity Preferences")
    print("-" * 80)
    
    # Energy level
    print("\nHow would you rate your preferred energy level for activities?")
    energy_level = get_valid_input("Enter your energy level (1 = Very Low, 5 = Very High): ", 1, 5)
    energy_level = (energy_level - 1) / 4  # Normalize to 0-1
    
    # Preferred time
    print("\nWhen do you prefer to do activities?")
    time_options = ["morning", "afternoon", "evening", "any"]
    for i, option in enumerate(time_options, 1):
        print(f"{i}. {option}")
    time_choice = get_valid_input("Enter your choice (1-4): ", 1, 4)
    preferred_time = time_options[time_choice - 1]
    
    # Social preference
    print("\nDo you prefer solitary or group activities?")
    social_preference = get_valid_input("Enter your preference (1 = Completely Solitary, 5 = Always in Groups): ", 1, 5)
    social_preference = (social_preference - 1) / 4  # Normalize to 0-1
    
    # Interests
    print("\nWhat are your interests? Enter them as comma-separated values")
    print("Example: reading, hiking, cooking, music")
    print("(You can enter any interests you like)")
    
    while True:
        interests_input = input("\nYour interests: ")
        if interests_input.strip():
            # Split by comma, strip whitespace, and filter out empty strings
            interests = [interest.strip().lower() for interest in interests_input.split(',')]
            interests = [i for i in interests if i]  # Remove empty strings
            if interests:
                break
            print("Please enter at least one interest")
        else:
            print("Please enter some interests")
    
    # Create profile
    profile = {
        "extraversion": trait_scores["extraversion"],
        "openness": trait_scores["openness"],
        "conscientiousness": trait_scores["conscientiousness"],
        "agreeableness": trait_scores["agreeableness"],
        "neuroticism": trait_scores["neuroticism"],
        "interests": interests,
        "energy_level": energy_level,
        "preferred_time": preferred_time,
        "social_preference": social_preference
    }
    
    # Display results
    clear_screen()
    print("\nYour Personality Profile:")
    print("-" * 80)
    for trait, score in trait_scores.items():
        print(f"{trait.capitalize()}: {score:.2f}")
    
    print(f"\nEnergy Level: {energy_level:.2f}")
    print(f"Preferred Time: {preferred_time}")
    print(f"Social Preference: {social_preference:.2f}")
    print("Interests:", ", ".join(interests))
    
    # Save to file
    with open('personality_profile.json', 'w') as f:
        json.dump(profile, f, indent=2)
    print("\nProfile saved to 'personality_profile.json'")
    
    return profile

def main():
    profile = run_personality_quiz()


if __name__ == "__main__":
    main()