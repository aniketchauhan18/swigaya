import type { DietType, GroceryItem, MenuItem, Restaurant } from "./types";

// Fictional but realistic Indian restaurants, dishes and Instamart products.
// IDs are stable so approved carts can be replayed exactly.

export const MOCK_RESTAURANTS: Restaurant[] = [
  { id: "rest_1001", name: "Annapurna Pure Veg Thali", cuisines: ["North Indian", "Thali"], rating: 4.4, etaMinutes: 28, area: "Koramangala", pureVeg: true, open: true },
  { id: "rest_1002", name: "Dum Pukht Biryani House", cuisines: ["Biryani", "Mughlai"], rating: 4.3, etaMinutes: 35, area: "Indiranagar", pureVeg: false, open: true },
  { id: "rest_1003", name: "Punjabi Tadka Dhaba", cuisines: ["North Indian", "Punjabi"], rating: 4.2, etaMinutes: 32, area: "HSR Layout", pureVeg: false, open: true },
  { id: "rest_1004", name: "South Spice Express", cuisines: ["South Indian", "Dosa"], rating: 4.5, etaMinutes: 25, area: "Jayanagar", pureVeg: true, open: true },
  { id: "rest_1005", name: "Kathi Roll Junction", cuisines: ["Rolls", "Street Food"], rating: 4.1, etaMinutes: 22, area: "BTM Layout", pureVeg: false, open: true },
  { id: "rest_1006", name: "Pizza Fiesta", cuisines: ["Pizza", "Italian"], rating: 4.0, etaMinutes: 30, area: "Koramangala", pureVeg: false, open: true },
  { id: "rest_1007", name: "Wok & Wonton", cuisines: ["Chinese", "Indo-Chinese"], rating: 3.9, etaMinutes: 27, area: "Indiranagar", pureVeg: false, open: true },
  { id: "rest_1008", name: "Bowl Sattva", cuisines: ["Healthy", "Salads", "Bowls"], rating: 4.5, etaMinutes: 33, area: "Whitefield", pureVeg: false, open: true },
  { id: "rest_1009", name: "Hyderabadi Kitchen", cuisines: ["Biryani", "Hyderabadi"], rating: 4.3, etaMinutes: 42, area: "Marathahalli", pureVeg: false, open: true },
  { id: "rest_1010", name: "Chaat Corner", cuisines: ["Chaat", "Snacks"], rating: 4.2, etaMinutes: 18, area: "Jayanagar", pureVeg: true, open: true },
  { id: "rest_1011", name: "Midnight Burger Co", cuisines: ["Burgers", "Fast Food"], rating: 3.8, etaMinutes: 24, area: "HSR Layout", pureVeg: false, open: false },
];

const R = Object.fromEntries(MOCK_RESTAURANTS.map((r) => [r.id, r.name]));

function m(
  restaurantId: string,
  id: string,
  name: string,
  priceInr: number,
  dietType: DietType,
  proteinGrams: number | null,
  tags: string[],
  description: string,
  serves = 1,
  rating: number | null = null,
): MenuItem {
  return {
    id,
    restaurantId,
    restaurantName: R[restaurantId],
    name,
    priceInr,
    dietType,
    rating,
    description,
    proteinGrams,
    tags,
    inStock: true,
    requiresCustomization: false,
    serves,
  };
}

