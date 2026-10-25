# Prep Counter

High-protein meal prep for two: 52 recipes (12 breakfasts, 9 lunches, 31 dinners) built around ground beef, chicken, and turkey, with a weekly planner, Sunday/Wednesday shopping lists, a pantry and freezer tracker, ratings, and sharing.

Live site: https://bobloblaw55.github.io/meal-prep/

## How it works

- **Dinners** make tonight's dinner plus tomorrow's lunch for both people. **Breakfasts** make 4 mornings each.
- Every recipe lists a bigger and a smaller portion with estimated macros, so both protein goals are visible at a glance.
- **Week** generates a plan that leans toward top-rated recipes and meat already in the freezer, and avoids repeats from the last two weeks. Lock what you like, and swap or reshuffle the rest.
- **List** splits shopping into the Sunday and Wednesday trips, pulls meat from the freezer first, hides stocked pantry staples, and estimates the spend.
- Ratings, notes, pantry, freezer counts, and the plan are saved on each phone. Use **More → Send my data to another phone** to sync.

## Adding or editing recipes

Recipes live in `tools/recipes_breakfast.py`, `tools/recipes_lunch.py`, and `tools/recipes_dinner.py`; serving sizes and photos in `tools/servings.py`, and ingredients (with macros and prices) in `tools/ingredients.py`. After editing, run:

```
python3 tools/build.py
```

That rebuilds `data/recipes.json` and prints protein per portion so you can sanity-check it.

Each recipe is an original write-up inspired by a well-reviewed source, which is linked on the recipe page. Macros and prices are estimates.
