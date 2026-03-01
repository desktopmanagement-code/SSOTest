const form = document.getElementById('profile-form');
const list = document.getElementById('experience-list');
const template = document.getElementById('experience-template');
const addBtn = document.getElementById('add-experience');
const result = document.getElementById('result');
const companySelect = document.getElementById('company-select');
const downloadPdfBtn = document.getElementById('download-pdf-btn');

async function loadCompanies() {
  const response = await fetch('/api/companies');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Konnte Firmen-Configs nicht laden');
  }

  companySelect.innerHTML = '';
  data.companies.forEach((company) => {
    const option = document.createElement('option');
    option.value = company;
    option.textContent = company;
    companySelect.appendChild(option);
  });

  if (data.companies.length === 0) {
    throw new Error('Keine company-Configs gefunden. Bitte src/config/*.json anlegen.');
  }
}

function addExperience(initial = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    el.value = initial[key] || '';
  });
  node.querySelector('.remove').addEventListener('click', () => node.remove());
  list.appendChild(node);
}

function linesToArray(value) {
  return value
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function collectProfile() {
  const data = new FormData(form);
  const project = {
    title: data.get('project.title') || '',
    client: data.get('project.client') || '',
    location: data.get('project.location') || '',
  };

  const personal = {
    name: data.get('personal.name') || '',
    email: data.get('personal.email') || '',
    phone: data.get('personal.phone') || '',
    location: data.get('personal.location') || '',
  };

  const projectExperiences = Array.from(list.querySelectorAll('.experience-item'))
    .map((item) => {
      const obj = {};
      item.querySelectorAll('[data-key]').forEach((el) => {
        const key = el.dataset.key;
        obj[key] = (el.value || '').trim();
      });
      obj.technologies = (obj.technologies || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      return obj;
    })
    .filter((exp) => exp.name);

  return {
    project,
    personal,
    projectExperiences,
    qualifications: linesToArray(data.get('qualifications') || ''),
    certifications: linesToArray(data.get('certifications') || ''),
    other: linesToArray(data.get('other') || ''),
  };
}

function buildPayload() {
  return {
    company: new FormData(form).get('company'),
    pdf: Boolean(new FormData(form).get('pdf')),
    profile: collectProfile(),
  };
}

async function handleNormalGenerate(event) {
  event.preventDefault();
  result.textContent = 'Erzeuge Profil...';

  const payload = buildPayload();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      result.textContent = `Fehler:\n${data.error || 'Unbekannt'}`;
      return;
    }

    result.textContent = [
      'Erfolg!',
      `Firma: ${data.company}`,
      `HTML: ${data.outputHtml}`,
      data.outputPdf ? `PDF: ${data.outputPdf}` : 'PDF: nicht angefordert',
      '',
      `Öffnen: ${data.openUrl}`,
      '',
      'Generierte JSON:',
      JSON.stringify(data.profile, null, 2),
    ].join('\n');
  } catch (error) {
    result.textContent = `Fehler:\n${error.message}`;
  }
}

async function handleDirectPdfDownload() {
  result.textContent = 'Erzeuge PDF für Direkt-Download...';

  const payload = buildPayload();

  try {
    const response = await fetch('/api/generate-pdf-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      result.textContent = `Fehler:\n${errorData.error || 'Unbekannt'}`;
      return;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;

    const contentDisposition = response.headers.get('content-disposition') || '';
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    a.download = match ? match[1] : 'profil.pdf';

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);

    result.textContent = 'PDF wurde erzeugt und als Download an den Browser ausgeliefert.';
  } catch (error) {
    result.textContent = `Fehler:\n${error.message}`;
  }
}

addBtn.addEventListener('click', () => addExperience());
form.addEventListener('submit', handleNormalGenerate);
downloadPdfBtn.addEventListener('click', handleDirectPdfDownload);

(async () => {
  try {
    await loadCompanies();
  } catch (error) {
    result.textContent = `Fehler beim Laden der Firmen:\n${error.message}`;
  }
})();

addExperience({
  name: 'Beispielprojekt',
  role: 'Entwickler',
  from: '2024-01',
  to: '2024-12',
  description: 'Kurzbeschreibung der Tätigkeit',
  technologies: 'Node.js, TypeScript',
});
