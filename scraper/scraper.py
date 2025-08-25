# pip install selenium webdriver-manager pandas
# <-- item-single.csv || itemlist.csv ==> producto.json || productos_pgvector.js
# <-- (critical) Recuerda colocar la versión de chrome que tienes instalada

# driver = webdriver.Chrome(
#    service=Service(ChromeDriverManager(driver_version="139.0.7258.139").install()),
#    options=options
#)

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Leer CSV
df = pd.read_csv("item-single.csv")  # <-- CSV con tech_details

# Columnas a copiar del CSV
csv_cols = ["language_item_desc","language_extended_desc","product_category",
            "product_subcategory","item_id","extended_desc","weight","net_weight"]

# Función que procesa un solo producto
def procesar_producto(row):
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    service = Service(ChromeDriverManager(driver_version="139.0.7258.139").install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(15)

    producto_pgvector = {}
    url = row["tech_details"]

    try:
        driver.get(url)
        wait = WebDriverWait(driver, 10)

        # Nombre
        nombre = wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1"))).text
        # ID desde URL
        prod_id = url.split("itemid=")[-1]

        # Imagen
        try:
            image = driver.find_element(By.CSS_SELECTOR,
                "#content > div > div.SKUDetailContainer > div:nth-child(2) > div.SKUDetailLeft.col-4 > div.SKUDetailImage > div > div > div > a > img"
            ).get_attribute("src")
        except:
            image = row.get("image_link", "")

        # Características técnicas
        try:
            caracteristicas = driver.find_element(By.CSS_SELECTOR, "#tech-inner").text
        except:
            caracteristicas = row.get("tech_details", "")

        # Concatenar para embedding
        texto = caracteristicas.replace("\n", ", ").replace("\r", "")

        # JSON final
        producto_pgvector = {
            "id": prod_id,
            "nombre": nombre,
            "tech_details": texto,
            "image": image
        }

        # Copiar columnas del CSV
        for col in csv_cols:
            if col in row:
                producto_pgvector[col] = row[col]

        driver.quit()
        return producto_pgvector

    except Exception as e:
        driver.quit()
        print(f"Error al procesar {url}: {e}")
        return None

# Ejecutar en paralelo
productos_pgvector = []
max_workers = 6  # Número de navegadores simultáneos
with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = [executor.submit(procesar_producto, row) for idx, row in df.iterrows()]
    for future in as_completed(futures):
        result = future.result()
        if result:
            productos_pgvector.append(result)
            print(f"Producto {result['id']} procesado")

# Guardar JSON final
with open("productos_pgvector.json", "w", encoding="utf-8") as f:
    json.dump(productos_pgvector, f, ensure_ascii=False)

print("Scraping paralelo completo. JSON listo para pgvector guardado en productos_pgvector.json")
