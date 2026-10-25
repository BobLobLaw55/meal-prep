"""Ingredient database.

Each entry: key -> dict(
  name, unit, g (grams per unit), kcal/p/c/f (per 100 g),
  price (USD per unit, rough Alachua-area estimate, Oct 2026),
  aisle, pantry ("have" = always stocked, skip on lists;
                 "check" = usually on hand, list under "check first";
                 None = buy), hint (optional buying note)
)
Nutrition values are USDA-style approximations for raw/as-purchased food.
"""

def I(name, unit, g, kcal, p, c, f, price, aisle, pantry=None, hint=None, stock=None):
    return dict(name=name, unit=unit, g=g, kcal=kcal, p=p, c=c, f=f,
                price=price, aisle=aisle, pantry=pantry, hint=hint, stock=stock)

def S(name, unit="tsp", pantry="have", price=0.05, hint=None):
    """Spice / seasoning: no meaningful macros."""
    return I(name, unit, 2.5, 0, 0, 0, 0, price, "Spices & Seasonings", pantry, hint)

DB = {
    # ---------- Meat ----------
    "beef93": I("93/7 lean ground beef", "lb", 454, 152, 21, 0, 7, 6.50, "Meat", "check", stock="groundbeef"),
    "beef90": I("90/10 ground beef", "lb", 454, 176, 20, 0, 10, 5.80, "Meat", "check", stock="groundbeef"),
    "turkey": I("93/7 ground turkey", "lb", 454, 150, 19, 0, 8, 5.00, "Meat", "check", stock="turkey"),
    "gchicken": I("ground chicken", "lb", 454, 143, 17.4, 0, 8.1, 4.80, "Meat"),
    "breast": I("boneless skinless chicken breast", "lb", 454, 120, 22.5, 0, 2.6, 3.50, "Meat", "check", stock="breast"),
    "thigh": I("boneless skinless chicken thighs", "lb", 454, 121, 19.7, 0, 4.1, 3.50, "Meat", "check", stock="thigh"),
    "sirloin": I("top sirloin steak", "lb", 454, 150, 23, 0, 6, 9.50, "Meat"),
    "chuck": I("chuck roast", "lb", 454, 180, 20, 0, 11, 7.50, "Meat"),
    "shaved": I("shaved / thin-sliced steak", "lb", 454, 170, 21, 0, 9.5, 9.00, "Meat"),

    # ---------- Dairy & eggs ----------
    "eggs": I("large eggs", "each", 50, 143, 12.6, 0.7, 9.5, 0.30, "Dairy & Eggs", "check", "18-ct carton"),
    "whites": I("liquid egg whites", "cup", 243, 52, 11, 0.7, 0, 1.10, "Dairy & Eggs", None, "32 oz carton = 4 cups"),
    "cottage": I("2% cottage cheese", "cup", 226, 81, 10.5, 4.8, 2.3, 1.50, "Dairy & Eggs", None, "24 oz tub = 3 cups"),
    "yogurt": I("plain nonfat Greek yogurt", "cup", 245, 59, 10.3, 3.6, 0.4, 1.40, "Dairy & Eggs", None, "32 oz tub = 4 cups"),
    "cheddar": I("shredded sharp cheddar", "cup", 113, 403, 23, 3, 33, 1.50, "Dairy & Eggs", "check", "8 oz bag = 2 cups"),
    "cheddar_sl": I("sliced cheddar", "slice", 21, 403, 23, 3, 33, 0.25, "Dairy & Eggs", "check"),
    "mozz": I("shredded part-skim mozzarella", "cup", 113, 295, 24, 3, 20, 1.50, "Dairy & Eggs", "check", "8 oz bag = 2 cups"),
    "provolone": I("sliced provolone", "slice", 21, 350, 26, 2, 27, 0.30, "Dairy & Eggs"),
    "parm": I("grated parmesan", "cup", 100, 420, 36, 4, 28, 3.50, "Dairy & Eggs"),
    "feta": I("crumbled feta", "cup", 150, 265, 14, 4, 21, 3.00, "Dairy & Eggs", None, "6 oz tub = 1.25 cups"),
    "creamcheese": I("light cream cheese", "oz", 28, 201, 8, 7, 15, 0.25, "Dairy & Eggs", None, "8 oz block"),
    "almondmilk": I("unsweetened almond milk", "cup", 240, 15, 0.6, 0.3, 1.2, 0.40, "Dairy & Eggs", "check"),
    "milk": I("2% milk", "cup", 244, 50, 3.3, 4.8, 2, 0.25, "Dairy & Eggs", "check"),
    "butter": I("butter", "tbsp", 14, 717, 0.9, 0.1, 81, 0.12, "Dairy & Eggs", "have"),

    # ---------- Grains, bread & pasta ----------
    "oats": I("old-fashioned rolled oats", "cup", 80, 379, 13, 68, 6.5, 0.35, "Pantry"),
    "kodiak": I("Kodiak pancake mix", "cup", 106, 358, 26.4, 56.6, 3.8, 1.20, "Pantry", "check"),
    "whey": I("vanilla whey protein", "scoop", 32, 380, 75, 10, 5, 1.00, "Pantry", None, "optional but helps hit protein"),
    "rice": I("white rice (jasmine or basmati), dry", "cup", 185, 360, 6.7, 79, 0.6, 0.45, "Pantry"),
    "pasta": I("protein pasta, dry", "oz", 28.35, 339, 17.9, 67.9, 2.7, 0.28, "Pantry", "check", "14.5 oz box"),
    "panko": I("panko breadcrumbs", "cup", 60, 390, 13, 76, 3, 0.80, "Pantry", "have"),
    "potatoes": I("Yukon gold potatoes", "lb", 454, 77, 2, 17, 0.1, 1.20, "Produce"),
    "sweetpot": I("sweet potatoes", "lb", 454, 86, 1.6, 20, 0.1, 1.30, "Produce"),
    "tortilla_lg": I("uncooked flour tortillas, burrito size (e.g., TortillaLand)", "each", 64, 312, 8, 50, 9, 0.55, "Dairy & Eggs", None, "refrigerated, near the cheese"),
    "sourdough": I("sourdough bread", "slice", 45, 270, 10, 52, 2, 0.40, "Bakery", None, "1 loaf ≈ 16 slices"),
    "sdmuffin": I("sourdough English muffins", "each", 57, 235, 8, 46, 1.5, 0.65, "Bakery", None, "6-pack"),
    "tortilla": I("uncooked flour tortillas, 8-inch (e.g., TortillaLand)", "each", 45, 312, 8, 50, 9, 0.40, "Dairy & Eggs", None, "refrigerated, near the cheese"),

    # ---------- Canned & jarred ----------
    "blackbeans": I("black beans (15 oz can)", "can", 250, 132, 8.9, 23.7, 0.5, 1.00, "Pantry"),
    "kidney": I("kidney beans (15 oz can)", "can", 250, 127, 8.7, 22.8, 0.5, 1.00, "Pantry"),
    "crushed": I("crushed tomatoes (28 oz can)", "can", 794, 32, 1.6, 7, 0.3, 1.80, "Pantry"),
    "diced": I("diced tomatoes (14.5 oz can)", "can", 411, 25, 1, 5, 0.2, 1.00, "Pantry"),
    "fireroast": I("fire-roasted diced tomatoes (14.5 oz can)", "can", 411, 25, 1, 5, 0.2, 1.30, "Pantry"),
    "tpaste": I("tomato paste", "tbsp", 16, 82, 4.3, 19, 0.5, 0.12, "Pantry", None, "6 oz can ≈ 10 tbsp"),
    "marinara": I("marinara sauce (no sugar added, 24 oz jar)", "jar", 680, 80, 1.5, 6, 5, 5.50, "Pantry"),
    "salsa": I("salsa (16 oz jar)", "jar", 454, 36, 1.5, 7, 0.2, 3.00, "Pantry"),
    "enchilada": I("red enchilada sauce (10 oz can)", "can", 283, 40, 1, 6, 1.5, 1.80, "Pantry"),
    "chiles": I("diced green chiles (4 oz can)", "can", 113, 20, 1, 4, 0, 1.00, "Pantry"),
    "chipotle": I("chipotle peppers in adobo", "each", 10, 70, 2, 10, 3, 0.25, "Pantry", None, "7 oz can; freeze the rest"),
    "broth": I("low-sodium chicken broth", "cup", 240, 5, 0.6, 0.3, 0.2, 0.60, "Pantry"),
    "beefbroth": I("low-sodium beef broth", "cup", 240, 5, 0.6, 0.3, 0.2, 0.60, "Pantry"),
    "sundried": I("sun-dried tomatoes (oil-packed)", "oz", 28, 213, 5, 23, 14, 0.60, "Pantry", None, "8.5 oz jar"),
    "pesto": I("basil pesto", "tbsp", 15, 430, 5, 7, 42, 0.30, "Pantry", None, "6 oz jar ≈ 12 tbsp"),

    # ---------- Fridge sauces & condiments (stocked) ----------
    "bbq": I("BBQ sauce", "tbsp", 17, 172, 0.8, 41, 0.6, 0.08, "Condiments", "have"),
    "hotsauce": I("hot sauce / buffalo sauce (Frank's style)", "tbsp", 15, 15, 0, 1, 0.5, 0.10, "Condiments", "have"),
    "ketchup": I("ketchup", "tbsp", 17, 101, 1, 27, 0.1, 0.04, "Condiments", "have"),
    "mustard": I("yellow mustard", "tbsp", 15, 60, 4, 6, 3, 0.04, "Condiments", "have"),
    "dijon": I("Dijon or spicy brown mustard", "tbsp", 15, 66, 4, 6, 3.3, 0.06, "Condiments", "have"),
    "worcester": I("Worcestershire sauce", "tbsp", 17, 78, 0, 19, 0, 0.10, "Condiments", "have"),
    "aminos": I("liquid aminos", "tbsp", 15, 30, 5, 2, 0, 0.15, "Condiments", "have"),
    "acv": I("apple cider vinegar", "tbsp", 15, 21, 0, 0.9, 0, 0.03, "Condiments", "have"),
    "rwv": I("red wine vinegar", "tbsp", 15, 19, 0, 0.3, 0, 0.03, "Condiments", "have"),
    "maple": I("maple syrup", "tbsp", 20, 260, 0, 67, 0, 0.25, "Condiments", "have"),
    "honey": I("honey", "tbsp", 21, 304, 0.3, 82, 0, 0.20, "Pantry"),
    "lemonjuice": I("lemon juice", "tbsp", 15, 22, 0.4, 7, 0.2, 0.08, "Condiments", "have"),
    "limejuice": I("lime juice", "tbsp", 15, 25, 0.4, 8, 0.1, 0.08, "Condiments", "have"),
    "garlic": I("minced garlic (jar)", "tbsp", 15, 149, 6.4, 33, 0.5, 0.10, "Condiments", "have"),
    "ginger": I("minced ginger (jar)", "tsp", 5, 80, 1.8, 18, 0.8, 0.10, "Condiments", "have"),
    "pickles": I("dill pickles (chips or spears)", "oz", 28, 12, 0.5, 2, 0.2, 0.15, "Condiments", "check"),
    "relish": I("dill or sweet relish", "tbsp", 15, 130, 0.4, 35, 0.5, 0.05, "Condiments", "have"),
    "oil": I("olive or avocado oil", "tbsp", 13.5, 884, 0, 0, 100, 0.15, "Pantry", "have"),
    "sesameoil": I("toasted sesame oil", "tsp", 4.5, 884, 0, 0, 100, 0.10, "Pantry"),
    "chia": I("chia seeds", "tbsp", 12, 486, 17, 42, 31, 0.20, "Pantry"),
    "vanilla": I("vanilla extract", "tsp", 4, 0, 0, 0, 0, 0.25, "Pantry", "check"),
    "bakingpowder": I("baking powder", "tsp", 4, 0, 0, 0, 0, 0.05, "Pantry", "check"),

    # ---------- Produce ----------
    "onion": I("yellow onion", "each", 150, 40, 1.1, 9.3, 0.1, 0.80, "Produce", "check"),
    "redonion": I("red onion", "each", 150, 40, 1.1, 9.3, 0.1, 0.90, "Produce"),
    "pepper": I("bell pepper", "each", 150, 26, 1, 6, 0.3, 1.00, "Produce", "check"),
    "jalapeno": I("jalapeño", "each", 15, 29, 0.9, 6.5, 0.4, 0.15, "Produce"),
    "spinach": I("baby spinach", "oz", 28, 23, 2.9, 3.6, 0.4, 0.40, "Produce", None, "5 oz clamshell"),
    "zucchini": I("zucchini", "each", 200, 17, 1.2, 3.1, 0.3, 0.90, "Produce"),
    "cucumber": I("cucumber", "each", 300, 15, 0.7, 3.6, 0.1, 0.80, "Produce"),
    "tomato": I("tomato", "each", 120, 18, 0.9, 3.9, 0.2, 0.70, "Produce"),
    "cherrytom": I("cherry or grape tomatoes", "pint", 300, 18, 0.9, 3.9, 0.2, 3.00, "Produce"),
    "romaine": I("romaine hearts", "each", 200, 17, 1.2, 3.3, 0.3, 1.20, "Produce", None, "3-pack"),
    "carrots": I("carrots", "lb", 454, 41, 0.9, 9.6, 0.2, 1.00, "Produce"),
    "celery": I("celery", "stalk", 40, 16, 0.7, 3, 0.2, 0.20, "Produce"),
    "mushrooms": I("sliced mushrooms", "oz", 28, 22, 3.1, 3.3, 0.3, 0.30, "Produce", None, "8 oz pack"),
    "avocado": I("avocado", "each", 150, 160, 2, 9, 15, 1.00, "Produce"),
    "cilantro": I("cilantro", "bunch", 50, 23, 2, 3.7, 0.5, 0.80, "Produce"),
    "parsley": I("fresh flat-leaf parsley", "bunch", 60, 36, 3, 6, 0.8, 1.00, "Produce"),
    "lime": I("lime", "each", 44, 30, 0.7, 10, 0.2, 0.40, "Produce"),
    "lemon": I("lemon", "each", 60, 29, 1.1, 9, 0.3, 0.60, "Produce"),
    "banana": I("banana", "each", 118, 89, 1.1, 23, 0.3, 0.25, "Produce"),
    "slaw": I("coleslaw mix (shredded cabbage)", "cup", 70, 25, 1.3, 5.8, 0.1, 0.30, "Produce", None, "14 oz bag ≈ 6 cups"),

    # ---------- Frozen ----------
    "berries": I("frozen mixed berries", "cup", 140, 50, 0.7, 12, 0.3, 0.90, "Frozen"),
    "corn": I("frozen corn", "cup", 140, 88, 3.3, 19, 0.8, 0.50, "Frozen", "check"),
    "peas": I("frozen peas", "cup", 140, 77, 5.4, 14, 0.4, 0.50, "Frozen", "check"),
    "broccoli": I("frozen broccoli florets", "cup", 90, 28, 2.8, 5, 0.3, 0.40, "Frozen", "check"),
    "greenbeans": I("frozen green beans", "cup", 120, 31, 1.8, 7, 0.2, 0.40, "Frozen", "check"),

    # ---------- Spices & your blends ----------
    "salt": S("kosher salt"),
    "blackpepper": S("black pepper"),
    "garlicpowder": S("garlic powder"),
    "onionpowder": S("onion powder"),
    "chilipowder": S("chili powder"),
    "paprika": S("paprika"),
    "smokedpaprika": S("smoked paprika", pantry=None, price=0.10, hint="one jar lasts months"),
    "jalapenopowder": S("jalapeño powder"),
    "garlicsalt": S("garlic salt"),
    "redpepper": S("crushed red pepper"),
    "parsleydried": S("dried parsley"),
    "cumin": S("ground cumin"),
    "cinnamon": S("ground cinnamon"),
    "turmeric": S("ground turmeric"),
    "groundmustard": S("ground mustard"),
    "oregano": S("dried oregano"),
    "italian": S("Italian seasoning", pantry=None, price=0.10, hint="one jar lasts months"),
    "garam": S("garam masala", pantry=None, price=0.15, hint="one jar lasts months"),
    "dill": S("dried dill", pantry=None, price=0.10, hint="one jar lasts months"),
    "ranchseason": S("ranch seasoning", unit="tbsp"),
    "fajita": S("fajita seasoning", unit="tbsp"),
    "danos": S("Dan-O's seasoning", unit="tsp"),
    "kindersveg": S("Kinder's veggie rub", unit="tsp"),
    "steakseason": S("steak seasoning (Kinder's Prime Steak, Montreal, or Amazing Taste Steakhouse)", unit="tbsp"),
    "woodfired": S("Kinder's wood-fired garlic", unit="tsp"),
    "kindersap": S("Kinder's all-purpose (The Blend)", unit="tsp"),
    "kinderschicken": S("Kinder's grilled chicken seasoning", unit="tbsp"),
    "burgerseason": S("Weber gourmet burger seasoning", unit="tbsp"),
    "garlicherb": S("Weber roasted garlic & herb", unit="tsp"),
    "kickinchicken": S("Weber kick'n chicken", unit="tbsp"),
    "garlicparm": S("Weber garlic parmesan", unit="tsp"),
    "butcher": S("Amazing Taste Butcher seasoning", unit="tsp"),
    "elote": S("Trader Joe's Everything but the Elote", unit="tsp"),
    "brisketrub": S("BBQ rub (brisket seasoning or Buffalo Trace blend)", unit="tbsp"),
}

# Freezer stock groups (pounds on hand, user-editable in the app)
STOCK = {
    "groundbeef": {"name": "Ground beef", "lb": 30},
    "breast": {"name": "Chicken breast", "lb": 20},
    "thigh": {"name": "Chicken thighs", "lb": 5},
    "turkey": {"name": "Ground turkey", "lb": 5},
}
