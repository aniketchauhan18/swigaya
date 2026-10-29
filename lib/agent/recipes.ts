import type { DietType } from "../swiggy/types";

/**
 * Small static recipe catalogue. Recipes only describe *what* is needed; the
 * actual products, prices and availability always come from the Swiggy
 * adapter. Nothing here is a price or an ID.
 */
export interface RecipeIngredient {
  key: string;
  label: string;
  /** Instamart search queries, tried in order (later ones act as substitutes). */
  queries: string[];
  /** Quantity needed per serving. */
  perServing: number;
  unit: "g" | "ml" | "pcs";
  /** Words in the user's pantry list that mean they already have this. */
  pantryKeys: string[];
  /** Substitute queries are only allowed for these diets (e.g. tofu for paneer for vegans). */
  substituteDiets?: string[];
  /** Buy one product for EVERY query instead of treating later queries as substitutes. */
  buyAll?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  diet: DietType;
  prepMinutes: number;
  meal: Array<"breakfast" | "lunch" | "dinner" | "snack">;
  tags: string[];
  proteinPerServing: number;
  ingredients: RecipeIngredient[];
}

const SPICES: RecipeIngredient = {
  key: "spices",
  label: "basic spices (haldi, chilli, jeera, salt)",
  queries: ["turmeric", "red chilli", "jeera"],
  buyAll: true,
  perServing: 3,
  unit: "g",
  pantryKeys: ["spice", "masala", "turmeric", "haldi", "jeera", "cumin", "chilli powder", "salt"],
};

const OIL: RecipeIngredient = {
  key: "oil",
  label: "cooking oil / ghee",
  queries: ["oil", "ghee"],
  perServing: 10,
  unit: "ml",
  pantryKeys: ["oil", "ghee", "butter", "spice", "cooking basics"],
};

const RICE: RecipeIngredient = {
  key: "rice",
  label: "rice",
  queries: ["rice"],
  perServing: 80,
  unit: "g",
  pantryKeys: ["rice", "chawal"],
};

const ONION: RecipeIngredient = {
  key: "onion",
  label: "onion",
  queries: ["onion"],
  perServing: 50,
  unit: "g",
  pantryKeys: ["onion", "pyaz"],
};

const TOMATO: RecipeIngredient = {
  key: "tomato",
  label: "tomato",
  queries: ["tomato"],
  perServing: 60,
  unit: "g",
  pantryKeys: ["tomato", "tamatar"],
};

const DAL: RecipeIngredient = {
  key: "dal",
  label: "dal",
  queries: ["toor dal", "moong dal", "masoor dal"],
  perServing: 50,
  unit: "g",
  pantryKeys: ["dal", "lentil", "toor", "moong", "masoor", "arhar"],
};