export const MOCK_MENU: MenuItem[] = [
  // Annapurna Pure Veg Thali
  m("rest_1001", "mi_1001_01", "Mini Veg Thali (2 roti, dal, sabzi, rice)", 169, "veg", 16, ["thali", "dinner", "lunch", "comfort"], "Complete meal with seasonal sabzi, dal tadka, rice, 2 rotis and salad.", 1, 4.4),
  m("rest_1001", "mi_1001_02", "Dal Tadka + Jeera Rice", 139, "veg", 14, ["dal", "rice", "dinner", "comfort"], "Yellow dal tempered with ghee and jeera, with steamed jeera rice.", 1, 4.3),
  m("rest_1001", "mi_1001_03", "Paneer Butter Masala + 2 Butter Roti", 219, "veg", 24, ["paneer", "dinner", "high-protein"], "Creamy tomato gravy paneer with two butter rotis.", 1, 4.5),
  m("rest_1001", "mi_1001_04", "Rajma Chawal", 129, "veg", 15, ["rajma", "rice", "lunch", "dinner"], "Punjabi-style rajma with steamed rice.", 1, 4.2),
  m("rest_1001", "mi_1001_05", "Gulab Jamun (2 pcs)", 59, "veg", 3, ["dessert"], "Warm gulab jamun.", 1, 4.4),
  m("rest_1001", "mi_1001_06", "Full Veg Thali (family)", 449, "veg", 48, ["thali", "family", "dinner"], "Large thali for 3 with paneer, dal, two sabzis, rice, rotis and sweet.", 3, 4.4),

  // Dum Pukht Biryani House
  m("rest_1002", "mi_1002_01", "Chicken Dum Biryani", 289, "nonveg", 32, ["biryani", "dinner", "lunch", "high-protein"], "Hyderabadi-style chicken dum biryani with raita.", 1, 4.4),
  m("rest_1002", "mi_1002_02", "Veg Dum Biryani", 219, "veg", 12, ["biryani", "dinner", "lunch"], "Fragrant basmati layered with vegetables, with raita.", 1, 4.1),
  m("rest_1002", "mi_1002_03", "Egg Biryani", 229, "egg", 22, ["biryani", "egg", "lunch"], "Biryani with boiled eggs and raita.", 1, 4.0),
  m("rest_1002", "mi_1002_04", "Paneer Tikka Biryani", 259, "veg", 22, ["biryani", "paneer", "high-protein"], "Smoky paneer tikka layered biryani.", 1, 4.2),

  // Punjabi Tadka Dhaba
  m("rest_1003", "mi_1003_01", "Dal Makhani + 2 Tandoori Roti", 209, "veg", 18, ["dal", "dinner", "comfort"], "Slow-cooked black dal with two tandoori rotis.", 1, 4.3),
  m("rest_1003", "mi_1003_02", "Butter Chicken + 2 Butter Naan", 329, "nonveg", 34, ["chicken", "dinner", "high-protein"], "Classic butter chicken with two butter naans.", 1, 4.4),
  m("rest_1003", "mi_1003_03", "Paneer Lababdar + 2 Tandoori Roti", 249, "veg", 25, ["paneer", "dinner", "high-protein"], "Rich paneer curry with two rotis.", 1, 4.2),
  m("rest_1003", "mi_1003_04", "Chole Bhature", 159, "veg", 17, ["chole", "lunch", "heavy"], "Two bhature with spicy chole, pickle and onion.", 1, 4.1),
  m("rest_1003", "mi_1003_05", "Egg Curry + 2 Roti", 179, "egg", 20, ["egg", "dinner", "high-protein"], "Home-style egg curry with two rotis.", 1, 4.0),

  // South Spice Express
  m("rest_1004", "mi_1004_01", "Masala Dosa", 99, "veg", 8, ["dosa", "breakfast", "dinner", "light"], "Crisp dosa with potato masala, sambar and chutneys.", 1, 4.6),
  m("rest_1004", "mi_1004_02", "Idli Vada Combo (2 idli, 1 vada)", 89, "veg", 9, ["idli", "breakfast", "light"], "Soft idlis and crisp medu vada with sambar.", 1, 4.5),
  m("rest_1004", "mi_1004_03", "Curd Rice", 79, "veg", 7, ["rice", "light", "comfort"], "Cooling curd rice with pomegranate and tempering.", 1, 4.3),
  m("rest_1004", "mi_1004_04", "Mini Meals (rice, sambar, rasam, poriyal, curd)", 149, "veg", 13, ["meals", "lunch", "dinner"], "South Indian mini meals.", 1, 4.4),
  m("rest_1004", "mi_1004_05", "Rava Onion Dosa", 109, "veg", 8, ["dosa", "dinner", "light"], "Crispy rava dosa with onions.", 1, 4.4),
  m("rest_1004", "mi_1004_06", "Filter Coffee", 45, "veg", 2, ["beverage"], "South Indian filter coffee.", 1, 4.6),

  // Kathi Roll Junction
  m("rest_1005", "mi_1005_01", "Paneer Tikka Roll", 149, "veg", 16, ["roll", "paneer", "dinner", "high-protein"], "Paneer tikka with onions and mint chutney in a paratha wrap.", 1, 4.1),
  m("rest_1005", "mi_1005_02", "Egg Roll (double egg)", 99, "egg", 14, ["roll", "egg", "quick"], "Double egg roll.", 1, 4.2),
  m("rest_1005", "mi_1005_03", "Chicken Kathi Roll", 159, "nonveg", 22, ["roll", "chicken", "high-protein"], "Chicken seekh kathi roll.", 1, 4.1),
  m("rest_1005", "mi_1005_04", "Aloo Masala Roll", 89, "veg", 7, ["roll", "budget"], "Spiced potato roll.", 1, 3.9),

  // Pizza Fiesta
  m("rest_1006", "mi_1006_01", "Margherita Pizza (Medium)", 249, "veg", 18, ["pizza", "dinner"], "Classic margherita, 8 inch.", 2, 4.0),
  m("rest_1006", "mi_1006_02", "Farmhouse Pizza (Medium)", 329, "veg", 20, ["pizza", "dinner"], "Capsicum, onion, mushroom, tomato.", 2, 4.1),
  m("rest_1006", "mi_1006_03", "Garlic Bread (4 pcs)", 119, "veg", 6, ["side"], "Cheesy garlic bread.", 1, 4.0),

  // Wok & Wonton
  m("rest_1007", "mi_1007_01", "Veg Hakka Noodles", 149, "veg", 9, ["noodles", "dinner"], "Wok-tossed hakka noodles.", 1, 3.9),
  m("rest_1007", "mi_1007_02", "Veg Fried Rice + Manchurian Gravy", 199, "veg", 11, ["rice", "dinner"], "Veg fried rice with manchurian gravy.", 1, 3.9),
  m("rest_1007", "mi_1007_03", "Chilli Chicken + Fried Rice", 269, "nonveg", 30, ["chicken", "dinner"], "Dry chilli chicken with egg fried rice.", 1, 4.0),

  // Bowl Sattva
  m("rest_1008", "mi_1008_01", "Paneer Tikka Protein Bowl", 259, "veg", 32, ["bowl", "high-protein", "healthy", "lunch", "dinner"], "Paneer tikka, brown rice, sauteed veggies, hummus.", 1, 4.6),
  m("rest_1008", "mi_1008_02", "Chickpea Quinoa Power Bowl", 239, "vegan", 24, ["bowl", "high-protein", "healthy", "vegan", "lunch"], "Chickpeas, quinoa, roasted veggies, tahini dressing.", 1, 4.5),
  m("rest_1008", "mi_1008_03", "Grilled Chicken Protein Bowl", 299, "nonveg", 42, ["bowl", "high-protein", "healthy", "lunch", "dinner"], "Grilled chicken, brown rice, greens.", 1, 4.5),
  m("rest_1008", "mi_1008_04", "Sprouts & Soya Chaat Salad", 169, "vegan", 18, ["salad", "high-protein", "healthy", "vegan", "light"], "Sprouted moong, soya chunks, veggies and lemon.", 1, 4.3),

  // Hyderabadi Kitchen
  m("rest_1009", "mi_1009_01", "Mutton Dum Biryani", 389, "nonveg", 36, ["biryani", "dinner"], "Mutton dum biryani with salan and raita.", 1, 4.3),
  m("rest_1009", "mi_1009_02", "Veg Biryani + Mirchi Ka Salan", 199, "veg", 11, ["biryani", "dinner"], "Veg biryani with mirchi ka salan.", 1, 4.0),

  // Chaat Corner
  m("rest_1010", "mi_1010_01", "Pav Bhaji", 119, "veg", 10, ["pavbhaji", "dinner", "quick"], "Buttery pav bhaji with two pavs.", 1, 4.2),
  m("rest_1010", "mi_1010_02", "Dahi Puri (6 pcs)", 79, "veg", 5, ["chaat", "snack"], "Dahi puri.", 1, 4.1),
  m("rest_1010", "mi_1010_03", "Samosa Chaat", 89, "veg", 7, ["chaat", "snack"], "Samosa with chole, chutneys and curd.", 1, 4.2),

  // Closed restaurant item (should never be recommended)
  m("rest_1011", "mi_1011_01", "Classic Veg Burger", 119, "veg", 9, ["burger"], "Veg patty burger.", 1, 3.8),
];

