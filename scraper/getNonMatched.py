import pandas as pd
import json

# Leer CSV
df = pd.read_csv("itemlist.csv")

# Filtrar por subcategoría "Workholding" (mayúscula o minúscula)
df_workholding = df[df["product_subcategory"].str.lower() == "workholding"]

# Leer JSON
with open("productos_pgvector.json", "r", encoding="utf-8") as f:
    productos_json = json.load(f)

# Crear un set con todos los IDs del JSON
ids_json = set(p["id"] for p in productos_json)

# Verificar si todos los item_id del CSV filtrado están en el JSON
all_match = df_workholding["item_id"].apply(lambda x: x in ids_json).all()

if all_match:
    print("Todos los productos filtrados tienen al menos un match en el JSON.")
else:
    # Opcional: listar los que no tienen match
    no_match = df_workholding[~df_workholding["item_id"].isin(ids_json)]
    print(f"Productos sin match ({len(no_match)}):")
    print(no_match[["item_id", "product_subcategory"]])
