const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output');

function parseBooleanEnv(value) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function isLikelyNpmPdfShortcut() {
  return process.env.npm_lifecycle_event === 'generate' && parseBooleanEnv(process.env.npm_config_force);
}

function parseArgs(argv) {
  const defaults = {
    company: 'company-a',
    profile: 'src/data/profile-with-certs.json',
    template: 'src/templates/profile.template.html',
    outputHtml: 'output/profile.html',
    outputPdf: 'output/profile.pdf',
    pdf: parseBooleanEnv(process.env.npm_config_pdf) || isLikelyNpmPdfShortcut(),
    browserPath: process.env.PROFILE_PDF_BROWSER || '',
  };

  const args = { ...defaults };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--pdf') {
      args.pdf = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Fehlender Wert für ${arg}`);
    }

    switch (arg) {
      case '--company':
        args.company = next;
        i += 1;
        break;
      case '--profile':
        args.profile = next;
        i += 1;
        break;
      case '--template':
        args.template = next;
        i += 1;
        break;
      case '--output-html':
        args.outputHtml = next;
        i += 1;
        break;
      case '--output-pdf':
        args.outputPdf = next;
        i += 1;
        break;
      case '--browser-path':
        args.browserPath = next;
        i += 1;
        break;
      default:
        throw new Error(`Unbekanntes Argument: ${arg}`);
    }
  }

  return args;
}

function resolveFromRoot(relativePath) {
  return path.isAbsolute(relativePath) ? relativePath : path.join(rootDir, relativePath);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getValueByPath(context, keyPath) {
  if (!keyPath || keyPath === 'this') {
    return context.this;
  }

  const parts = keyPath.split('.');
  let current = context;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return '';
    }
    current = current[part];
  }

  return current == null ? '' : current;
}

function parseTemplate(template) {
  const tokenPattern = /{{\s*([^}]+)\s*}}/g;

  function parseNodes(startIndex, endTag) {
    const nodes = [];
    let cursor = startIndex;
    let match = tokenPattern.exec(template);

    while (match) {
      const fullMatch = match[0];
      const tokenRaw = match[1].trim();
      const tokenStart = match.index;
      const tokenEnd = tokenStart + fullMatch.length;

      if (tokenStart > cursor) {
        nodes.push({ type: 'text', value: template.slice(cursor, tokenStart) });
      }

      if (tokenRaw.startsWith('/')) {
        const closing = tokenRaw.slice(1);
        if (endTag && closing === endTag) {
          return { nodes, nextIndex: tokenEnd };
        }
        throw new Error(`Unerwartetes Closing-Tag: ${tokenRaw}`);
      }

      if (tokenRaw.startsWith('#if ')) {
        const expression = tokenRaw.slice(4).trim();
        tokenPattern.lastIndex = tokenEnd;
        const nested = parseNodes(tokenEnd, 'if');
        nodes.push({ type: 'if', expression, children: nested.nodes });
        cursor = nested.nextIndex;
        tokenPattern.lastIndex = nested.nextIndex;
        match = tokenPattern.exec(template);
        continue;
      }

      if (tokenRaw.startsWith('#each ')) {
        const collectionPath = tokenRaw.slice(6).trim();
        tokenPattern.lastIndex = tokenEnd;
        const nested = parseNodes(tokenEnd, 'each');
        nodes.push({ type: 'each', collectionPath, children: nested.nodes });
        cursor = nested.nextIndex;
        tokenPattern.lastIndex = nested.nextIndex;
        match = tokenPattern.exec(template);
        continue;
      }

      if (tokenRaw.startsWith('join ')) {
        const joinMatch = tokenRaw.match(/^join\s+([^\s]+)\s+"([^"]*)"$/);
        if (!joinMatch) {
          throw new Error(`Ungültiger join-Ausdruck: ${tokenRaw}`);
        }
        nodes.push({ type: 'join', path: joinMatch[1], separator: joinMatch[2] });
      } else {
        nodes.push({ type: 'var', path: tokenRaw });
      }

      cursor = tokenEnd;
      match = tokenPattern.exec(template);
    }

    if (cursor < template.length) {
      nodes.push({ type: 'text', value: template.slice(cursor) });
    }

    if (endTag) {
      throw new Error(`Fehlendes Closing-Tag: /${endTag}`);
    }

    return { nodes, nextIndex: template.length };
  }

  tokenPattern.lastIndex = 0;
  return parseNodes(0, null).nodes;
}

function evaluateIfExpression(expression, context) {
  const expr = expression.trim();
  const hasItemsMatch = expr.match(/^\(hasItems\s+([^)]+)\)$/);
  if (!hasItemsMatch) {
    return false;
  }

  const value = getValueByPath(context, hasItemsMatch[1].trim());
  return Array.isArray(value) && value.length > 0;
}

function renderNodes(nodes, context) {
  let result = '';

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        result += node.value;
        break;
      case 'var': {
        const value = getValueByPath(context, node.path.trim());
        result += String(value);
        break;
      }
      case 'join': {
        const arr = getValueByPath(context, node.path.trim());
        result += Array.isArray(arr) ? arr.join(node.separator) : '';
        break;
      }
      case 'if': {
        if (evaluateIfExpression(node.expression, context)) {
          result += renderNodes(node.children, context);
        }
        break;
      }
      case 'each': {
        const items = getValueByPath(context, node.collectionPath.trim());
        if (Array.isArray(items)) {
          result += items
            .map((item) => {
              const itemContext = {
                ...context,
                ...(typeof item === 'object' && item !== null ? item : {}),
                this: item,
              };
              return renderNodes(node.children, itemContext);
            })
            .join('');
        }
        break;
      }
      default:
        throw new Error(`Unbekannter Template-Node: ${node.type}`);
    }
  }

  return result;
}

function renderTemplate(template, context) {
  const ast = parseTemplate(template);
  return renderNodes(ast, context);
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeCssBundle(branding) {
  const baseCssPath = resolveFromRoot('src/styles/base.css');
  const companyCssPath = resolveFromRoot(branding.cssFile);

  const [baseCss, companyCss] = await Promise.all([
    fs.readFile(baseCssPath, 'utf8'),
    fs.readFile(companyCssPath, 'utf8'),
  ]);

  const logoPath = resolveFromRoot(branding.logoPath).replace(/\\/g, '/');
  const variables = `:root {\n  --primary-color: ${branding.primaryColor || '#0055A4'};\n  --logo-url: url("file://${logoPath}");\n}\n`;

  return `${variables}\n${baseCss}\n${companyCss}`;
}


function normalizeBrowserCommand(input) {
  const cmd = (input || '').trim();
  if (!cmd) return '';

  if (path.isAbsolute(cmd) && cmd.endsWith('.app')) {
    if (cmd.endsWith('Google Chrome.app')) {
      return path.join(cmd, 'Contents', 'MacOS', 'Google Chrome');
    }
    if (cmd.endsWith('Microsoft Edge.app')) {
      return path.join(cmd, 'Contents', 'MacOS', 'Microsoft Edge');
    }
  }

  return cmd;
}

async function findWorkingBrowser(customBrowserPath) {
  const candidates = [
    normalizeBrowserCommand(customBrowserPath),
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'msedge',
    'microsoft-edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const cmd of candidates) {
    try {
      // For explicit paths, only verify file existence (no process start).
      if (path.isAbsolute(cmd)) {
        await fs.access(cmd);
        return cmd;
      }

      // For command names, resolve via shell lookup to avoid spawning browser UI.
      const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
      await execFileAsync(lookupCmd, [cmd]);
      return cmd;
    } catch (error) {
      // try next candidate
    }
  }

  return '';
}


async function generatePdfWithPlaywright(htmlPath, pdfPath) {
  let playwright;
  try {
    // optional dependency: if not installed, caller falls back to CLI browser mode
    playwright = require('playwright');
  } catch (error) {
    throw new Error('Playwright nicht installiert.');
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
    });
  } finally {
    await browser.close();
  }
}

async function generatePdfWithChromium(htmlPath, pdfPath, customBrowserPath = '') {
  const browserCmd = await findWorkingBrowser(customBrowserPath);
  const fileUrl = `file://${htmlPath}`;

  if (!browserCmd) {
    throw new Error(
      [
        'Kein Chromium/Chrome/Edge Binary gefunden.',
        'Installiere Chrome oder Edge und versuche es erneut.',
        'Alternativ Browser explizit setzen mit --browser-path "<pfad-zur-exe>"',
        'oder Umgebungsvariable PROFILE_PDF_BROWSER verwenden.',
      ].join(' '),
    );
  }

  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-generator-chrome-'));

  try {
    const baseArgs = [
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-background-networking',
      '--allow-file-access-from-files',
      '--no-startup-window',
      `--user-data-dir=${tempProfileDir}`,
      `--print-to-pdf=${pdfPath}`,
      '--no-margins',
      fileUrl,
    ];

    const headlessVariants = ['--headless=new', '--headless=chrome', '--headless'];
    let lastError;

    for (const headlessFlag of headlessVariants) {
      try {
        await fs.rm(pdfPath, { force: true });
        await execFileAsync(browserCmd, [headlessFlag, ...baseArgs]);

        const stat = await fs.stat(pdfPath).catch(() => null);
        if (stat && stat.size > 0) {
          return;
        }

        lastError = new Error(
          `Browser-Aufruf mit ${headlessFlag} endete ohne PDF-Datei (${pdfPath}).`,
        );
      } catch (error) {
        lastError = error;
      }
    }

    const details = lastError?.stderr || lastError?.stdout || lastError?.message || 'Keine Details verfügbar.';
    throw new Error(
      `PDF-Export fehlgeschlagen (Playwright nicht verfügbar oder Browser-CLI fehlgeschlagen). Details: ${details}`,
    );
  } finally {
    await fs.rm(tempProfileDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const profilePath = resolveFromRoot(args.profile);
  const companyConfigPath = resolveFromRoot(`src/config/${args.company}.json`);
  const templatePath = resolveFromRoot(args.template);

  const outputHtmlPath = resolveFromRoot(args.outputHtml);
  const outputPdfPath = resolveFromRoot(args.outputPdf);
  const outputCssPath = path.join(path.dirname(outputHtmlPath), 'profile.css');

  const [profile, branding, template] = await Promise.all([
    readJson(profilePath),
    readJson(companyConfigPath),
    fs.readFile(templatePath, 'utf8'),
  ]);

  const context = {
    project: profile.project || {},
    personal: profile.personal || {},
    projectExperiences: normalizeArray(profile.projectExperiences),
    qualifications: normalizeArray(profile.qualifications),
    certifications: normalizeArray(profile.certifications),
    other: normalizeArray(profile.other),
    branding,
    generatedAt: new Date().toLocaleString('de-DE'),
  };

  const html = renderTemplate(template, context);
  const css = await writeCssBundle(branding);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.dirname(outputHtmlPath), { recursive: true });

  await fs.writeFile(outputHtmlPath, html, 'utf8');
  await fs.writeFile(outputCssPath, css, 'utf8');

  console.log(`HTML erstellt: ${path.relative(rootDir, outputHtmlPath)}`);

  if (args.pdf) {
    try {
      await generatePdfWithPlaywright(outputHtmlPath, outputPdfPath);
      console.log(`PDF erstellt (Playwright): ${path.relative(rootDir, outputPdfPath)}`);
    } catch (playwrightError) {
      await generatePdfWithChromium(outputHtmlPath, outputPdfPath, args.browserPath);
      console.log(`PDF erstellt (Browser-CLI): ${path.relative(rootDir, outputPdfPath)}`);
    }
  } else {
    console.log('PDF-Export übersprungen (verwende --pdf).');
  }
}

main().catch((error) => {
  console.error(`Fehler beim Generieren des Profils: ${error.message}`);
  process.exitCode = 1;
});
