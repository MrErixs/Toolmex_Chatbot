# pip install psycopg2 openai
import json
import psycopg2
from openai import OpenAI

with open("productos_pgvector.json") as f:
    products = json.load(f)

cur = conn.cursor()

for p in products:
    # Combine all text fields for embedding
    text = f"{p.get('nombre','')} {p.get('extended_desc','')} {p.get('language_item_desc','')} {p.get('language_extended_desc','')} {p.get('tech_details','')}"
    
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    emb = response.data[0].embedding

    cur.execute("""
        INSERT INTO products (
            id, item_id, nombre, tech_details, language_item_desc, language_extended_desc,
            extended_desc, product_category, product_subcategory, weight, net_weight, image, embedding
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING
    """, (
        p.get('id'), p.get('item_id'), p.get('nombre'), p.get('tech_details'), p.get('language_item_desc'),
        p.get('language_extended_desc'), p.get('extended_desc'), p.get('product_category'), p.get('product_subcategory'),
        p.get('weight'), p.get('net_weight'), p.get('image'), emb
    ))

    print(f"Producto {p['id']} procesado")

conn.commit()
cur.close()
conn.close()