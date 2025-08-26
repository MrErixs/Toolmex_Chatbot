# Query this vector database is literally the chatbot's brain
# Use LIMIT 25 so it show the top 25 matches, (use more efficiency)
# Also, vector < 0.8 means that it will speak based on ideas that are 80% similar
import psycopg2
from openai import OpenAI

def search_products(question):
    # 1. Create embedding using new API
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=question
    )
    emb = response.data[0].embedding

    # 2. Query PGVector
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nombre, extended_desc, image, embedding <-> %s::vector AS distance
        FROM products
        ORDER BY embedding <-> %s::vector < 0.8
        LIMIT 25
    """, (emb, emb))

    results = cur.fetchall()
    for row in results:
        print(row)

# Example query
search_products("¿Qué tipos de chucks tienes?")
