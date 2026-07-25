"use client";

import React, { useState } from "react";
import { UserProfile } from "../../lib/api";
import { PriorityWeights } from "../PriorityControls";
import WelcomeStep from "./WelcomeStep";
import BiometricsStep from "./BiometricsStep";
import GoalsDietStep from "./GoalsDietStep";
import RankingStep from "./RankingStep";
import ConfirmStep from "./ConfirmStep";

interface OnboardingWizardProps {
  profile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  loading: boolean;
  priorityWeights: PriorityWeights;
  onPriorityWeightsChange: (weights: PriorityWeights) => void;
}

const STEP_LABELS = ["Welcome", "Biometrics", "Goals & Diet", "Ranking", "Confirm"];

export default function OnboardingWizard({ profile, onSave, loading, priorityWeights, onPriorityWeightsChange }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);

  const [age, setAge] = useState<string>(profile.age ? String(profile.age) : "");
  const [gender, setGender] = useState<string>(profile.gender || "male");
  const [height, setHeight] = useState<string>(profile.height_cm ? String(profile.height_cm) : "");
  const [weight, setWeight] = useState<string>(profile.weight_kg ? String(profile.weight_kg) : "");
  const [activityLevel, setActivityLevel] = useState<string>(profile.activity_level || "moderate");
  const [goal, setGoal] = useState<string>(profile.fitness_goal || "maintenance");
  const [budget, setBudget] = useState<number>(profile.meal_budget_default || 300);
  const [dietPreference, setDietPreference] = useState<string>(profile.diet_preference || "any");
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>(profile.favorite_cuisines || []);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies || []);

  const toggleCuisine = (cuisine: string) => {
    setFavoriteCuisines((prev) => (prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]));
  };

  const toggleAllergy = (allergen: string) => {
    setAllergies((prev) => (prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]));
  };

  const next = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = () => {
    onSave({
      ...profile,
      age: age ? parseInt(age) : null,
      gender,
      height_cm: height ? parseFloat(height) : null,
      weight_kg: weight ? parseFloat(weight) : null,
      activity_level: activityLevel,
      meal_budget_default: budget,
      fitness_goal: goal,
      diet_preference: dietPreference,
      favorite_cuisines: favoriteCuisines,
      allergies,
    });
  };

  const biometricsComplete = Boolean(age && height && weight);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-5">
      {step > 0 && (
        <div className="flex items-center justify-center gap-2">
          {STEP_LABELS.slice(1).map((label, idx) => {
            const stepIdx = idx + 1;
            return (
              <div
                key={label}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  stepIdx === step ? "w-8 bg-nutri" : stepIdx < step ? "w-4 bg-nutri/40" : "w-4 bg-border"
                }`}
                title={label}
              />
            );
          })}
        </div>
      )}

      {step === 0 && <WelcomeStep onNext={next} />}

      {step === 1 && (
        <BiometricsStep
          age={age}
          setAge={setAge}
          gender={gender}
          setGender={setGender}
          height={height}
          setHeight={setHeight}
          weight={weight}
          setWeight={setWeight}
          activityLevel={activityLevel}
          setActivityLevel={setActivityLevel}
          canContinue={biometricsComplete}
          onNext={next}
          onBack={back}
        />
      )}

      {step === 2 && (
        <GoalsDietStep
          goal={goal}
          setGoal={setGoal}
          budget={budget}
          setBudget={setBudget}
          dietPreference={dietPreference}
          setDietPreference={setDietPreference}
          favoriteCuisines={favoriteCuisines}
          toggleCuisine={toggleCuisine}
          allergies={allergies}
          toggleAllergy={toggleAllergy}
          onNext={next}
          onBack={back}
        />
      )}

      {step === 3 && <RankingStep weights={priorityWeights} onChange={onPriorityWeightsChange} onNext={next} onBack={back} />}

      {step === 4 && (
        <ConfirmStep
          age={age}
          goal={goal}
          dietPreference={dietPreference}
          weights={priorityWeights}
          loading={loading}
          onFinish={handleFinish}
          onBack={back}
        />
      )}
    </div>
  );
}