const g = (
  id: string,
  name: string,
  brand: string | null,
  priceInr: number,
  packSize: number,
  packUnit: "g" | "ml" | "pcs",
  category: string,
  dietType: DietType = "vegan",
  inStock = true,
  etaMinutes = 12,
): GroceryItem => ({ id, name, brand, priceInr, packSize, packUnit, category, dietType, inStock, etaMinutes });

export const MOCK_GROCERIES: GroceryItem[] = [
  // staples
  g("gro_2001", "Basmati Rice 1 kg", "India Gate", 139, 1000, "g", "rice"),
  g("gro_2002", "Sona Masoori Rice 1 kg", "Fortune", 69, 1000, "g", "rice"),
  g("gro_2003", "Toor Dal 500 g", "Tata Sampann", 89, 500, "g", "dal"),
  g("gro_2004", "Moong Dal (Yellow) 500 g", "Tata Sampann", 79, 500, "g", "dal"),
  g("gro_2005", "Masoor Dal 500 g", "Fortune", 59, 500, "g", "dal"),
  g("gro_2006", "Whole Wheat Atta 1 kg", "Aashirvaad", 55, 1000, "g", "atta"),
  g("gro_2007", "Poha (Thick) 500 g", "Tata Sampann", 45, 500, "g", "poha"),
  g("gro_2008", "Besan 500 g", "Tata Sampann", 70, 500, "g", "besan"),
  g("gro_2009", "Suji / Rava 500 g", "Aashirvaad", 42, 500, "g", "rava"),
  g("gro_2010", "Kabuli Chana 500 g", "Tata Sampann", 80, 500, "g", "chana"),
  g("gro_2011", "Rajma Chitra 500 g", "Tata Sampann", 110, 500, "g", "rajma"),
  g("gro_2012", "Soya Chunks 200 g", "Nutrela", 45, 200, "g", "soya"),
  // dairy / protein
  g("gro_2020", "Fresh Paneer 200 g", "Amul", 95, 200, "g", "paneer", "veg"),
  g("gro_2021", "Fresh Paneer 400 g", "Milky Mist", 175, 400, "g", "paneer", "veg"),
  g("gro_2022", "Tofu 200 g", "Greenfield", 99, 200, "g", "tofu", "vegan"),
  g("gro_2023", "Fresh Curd 400 g", "Amul Masti", 45, 400, "g", "curd", "veg"),
  g("gro_2024", "Farm Eggs 6 pcs", "Eggoz", 54, 6, "pcs", "egg", "egg"),
  g("gro_2025", "Farm Eggs 12 pcs", "Eggoz", 102, 12, "pcs", "egg", "egg"),
  g("gro_2026", "Toned Milk 500 ml", "Nandini", 27, 500, "ml", "milk", "veg"),
  g("gro_2027", "Butter 100 g", "Amul", 60, 100, "g", "butter", "veg"),
  g("gro_2028", "Chicken Curry Cut 500 g", "Licious", 175, 500, "g", "chicken", "nonveg", true, 25),
  g("gro_2029", "Whole Wheat Bread 400 g", "Britannia", 45, 400, "g", "bread", "veg"),
  // veg
  g("gro_2040", "Onion 1 kg", "Fresh", 42, 1000, "g", "onion"),
  g("gro_2041", "Tomato 500 g", "Fresh", 38, 500, "g", "tomato"),
  g("gro_2042", "Potato 1 kg", "Fresh", 36, 1000, "g", "potato"),
  g("gro_2043", "Green Peas (Frozen) 500 g", "Safal", 85, 500, "g", "peas"),
  g("gro_2044", "Capsicum 250 g", "Fresh", 30, 250, "g", "capsicum"),
  g("gro_2045", "Cauliflower 500 g", "Fresh", 40, 500, "g", "cauliflower"),
  g("gro_2046", "Mixed Vegetables Pack 500 g", "Fresh", 69, 500, "g", "mixveg"),
  g("gro_2047", "Fresh Spinach (Palak) 250 g", "Fresh", 25, 250, "g", "spinach", "vegan", false),
  g("gro_2048", "Garlic 100 g", "Fresh", 28, 100, "g", "garlic"),
  g("gro_2049", "Ginger 100 g", "Fresh", 20, 100, "g", "ginger"),
  g("gro_2050", "Green Chilli 100 g", "Fresh", 15, 100, "g", "greenchilli"),
  g("gro_2051", "Coriander Leaves 100 g", "Fresh", 15, 100, "g", "coriander"),
  g("gro_2052", "Lemon 4 pcs", "Fresh", 22, 4, "pcs", "lemon"),
  g("gro_2053", "Cucumber 500 g", "Fresh", 28, 500, "g", "cucumber"),
  // spices / oils
  g("gro_2060", "Turmeric Powder 100 g", "Everest", 38, 100, "g", "turmeric"),
  g("gro_2061", "Red Chilli Powder 100 g", "Everest", 45, 100, "g", "chillipowder"),
  g("gro_2062", "Garam Masala 50 g", "MDH", 55, 50, "g", "garammasala"),
  g("gro_2063", "Jeera (Cumin Seeds) 100 g", "Tata Sampann", 60, 100, "g", "jeera"),
  g("gro_2064", "Salt 1 kg", "Tata", 28, 1000, "g", "salt"),
  g("gro_2065", "Refined Sunflower Oil 1 L", "Fortune", 165, 1000, "ml", "oil"),
  g("gro_2066", "Desi Ghee 200 ml", "Amul", 140, 200, "ml", "ghee", "veg"),
  // misc
  g("gro_2070", "Instant Noodles 4 pack", "Maggi", 56, 4, "pcs", "noodles", "veg"),
  g("gro_2071", "Banana (Robusta) 6 pcs", "Fresh", 45, 6, "pcs", "banana"),
];

export function matchesQuery(text: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}
