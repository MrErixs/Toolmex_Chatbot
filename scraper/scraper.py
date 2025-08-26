# pip install selenium webdriver-manager pandas
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
df = pd.read_csv("itemlist.csv")  # <-- item-single.csv || itemlist.csv ==> producto.json || productos_pgvector.js
df = df[df["product_subcategory"].str.lower() == "workholding"] # <-- Execute a single module 
# Pages have "#pnlNotFound" error message when they dont have a technical_description on website

# Execute a single module:
# get modules -> $ python getSubcategories.py
# cutting
# indexable
# OTHER
# motors
# rotary
# workholding
# Workholding

# Columnas a copiar del CSV
csv_cols = ["language_item_desc","language_extended_desc","product_category",
            "product_subcategory","item_id","extended_desc","weight","net_weight"]

# Función que procesa un solo producto
import random

def procesar_producto(row, max_retries=3):
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    service = Service(ChromeDriverManager(driver_version="139.0.7258.139").install())

    url = row["tech_details"]
    for intento in range(max_retries):
        driver = webdriver.Chrome(service=service, options=options)
        driver.set_page_load_timeout(15)
        try:
            driver.get(url)
            wait = WebDriverWait(driver, 10)
            prod_id = url.split("itemid=")[-1]

            try:
                image = driver.find_element(By.CSS_SELECTOR,
                    "#content > div > div.SKUDetailContainer > div:nth-child(2) > div.SKUDetailLeft.col-4 > div.SKUDetailImage > div > div > div > a > img"
                ).get_attribute("src")
            except:
                image = row.get("image_link", "")

            try:
                caracteristicas = driver.find_element(By.CSS_SELECTOR, "#tech-inner").text
            except:
                caracteristicas = row.get("tech_details", "")

            texto = caracteristicas.replace("\n", ", ").replace("\r", "")
            producto_pgvector = {
                "id": prod_id,
                "tech_details": texto,
                "image": image
            }
            for col in csv_cols:
                if col in row:
                    producto_pgvector[col] = row[col]

            driver.quit()
            return producto_pgvector

        except Exception as e:
            driver.quit()
            print(f"[{intento+1}/{max_retries}] Error {url}: {e}")
            if intento < max_retries - 1:
                time.sleep(2 ** intento + random.random())  # backoff exponencial
            else:
                print(f"Falló definitivamente {url}")
                return None


# Ejecutar en paralelo
productos_pgvector = []
max_workers = 5  # Número de navegadores simultáneos #24-CRASHEA #12-Lightcrash #6-Errorless=30minutes
i = 0
with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = [executor.submit(procesar_producto, row) for idx, row in df.iterrows()]
    for future in as_completed(futures):
        result = future.result()
        if result:
            productos_pgvector.append(result)
            print(f"Producto {result['id']} procesado")
            i = i + 1

# Guardar JSON final
with open("productos_pgvector.json", "w", encoding="utf-8") as f:
    json.dump(productos_pgvector, f, ensure_ascii=False)

# Exit
print(f"Scraping paralelo completo: {i} Rows afectadas. JSON guardado en productos_pgvector.json")