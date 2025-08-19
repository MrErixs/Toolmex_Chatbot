
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUTPUT_FILE = './results.json';
const PREFIX_FILE = './prefixes.json';
const URL = 'https://www.toolmex.com/mxt/inventario-en-mexico';
const TIMEOUT = 1000 * 60; // 1 minuto segundos

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Leer prefijos
  const prefixes = JSON.parse(fs.readFileSync(path.resolve(PREFIX_FILE), 'utf-8'));
  console.log("prefixes:", prefixes);
  const results = {};

  console.log(`🔍 Consultando el almacén... (Tarda de 2 a 3 minutos...)`);
  for (const prefix of prefixes) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

      // Acceder al iframe
      const frame = await (await page.waitForSelector('iframe', { timeout: TIMEOUT })).contentFrame();

      // Llenar formulario
      await frame.fill('#ItemNo', prefix);
      await frame.evaluate(() => {
        document.querySelector('#ItemDes').value = '';
        document.querySelector('input[name="pn"]').value = 1;
      });

      await Promise.all([
        frame.click('input[type="submit"]'),
        frame.waitForLoadState('networkidle', { timeout: TIMEOUT })
      ]);

      let allRows = [];

      while (true) {
        // Extraer datos de la tabla actual
        const pageRows = await frame.evaluate(() => {
          const table = document.querySelector('table[cellspacing="0"]');
          if (!table) return [];
          const rows = [];
          for (const tr of table.querySelectorAll('tr')) {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 4) continue;
            rows.push({
              code: cells[0].innerText.trim(),
              description: cells[1].innerText.trim(),
              quantity: cells[2].innerText.trim(),
              uom: cells[3].innerText.trim()
            });
          }
          return rows;
        });

        allRows.push(...pageRows);

        // Intentar pasar a la siguiente página
        const nextButton = await frame.$('a:has-text("Next")');
        if (nextButton) {
          await Promise.all([
            nextButton.click(),
            frame.waitForLoadState('networkidle', { timeout: TIMEOUT })
          ]);
        } else {
          break;
        }
      }

      results[prefix] = allRows.length > 0 ? allRows : 'No encontrado';

    } catch (err) {
      console.error(`⚠️ Error con consulta ${prefix}:`, err.message);
      results[prefix] = 'Error';
    }
  }

  await browser.close();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`✅ Datos de stock en el almacén actualizados en el archivo: ${OUTPUT_FILE}`);
})();
