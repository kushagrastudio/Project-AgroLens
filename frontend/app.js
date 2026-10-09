(() => {
  const fileInput = document.getElementById('leaf-file');
  const dropzone = document.getElementById('dropzone');
  const dropzoneEmpty = document.getElementById('dropzone-empty');
  const dropzonePreview = document.getElementById('dropzone-preview');
  const uploadedPreview = document.getElementById('uploaded-preview');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const analyzeButton = document.getElementById('analyze-button');
  const uploadStatus = document.getElementById('upload-status');
  const analysisPanel = document.getElementById('analysis-panel');
  const analysisIntro = document.getElementById('analysis-intro');
  const progressWrap = document.getElementById('analysis-progress');
  const progressLabel = document.getElementById('progress-label');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.querySelector('.progress-line span');
  const resultsPanel = document.getElementById('results-panel');
  const toast = document.getElementById('toast');
  const menuToggle = document.getElementById('menu-toggle');
  let selectedFile = null;
  let uploadedPreviewUrl = null;
  let latestReport = null;
  let toastTimer = null;

  document.getElementById('current-year').textContent = new Date().getFullYear();

  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show${type === 'error' ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 4200);
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setSelectedFile(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!allowed.includes(file.type)) {
      showToast('Please choose a JPG, PNG, WEBP or BMP image.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('That image is too large. Please choose a file under 10 MB.', 'error');
      return;
    }
    selectedFile = file;
    latestReport = null;
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    uploadedPreviewUrl = URL.createObjectURL(file);
    uploadedPreview.src = uploadedPreviewUrl;
    fileName.textContent = file.name;
    fileSize.textContent = `${formatBytes(file.size)} · ready to analyze`;
    dropzoneEmpty.hidden = true;
    dropzonePreview.hidden = false;
    analyzeButton.disabled = false;
    uploadStatus.textContent = 'Photo ready. Select “Analyze leaf” to begin.';
    resetResultToIdle();
    document.getElementById('analysis-original').innerHTML = '';
    const originalImg = document.createElement('img');
    originalImg.src = uploadedPreviewUrl;
    originalImg.alt = 'Leaf photo selected for analysis';
    document.getElementById('analysis-original').appendChild(originalImg);
    document.getElementById('analysis-heatmap').innerHTML = '<div class="heat-pending"><span>Heatmap will appear after analysis</span></div>';
    document.querySelector('.attention-legend small').textContent = 'Live model attention appears after analysis';
    analysisIntro.textContent = 'Your photo is ready. Run the model to inspect visual patterns.';
    document.getElementById('sample-banner').hidden = true;
    document.getElementById('result-actions').hidden = true;
  }

  function resetResultToIdle() {
    document.getElementById('sample-banner').hidden = true;
    document.getElementById('plant-label').textContent = 'WAITING FOR ANALYSIS';
    document.getElementById('disease-name').textContent = 'Report will appear here';
    document.getElementById('disease-scientific').textContent = 'Upload a leaf and run the model';
    document.getElementById('confidence-pill').textContent = 'Pending';
    document.getElementById('care-summary').textContent = 'AgroLens will summarize the closest model match and suggest sensible next steps.';
    document.getElementById('care-steps').innerHTML = '<li>Upload a clear photo of one affected leaf.</li><li>Review the heatmap and the model confidence.</li><li>Confirm findings with a local agriculture expert.</li>';
    document.getElementById('results-disclaimer').textContent = 'AI screening is not a laboratory diagnosis. Confirm locally before making crop-treatment decisions.';
    document.getElementById('result-actions').hidden = true;
  }

  function removeFile(event) {
    if (event) event.stopPropagation();
    selectedFile = null;
    latestReport = null;
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    uploadedPreviewUrl = null;
    fileInput.value = '';
    uploadedPreview.src = '';
    dropzoneEmpty.hidden = false;
    dropzonePreview.hidden = true;
    analyzeButton.disabled = true;
    uploadStatus.textContent = '';
    document.getElementById('analysis-original').innerHTML = '<img src="/assets/leaf-sample.svg" alt="Illustrative leaf sample" />';
    document.getElementById('analysis-heatmap').innerHTML = '<img src="/assets/leaf-sample.svg" alt="Illustrative heatmap preview" /><div class="heat-overlay" aria-hidden="true"></div><div class="heat-center" aria-hidden="true"></div>';
    document.querySelector('.attention-legend small').textContent = 'Illustrative preview until you analyze a photo';
    analysisIntro.textContent = 'The model examines visual patterns that may indicate a disease.';
    progressWrap.hidden = true;
    analysisPanel.classList.remove('is-loading');
    document.getElementById('sample-banner').hidden = false;
    showExampleResult();
  }

  function showExampleResult() {
    document.getElementById('plant-label').textContent = 'EXAMPLE CROP · TOMATO';
    document.getElementById('disease-name').textContent = 'Early blight';
    document.getElementById('disease-scientific').textContent = 'Illustrative example only';
    document.getElementById('confidence-pill').textContent = 'Preview';
    document.getElementById('care-summary').textContent = 'This is only an example. Upload a leaf to receive a model-based result.';
    document.getElementById('care-steps').innerHTML = '<li>Photograph symptoms in natural light.</li><li>Check nearby plants for similar signs.</li><li>Confirm with a local agriculture expert before treatment.</li>';
    document.getElementById('result-actions').hidden = true;
  }

  dropzone.addEventListener('click', (event) => {
    if (event.target.closest('#remove-file')) return;
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => setSelectedFile(fileInput.files && fileInput.files[0]));
  document.getElementById('remove-file').addEventListener('click', removeFile);
  ['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); event.stopPropagation(); dropzone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); event.stopPropagation(); dropzone.classList.remove('drag-over');
  }));
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });

  const stagedMessages = [
    [14, 'Preparing your photo…'],
    [38, 'Running disease classifier…'],
    [67, 'Generating model attention heatmap…'],
    [87, 'Preparing treatment and support guidance…'],
  ];
  let progressInterval = null;
  function startProgress() {
    let percent = 5;
    progressWrap.hidden = false;
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressLabel.textContent = stagedMessages[0][1];
    analysisPanel.classList.add('is-loading');
    analysisIntro.textContent = 'The model is analyzing the uploaded image. The first run may take longer while model weights download.';
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      percent = Math.min(percent + (percent < 45 ? 4 : 2), 92);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      const stage = [...stagedMessages].reverse().find(([at]) => percent >= at) || stagedMessages[0];
      progressLabel.textContent = stage[1];
    }, 450);
  }
  function finishProgress() {
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressLabel.textContent = 'Analysis complete';
    setTimeout(() => { progressWrap.hidden = true; analysisPanel.classList.remove('is-loading'); }, 1100);
  }

  async function analyze() {
    if (!selectedFile) return;
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = 'Analyzing… <span aria-hidden="true">◌</span>';
    uploadStatus.textContent = 'Processing image. On the first run, model weights may take a little while to download.';
    startProgress();
    try {
      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);
      const response = await fetch('/api/analyze', { method: 'POST', body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Analysis failed (HTTP ${response.status}).`);
      latestReport = body;
      renderReport(body);
      finishProgress();
      uploadStatus.textContent = 'Analysis complete. Review the report and confirm locally before treatment.';
      showToast('Leaf analysis is ready. Review the result below.');
      resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      clearInterval(progressInterval);
      progressWrap.hidden = true;
      analysisPanel.classList.remove('is-loading');
      uploadStatus.textContent = error.message || 'Unable to analyze this image right now.';
      showToast(error.message || 'Unable to analyze this image right now.', 'error');
      analysisIntro.textContent = 'We could not complete this analysis. Check that the API is running and the model can download.';
    } finally {
      analyzeButton.disabled = !selectedFile;
      analyzeButton.innerHTML = 'Analyze leaf <span aria-hidden="true">→</span>';
    }
  }

  function renderReport(report) {
    document.getElementById('sample-banner').hidden = true;
    document.getElementById('plant-label').textContent = `MODEL MATCH · ${String(report.plant || 'PLANT').toUpperCase()}`;
    document.getElementById('disease-name').textContent = report.disease || 'Uncertain result';
    document.getElementById('disease-scientific').textContent = `${report.severity || 'Screening result'} · confirm locally`;
    const conf = Number(report.confidence || 0);
    const confPill = document.getElementById('confidence-pill');
    confPill.textContent = `${conf.toFixed(1)}% model confidence`;
    confPill.style.background = conf < 45 ? '#fae7d9' : conf < 75 ? '#fff2cf' : '#e0f2dd';
    confPill.style.color = conf < 45 ? '#a14c2c' : conf < 75 ? '#936a16' : '#286d3d';
    document.getElementById('care-summary').textContent = report.summary || 'No summary available.';
    const steps = document.getElementById('care-steps');
    steps.innerHTML = '';
    (report.steps || []).forEach((item) => {
      const li = document.createElement('li'); li.textContent = item; steps.appendChild(li);
    });
    const scheme = report.scheme || {};
    document.querySelector('.scheme-copy strong').textContent = scheme.name || 'Government schemes';
    document.querySelector('.scheme-copy p').textContent = scheme.description || 'Check official scheme conditions and notifications.';
    const schemeLink = document.querySelector('.scheme-copy a');
    schemeLink.href = scheme.url || 'https://pmfby.gov.in/';
    document.getElementById('results-disclaimer').textContent = report.disclaimer || 'Confirm findings with a local agriculture expert before treatment decisions.';
    document.getElementById('analysis-intro').textContent = `Closest match: ${report.disease || 'uncertain'}. Heatmap colours highlight areas that influenced the model output, not a verified disease boundary.`;
    document.getElementById('analysis-original').innerHTML = '';
    const originalImg = document.createElement('img'); originalImg.src = uploadedPreviewUrl; originalImg.alt = 'Original uploaded leaf photo';
    document.getElementById('analysis-original').appendChild(originalImg);
    document.getElementById('analysis-heatmap').innerHTML = '';
    const heatImg = document.createElement('img'); heatImg.src = report.heatmap; heatImg.alt = 'Grad-CAM heatmap overlay from the disease classifier';
    document.getElementById('analysis-heatmap').appendChild(heatImg);
    document.querySelector('.attention-legend small').textContent = 'Grad-CAM attention visualization · not a lesion mask';
    document.getElementById('model-note').textContent = 'Model output generated locally · first run downloads public weights';
    document.getElementById('result-actions').hidden = false;
    if (Array.isArray(report.top_predictions) && report.top_predictions.length) {
      const careSummary = document.getElementById('care-summary');
      const top = document.createElement('small');
      top.className = 'top-matches';
      top.style.cssText = 'display:block;margin-top:8px;color:#728477;font-size:9px;line-height:1.6';
      top.textContent = 'Other model matches: ' + report.top_predictions.slice(1).map(p => `${p.label} (${p.confidence}%)`).join(' · ');
      careSummary.appendChild(top);
    }
  }

  analyzeButton.addEventListener('click', analyze);
  document.getElementById('reset-analysis').addEventListener('click', () => {
    removeFile();
    document.getElementById('upload-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('download-report').addEventListener('click', () => {
    if (!latestReport) return;
    const scheme = latestReport.scheme || {};
    const text = [
      'AgroLens — Leaf Screening Report',
      `Crop: ${latestReport.plant || 'Unknown'}`,
      `Closest model match: ${latestReport.disease || 'Unknown'}`,
      `Model confidence: ${latestReport.confidence ?? 'N/A'}%`,
      `Severity label: ${latestReport.severity || 'Not specified'}`,
      '', 'Summary:', latestReport.summary || '', '', 'Suggested next steps:',
      ...(latestReport.steps || []).map((step, i) => `${i + 1}. ${step}`),
      '', `Scheme resource: ${scheme.name || 'PMFBY'}`,
      scheme.url || 'https://pmfby.gov.in/',
      '', 'Important: This is an AI screening prototype, not a laboratory diagnosis or pesticide prescription. Confirm locally before treatment decisions.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'AgroLens-leaf-report.txt';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  });

  menuToggle.addEventListener('click', () => {
    const nav = document.querySelector('.main-nav');
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', () => {
    document.querySelector('.main-nav').classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));

  // Keep API status visible in the UI without delaying the page render.
  fetch('/api/health').then(r => r.ok ? r.json() : null).then((health) => {
    if (health && health.status === 'ok' && health.model_id) {
      document.getElementById('model-note').textContent = `Public model ready to load on demand · ${health.model_id}`;
    }
  }).catch(() => {
    document.getElementById('model-note').textContent = 'Start the FastAPI server to enable live analysis';
  });
})();
