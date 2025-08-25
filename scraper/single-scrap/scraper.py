# pip install selenium webdriver-manager
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import json

# Configuración de Selenium
options = Options()
options.add_argument("--headless")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")

service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=options)

url = "https://www.toolmex.com/itemdetail/3-866-0500P"
driver.get(url)

wait = WebDriverWait(driver, 10)

producto = {}

try:
    # Nombre del producto
    nombre_raw = wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1"))).text
    producto["nombre"] = nombre_raw.replace("\n", " ").replace("\r", " ")

    # ID del producto desde URL
    producto["id"] = url.split("/")[-1]

    # Imagen principal
    try:
        producto["image"] = driver.find_element(By.CSS_SELECTOR, "#content > div > div.SKUDetailContainer > div:nth-child(2) > div.SKUDetailLeft.col-4 > div.SKUDetailImage.img3-866-0500P > div > div > div > a > img").get_attribute("src")
    except:
        producto["image"] = ""

    # Descripción
    try:
        descripcion_raw = driver.find_element(By.CSS_SELECTOR, "#sku-desc > div.SKUDetailProdCat > div.SKUDetailDesc").text
        producto["descripcion"] = descripcion_raw.replace("\n", " ").replace("\r", " ")
    except:
        producto["descripcion"] = ""

    # Características técnicas
    try:
        caracteristicas_raw = driver.find_element(By.CSS_SELECTOR, "#tech-inner").text
        producto["caracteristicas"] = caracteristicas_raw.replace("\n", ", ").replace("\r", "")
    except:
        producto["caracteristicas"] = ""

    # Accesorios
    try:
        accesorios_raw = driver.find_element(By.CSS_SELECTOR, "#content > div > div.SKUDetailContainer > div:nth-child(3) > div.SKUDetailLeft.col-md-4.col-12").text
        producto["accesorios"] = accesorios_raw.replace("\n", ", ").replace("\r", "")
    except:
        producto["accesorios"] = ""

finally:
    driver.quit()

# Guardar JSON con textos limpios
with open("producto.json", "w", encoding="utf-8") as f:
    json.dump(producto, f, ensure_ascii=False, indent=4)

print("Scraping completo. Datos guardados en producto.json con textos limpios")