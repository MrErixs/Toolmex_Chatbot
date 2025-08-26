import pandas as pd

# Leer CSV
df = pd.read_csv("itemlist.csv")

# Obtener valores únicos de la columna 'product_subcategory'
unique_subcategories = df["product_subcategory"].dropna().unique()

# Imprimirlos
for subcategory in unique_subcategories:
    print(subcategory)
