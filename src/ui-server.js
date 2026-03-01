const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const configDir = path.join(rootDir, 'src/config');
const port = Number(process.env.PORT || 5050);

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.pdf')) return 'application/pdf';
  return 'text/plain; charset=utf-8';
}

async function serveFile(res, filePath, asAttachment = false) {
  const content = await fs.readFile(filePath);
  const headers = { 'Content-Type': contentTypeFor(filePath) };
  if (asAttachment) {
    headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  }
  res.writeHead(200, headers);
  res.end(content);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error('Ungültiges JSON im Request-Body'));
      }
    });
    req.on('error', reject);
  });
}

async function listCompanies() {
  const files = await fs.readdir(configDir);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/i, ''))
    .sort((a, b) => a.localeCompare(b, 'de'));
}

async function normalizeCompany(company) {
  const requested = (company || '').trim();
  const available = await listCompanies();

  if (!requested) {
    return available[0] || '';
  }

  const exact = available.find((entry) => entry === requested);
  if (exact) return exact;

  const caseInsensitive = available.find((entry) => entry.toLowerCase() === requested.toLowerCase());
  if (caseInsensitive) return caseInsensitive;

  throw new Error(
    `Unbekannte Firma "${requested}". Verfügbare Configs: ${available.join(', ') || '(keine gefunden)'}`,
  );
}

function makeTempRunDir() {
  const unique = crypto.randomBytes(8).toString('hex');
  return path.join(os.tmpdir(), `profile-generator-ui-${unique}`);
}

async function runGenerator({ company, profile, pdf, outputDir, profileFileName = 'ui-profile.json' }) {
  const normalizedCompany = await normalizeCompany(company);
  await fs.mkdir(outputDir, { recursive: true });

  const profilePath = path.join(outputDir, profileFileName);
  const outputHtmlPath = path.join(outputDir, 'profile.html');
  const outputPdfPath = path.join(outputDir, 'profile.pdf');

  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');

  const args = [
    'src/index.js',
    '--company',
    normalizedCompany,
    '--profile',
    profilePath,
    '--output-html',
    outputHtmlPath,
    '--output-pdf',
    outputPdfPath,
  ];

  if (pdf) args.push('--pdf');

  await execFileAsync('node', args, { cwd: rootDir });

  return {
    company: normalizedCompany,
    outputHtmlPath,
    outputPdfPath,
    profilePath,
  };
}

async function runGenerate({ company, profile, pdf }) {
  const outputDir = path.join(rootDir, 'output');
  const generated = await runGenerator({ company, profile, pdf, outputDir });

  return {
    company: generated.company,
    outputHtml: 'output/profile.html',
    outputPdf: pdf ? 'output/profile.pdf' : '',
    openUrl: `http://localhost:${port}/output/profile.html`,
    profile,
  };
}

async function generatePdfDownload({ company, profile }) {
  const tempDir = makeTempRunDir();
  try {
    const generated = await runGenerator({
      company,
      profile,
      pdf: true,
      outputDir: tempDir,
      profileFileName: 'ui-profile-download.json',
    });

    const pdfBuffer = await fs.readFile(generated.outputPdfPath);
    return { pdfBuffer, company: generated.company };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/') {
      await serveFile(res, path.join(rootDir, 'src/ui/index.html'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ui.css') {
      await serveFile(res, path.join(rootDir, 'src/ui/ui.css'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ui.js') {
      await serveFile(res, path.join(rootDir, 'src/ui/ui.js'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/companies') {
      sendJson(res, 200, { companies: await listCompanies() });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/output/')) {
      const target = path.join(rootDir, url.pathname.replace(/^\//, ''));
      await serveFile(res, target, url.searchParams.get('download') === '1');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = await parseBody(req);
      const company = body.company || '';
      const profile = body.profile || {};
      const pdf = Boolean(body.pdf);
      const result = await runGenerate({ company, profile, pdf });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate-pdf-download') {
      const body = await parseBody(req);
      const company = body.company || '';
      const profile = body.profile || {};

      const generated = await generatePdfDownload({ company, profile });
      const fileName = `profil-${generated.company}.pdf`;

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      res.end(generated.pdfBuffer);
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Profil-Editor läuft auf: http://localhost:${port}`);
});
