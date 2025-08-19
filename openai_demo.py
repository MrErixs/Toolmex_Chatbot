# openai_demo.py
# Ejemplo básico de cómo usar la API de OpenAI en Python
import os
from dotenv import load_dotenv
from openai import OpenAI

# Inicializa el cliente con tu API key
load_dotenv()  # lee el .env
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# Petición básica: generar un concepto
response = client.responses.create(
    model="gpt-5",
    input="Que es un chuck?",
    store=True,  # guarda el request en tu cuenta de OpenAI
)

print("Respuesta del modelo:")
print(response.output_text)
