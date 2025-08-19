const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUTPUT_FILE = './results.json';
const PREFIX_FILE = './prefixes.json';
const URL = 'https://www.toolmex.com/mxt/inventario-en-mexico';
const BASE_TIMEOUT = 30000; // 30 seconds base timeout
const MAX_RETRIES = 3;
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between requests
const MAX_PAGE_RETRIES = 5; // Maximum retries for pagination

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const logWithTimestamp = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const emoji = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${emoji} [${timestamp}] ${message}`);
};

const savePartialResults = (results, attempt = '') => {
  try {
    const filename = attempt ? `results_partial_${attempt}.json` : OUTPUT_FILE;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    logWithTimestamp(`Partial results saved to ${filename}`, 'success');
  } catch (error) {
    logWithTimestamp(`Failed to save partial results: ${error.message}`, 'error');
  }
};

const waitForElementWithRetry = async (frame, selector, timeout = BASE_TIMEOUT, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const element = await frame.waitForSelector(selector, { timeout });
      return element;
    } catch (error) {
      logWithTimestamp(`Attempt ${i + 1}/${maxRetries} failed for selector "${selector}": ${error.message}`, 'warn');
      if (i === maxRetries - 1) throw error;
      await sleep(1000);
    }
  }
};

const safeEvaluate = async (frame, evaluateFunction, context = '') => {
  try {
    return await frame.evaluate(evaluateFunction);
  } catch (error) {
    logWithTimestamp(`Evaluation failed${context ? ` (${context})` : ''}: ${error.message}`, 'error');
    return null;
  }
};

const extractTableData = async (frame, prefix) => {
  try {
    const pageRows = await safeEvaluate(frame, () => {
      const table = document.querySelector('table[cellspacing="0"]');
      if (!table) {
        console.log('No table found on page');
        return [];
      }
      
      const rows = [];
      const tableRows = table.querySelectorAll('tr');
      
      for (let i = 0; i < tableRows.length; i++) {
        const tr = tableRows[i];
        const cells = tr.querySelectorAll('td');
        
        if (cells.length < 4) {
          console.log(`Row ${i} has insufficient cells (${cells.length})`);
          continue;
        }
        
        const rowData = {
          code: cells[0].innerText?.trim() || '',
          description: cells[1].innerText?.trim() || '',
          quantity: cells[2].innerText?.trim() || '',
          uom: cells[3].innerText?.trim() || ''
        };
        
        // Only add rows with meaningful data
        if (rowData.code && (rowData.description || rowData.quantity)) {
          rows.push(rowData);
        }
      }
      
      console.log(`Extracted ${rows.length} valid rows from table`);
      return rows;
    }, `extracting table data for prefix ${prefix}`);

    return pageRows || [];
  } catch (error) {
    logWithTimestamp(`Failed to extract table data for ${prefix}: ${error.message}`, 'error');
    return [];
  }
};

const processPrefix = async (page, prefix, attemptNumber = 1) => {
  logWithTimestamp(`Processing prefix: ${prefix} (Attempt ${attemptNumber}/${MAX_RETRIES})`);
  
  try {
    // Navigate to the page with extended timeout
    logWithTimestamp(`Navigating to ${URL}...`);
    await page.goto(URL, { 
      waitUntil: 'domcontentloaded', 
      timeout: BASE_TIMEOUT * 2 
    });

    // Wait for and access iframe with retry
    logWithTimestamp(`Waiting for iframe...`);
    const iframeElement = await waitForElementWithRetry(page, 'iframe', BASE_TIMEOUT);
    const frame = await iframeElement.contentFrame();
    
    if (!frame) {
      throw new Error('Failed to access iframe content');
    }

    // Wait for form elements to be ready
    logWithTimestamp(`Waiting for form elements...`);
    await waitForElementWithRetry(frame, '#ItemNo', BASE_TIMEOUT);
    await sleep(1000); // Additional wait for form stability

    // Fill form with validation
    logWithTimestamp(`Filling form for prefix: ${prefix}`);
    await frame.fill('#ItemNo', prefix);
    
    // Clear and set other form fields with error handling
    await safeEvaluate(frame, () => {
      const itemDes = document.querySelector('#ItemDes');
      const pageNum = document.querySelector('input[name="pn"]');
      
      if (itemDes) itemDes.value = '';
      if (pageNum) pageNum.value = '1';
      
      return { itemDesFound: !!itemDes, pageNumFound: !!pageNum };
    }, 'setting form fields');

    // Submit form and wait for results
    logWithTimestamp(`Submitting form...`);
    const submitButton = await frame.$('input[type="submit"]');
    if (!submitButton) {
      throw new Error('Submit button not found');
    }

    await Promise.all([
      submitButton.click(),
      frame.waitForLoadState('networkidle', { timeout: BASE_TIMEOUT }),
      sleep(2000) // Additional wait for content to stabilize
    ]);

    // Check if results are available
    logWithTimestamp(`Checking for results...`);
    const hasTable = await safeEvaluate(frame, () => {
      return !!document.querySelector('table[cellspacing="0"]');
    }, 'checking for results table');

    if (!hasTable) {
      logWithTimestamp(`No results table found for prefix: ${prefix}`, 'warn');
      return { prefix, data: 'No encontrado', status: 'no_results' };
    }

    let allRows = [];
    let pageCount = 0;
    const maxPages = 100; // Safety limit

    // Paginate through all results
    while (pageCount < maxPages) {
      pageCount++;
      logWithTimestamp(`Processing page ${pageCount} for prefix ${prefix}...`);

      // Extract data from current page
      const pageRows = await extractTableData(frame, prefix);
      
      if (pageRows.length === 0) {
        logWithTimestamp(`No data found on page ${pageCount} for prefix ${prefix}`, 'warn');
      } else {
        allRows.push(...pageRows);
        logWithTimestamp(`Added ${pageRows.length} rows from page ${pageCount} (Total: ${allRows.length})`);
      }

      // Try to find and click next button
      const nextButton = await frame.$('a:has-text("Next"), input[value*="Next"], button:has-text("Next")');
      
      if (!nextButton) {
        logWithTimestamp(`No next button found, finished pagination for ${prefix}`);
        break;
      }

      // Click next with retry mechanism
      let nextClickSuccess = false;
      for (let retry = 0; retry < MAX_PAGE_RETRIES; retry++) {
        try {
          logWithTimestamp(`Clicking next button (attempt ${retry + 1}/${MAX_PAGE_RETRIES})...`);
          
          await Promise.all([
            nextButton.click(),
            frame.waitForLoadState('networkidle', { timeout: BASE_TIMEOUT }),
            sleep(1500) // Wait for page transition
          ]);
          
          nextClickSuccess = true;
          break;
        } catch (error) {
          logWithTimestamp(`Next click attempt ${retry + 1} failed: ${error.message}`, 'warn');
          if (retry === MAX_PAGE_RETRIES - 1) {
            logWithTimestamp(`Failed to navigate to next page after ${MAX_PAGE_RETRIES} attempts`, 'error');
          } else {
            await sleep(2000); // Wait before retry
          }
        }
      }

      if (!nextClickSuccess) {
        logWithTimestamp(`Pagination stopped due to navigation errors for ${prefix}`, 'warn');
        break;
      }
    }

    if (pageCount >= maxPages) {
      logWithTimestamp(`Reached maximum page limit (${maxPages}) for prefix ${prefix}`, 'warn');
    }

    const result = {
      prefix,
      data: allRows.length > 0 ? allRows : 'No encontrado',
      status: allRows.length > 0 ? 'success' : 'no_data',
      pages_processed: pageCount,
      total_records: allRows.length
    };

    logWithTimestamp(`Completed processing ${prefix}: ${allRows.length} records from ${pageCount} pages`, 'success');
    return result;

  } catch (error) {
    logWithTimestamp(`Error processing prefix ${prefix} (attempt ${attemptNumber}): ${error.message}`, 'error');
    
    if (attemptNumber < MAX_RETRIES) {
      logWithTimestamp(`Retrying prefix ${prefix} in 5 seconds...`, 'warn');
      await sleep(5000);
      return await processPrefix(page, prefix, attemptNumber + 1);
    }
    
    return {
      prefix,
      data: 'Error',
      status: 'failed',
      error: error.message,
      attempts: attemptNumber
    };
  }
};

(async () => {
  const startTime = Date.now();
  logWithTimestamp('Starting robust inventory scraper...', 'info');
  
  let browser;
  try {
    // Read prefixes with validation
    if (!fs.existsSync(PREFIX_FILE)) {
      throw new Error(`Prefixes file not found: ${PREFIX_FILE}`);
    }
    
    const prefixes = JSON.parse(fs.readFileSync(path.resolve(PREFIX_FILE), 'utf-8'));
    
    if (!Array.isArray(prefixes) || prefixes.length === 0) {
      throw new Error('Invalid or empty prefixes array');
    }
    
    logWithTimestamp(`Loaded ${prefixes.length} prefixes to process`, 'success');

    // Launch browser with robust settings
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    const page = await context.newPage();
    
    // Set longer timeouts
    page.setDefaultTimeout(BASE_TIMEOUT);
    page.setDefaultNavigationTimeout(BASE_TIMEOUT * 2);

    const results = {};
    let processed = 0;
    let successful = 0;
    let failed = 0;

    logWithTimestamp(`🔍 Starting warehouse consultation... (Estimated time: ${Math.ceil(prefixes.length * 0.5)} to ${Math.ceil(prefixes.length * 1.5)} minutes)`, 'info');

    for (const prefix of prefixes) {
      processed++;
      const progress = `${processed}/${prefixes.length}`;
      
      logWithTimestamp(`\n--- Processing ${progress}: ${prefix} ---`);
      
      const result = await processPrefix(page, prefix);
      results[prefix] = result.data;
      
      // Track statistics
      if (result.status === 'success') {
        successful++;
      } else if (result.status === 'failed') {
        failed++;
      }

      logWithTimestamp(`Progress: ${progress} | Success: ${successful} | Failed: ${failed}`);

      // Save partial results every 10 items
      if (processed % 10 === 0) {
        savePartialResults(results, `${processed}_items`);
      }

      // Delay between requests to be respectful
      if (processed < prefixes.length) {
        logWithTimestamp(`Waiting ${DELAY_BETWEEN_REQUESTS/1000}s before next request...`);
        await sleep(DELAY_BETWEEN_REQUESTS);
      }
    }

    await context.close();

    // Final statistics
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;

    logWithTimestamp(`\n=== FINAL STATISTICS ===`, 'success');
    logWithTimestamp(`Total processed: ${processed}`);
    logWithTimestamp(`Successful: ${successful}`);
    logWithTimestamp(`Failed: ${failed}`);
    logWithTimestamp(`No data: ${processed - successful - failed}`);
    logWithTimestamp(`Total time: ${minutes}m ${seconds}s`);
    logWithTimestamp(`Average time per prefix: ${(totalTime/processed).toFixed(1)}s`);

  } catch (error) {
    logWithTimestamp(`Critical error: ${error.message}`, 'error');
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Save final results
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    logWithTimestamp(`✅ Final results saved to: ${OUTPUT_FILE}`, 'success');
  } catch (error) {
    logWithTimestamp(`Failed to save final results: ${error.message}`, 'error');
  }
})();