export const RECIPES: Recipe[] = [
  {
    id: "masala_khichdi",
    name: "Masala Khichdi with Curd",
    description: "One-pot rice and dal khichdi with onion-tomato tadka. Ready in a single pressure cooker.",
    diet: "veg",
    prepMinutes: 25,
    meal: ["lunch", "dinner"],
    tags: ["comfort", "one-pot", "dal", "rice"],
    proteinPerServing: 14,
    ingredients: [
      { ...RICE, perServing: 60 },
      { ...DAL, queries: ["moong dal", "toor dal"], perServing: 40 },
      ONION,
      TOMATO,
      { key: "curd", label: "curd", queries: ["curd"], perServing: 100, unit: "g", pantryKeys: ["curd", "dahi", "yogurt"] },
      SPICES,
      OIL,
    ],
  },
  {
    id: "dal_tadka_rice",
    name: "Dal Tadka with Jeera Rice",
    description: "Classic toor dal tempered with garlic, jeera and tomato, served with jeera rice.",
    diet: "vegan",
    prepMinutes: 35,
    meal: ["lunch", "dinner"],
    tags: ["dal", "rice", "comfort", "classic"],
    proteinPerServing: 13,
    ingredients: [
      RICE,
      DAL,
      ONION,
      TOMATO,
      { key: "garlic", label: "garlic", queries: ["garlic"], perServing: 5, unit: "g", pantryKeys: ["garlic", "lehsun"] },
      SPICES,
      OIL,
    ],
  },
  {
    id: "veg_pulao_raita",
    name: "Vegetable Pulao with Raita",
    description: "Fragrant pulao with peas and mixed vegetables, with a quick curd raita.",
    diet: "veg",
    prepMinutes: 30,
    meal: ["lunch", "dinner"],
    tags: ["rice", "pulao"],
    proteinPerServing: 9,
    ingredients: [
      RICE,
      { key: "veg", label: "mixed vegetables", queries: ["mixed vegetables", "green peas"], perServing: 100, unit: "g", pantryKeys: ["vegetable", "veggies", "peas"] },
      ONION,
      { key: "curd", label: "curd", queries: ["curd"], perServing: 100, unit: "g", pantryKeys: ["curd", "dahi", "yogurt"] },
      SPICES,
      OIL,
    ],
  },
  {
    id: "paneer_bhurji_roti",
    name: "Paneer Bhurji with Roti",
    description: "Scrambled paneer with onion and tomato, served with fresh rotis. High in protein.",
    diet: "veg",
    prepMinutes: 25,
    meal: ["lunch", "dinner"],
    tags: ["paneer", "high-protein", "quick"],
    proteinPerServing: 24,
    ingredients: [
      { key: "atta", label: "atta (wheat flour)", queries: ["atta"], perServing: 80, unit: "g", pantryKeys: ["atta", "flour", "roti", "wheat"] },
      { key: "paneer", label: "paneer", queries: ["paneer", "tofu"], perServing: 80, unit: "g", pantryKeys: ["paneer"], substituteDiets: ["vegan"] },
      ONION,
      TOMATO,
      SPICES,
      OIL,
    ],
  },
  {
    id: "soya_pulao",
    name: "Soya Chunk Pulao",
    description: "Protein-rich pulao with soya chunks, onion and tomato.",
    diet: "vegan",
    prepMinutes: 25,
    meal: ["lunch", "dinner"],
    tags: ["high-protein", "rice", "vegan"],
    proteinPerServing: 22,
    ingredients: [
      RICE,
      { key: "soya", label: "soya chunks", queries: ["soya chunks"], perServing: 30, unit: "g", pantryKeys: ["soya", "nutrela"] },
      ONION,
      TOMATO,
      SPICES,
      OIL,
    ],
  },
  {
    id: "egg_bhurji_bread",
    name: "Egg Bhurji with Toast",
    description: "Spicy scrambled eggs with onion and tomato, with buttered toast. 15 minutes.",
    diet: "egg",
    prepMinutes: 15,
    meal: ["breakfast", "lunch", "dinner", "snack"],
    tags: ["egg", "quick", "high-protein"],
    proteinPerServing: 18,
    ingredients: [
      { key: "egg", label: "eggs", queries: ["eggs"], perServing: 2, unit: "pcs", pantryKeys: ["egg", "anda"] },
      { key: "bread", label: "bread", queries: ["bread"], perServing: 80, unit: "g", pantryKeys: ["bread", "pav"] },
      ONION,
      TOMATO,
      SPICES,
      OIL,
    ],
  },
  {
    id: "besan_chilla",
    name: "Besan Chilla with Onion & Tomato",
    description: "Savoury gram flour pancakes. Very quick and filling.",
    diet: "vegan",
    prepMinutes: 15,
    meal: ["breakfast", "lunch", "dinner", "snack"],
    tags: ["quick", "vegan", "protein"],
    proteinPerServing: 12,
    ingredients: [
      { key: "besan", label: "besan (gram flour)", queries: ["besan"], perServing: 70, unit: "g", pantryKeys: ["besan", "gram flour"] },
      ONION,
      TOMATO,
      SPICES,
      OIL,
    ],
  },
  {
    id: "veg_poha",
    name: "Onion-Potato Poha",
    description: "Light, quick poha with potato and a squeeze of lemon.",
    diet: "vegan",
    prepMinutes: 15,
    meal: ["breakfast", "snack", "dinner"],
    tags: ["quick", "light", "vegan"],
    proteinPerServing: 6,
    ingredients: [
      { key: "poha", label: "poha", queries: ["poha"], perServing: 70, unit: "g", pantryKeys: ["poha"] },
      ONION,
      { key: "potato", label: "potato", queries: ["potato"], perServing: 80, unit: "g", pantryKeys: ["potato", "aloo"] },
      { key: "lemon", label: "lemon", queries: ["lemon"], perServing: 1, unit: "pcs", pantryKeys: ["lemon", "nimbu"] },
      SPICES,
      OIL,
    ],
  },
  {
    id: "chicken_curry_rice",
    name: "Chicken Curry with Rice",
    description: "Home-style onion-tomato chicken curry with steamed rice.",
    diet: "nonveg",
    prepMinutes: 45,
    meal: ["lunch", "dinner"],
    tags: ["chicken", "high-protein"],
    proteinPerServing: 32,
    ingredients: [
      RICE,
      { key: "chicken", label: "chicken curry cut", queries: ["chicken"], perServing: 150, unit: "g", pantryKeys: ["chicken"] },
      ONION,
      TOMATO,
      { key: "garlic", label: "garlic", queries: ["garlic"], perServing: 5, unit: "g", pantryKeys: ["garlic"] },
      SPICES,
      OIL,
    ],
  },
];
