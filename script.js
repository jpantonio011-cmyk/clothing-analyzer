(function() {
  'use strict';

  // ---------- DOM refs ----------
  const imageInput = document.getElementById('imageInput');
  const previewImage = document.getElementById('previewImage');
  const fileWrapper = document.getElementById('fileWrapper');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const placeholderMessage = document.getElementById('placeholderMessage');
  const resultContent = document.getElementById('resultContent');
  const descOutput = document.getElementById('descOutput');
  const brandOutput = document.getElementById('brandOutput');
  const priceOutput = document.getElementById('priceOutput');
  const statusMessage = document.getElementById('statusMessage');

  // ---------- State ----------
  const ENDPOINT = 'https://oxford.uk.eu.org/ai/oxford';
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const MAX_DIMENSION = 10000;
  const MAX_SIDE_RESIZE = 1280;
  const TIMEOUT_MS = 75000;

  let currentFile = null;         // original File/Blob
  let currentPreviewUrl = null;   // object URL for preview
  let abortController = null;     // for in-flight request
  let isAnalyzing = false;

  // ---------- Helpers ----------
  function showStatus(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.classList.remove('hidden');
    statusMessage.classList.toggle('error', isError);
  }

  function hideStatus() {
    statusMessage.classList.add('hidden');
    statusMessage.textContent = '';
    statusMessage.classList.remove('error');
  }

  function setLoading(loading) {
    isAnalyzing = loading;
    analyzeBtn.disabled = loading;
    clearBtn.disabled = loading;
    cancelBtn.classList.toggle('hidden', !loading);
    if (loading) {
      analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
    } else {
      analyzeBtn.innerHTML = '🔍 Analyze';
    }
  }

  function resetResults() {
    placeholderMessage.classList.remove('hidden');
    resultContent.classList.add('hidden');
    descOutput.textContent = '—';
    brandOutput.textContent = '—';
    brandOutput.classList.remove('brand-tag');
    priceOutput.textContent = '—';
    priceOutput.classList.remove('price-tag');
    hideStatus();
  }

  function clearPreview() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
    previewImage.src = '#';
    previewImage.classList.add('hidden');
    currentFile = null;
    imageInput.value = '';
    fileWrapper.style.borderColor = '#b8c9dd';
  }

  function resetAll() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setLoading(false);
    clearPreview();
    resetResults();
  }

  // Validate a File object
  function validateFile(file) {
    if (!file) return 'No file selected.';
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Unsupported format. Please use JPEG, PNG, GIF, or WebP.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'Image is too large. Maximum size is 5 MB.';
    }
    return null;
  }

  // Resize + convert an image file to a JPEG Blob using canvas.
  // Returns a Promise<Blob>.
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        // Revoke the temp URL once we have dimensions
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          reject(new Error('Image dimensions are too large (max 10,000 px per side).'));
          return;
        }

        // Determine scale so the longest side is <= MAX_SIDE_RESIZE
        const longest = Math.max(width, height);
        const scale = longest > MAX_SIDE_RESIZE ? MAX_SIDE_RESIZE / longest : 1;
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // Fill white background so transparent PNGs don't become black
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not process the image.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          0.85
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read the image file.'));
      };

      img.src = objectUrl;
    });
  }

  // Defensive JSON extraction (from Oxford rules)
  function extractJson(text) {
    const t = String(text).replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      return null;
    }
  }

  // ---------- File selection handlers ----------
  function handleFile(file) {
    hideStatus();

    const validationError = validateFile(file);
    if (validationError) {
      showStatus(validationError, true);
      clearPreview();
      resetResults();
      return;
    }

    clearPreview();
    currentFile = file;

    // Preview using object URL
    currentPreviewUrl = URL.createObjectURL(file);
    previewImage.src = currentPreviewUrl;
    previewImage.classList.remove('hidden');

    // Reset results view (but keep the preview)
    resetResults();
    fileWrapper.style.borderColor = '#4a7a9c';
  }

  imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag & drop
  fileWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileWrapper.style.borderColor = '#4a7a9c';
    fileWrapper.style.background = '#ffffff';
  });

  fileWrapper.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileWrapper.style.borderColor = '#b8c9dd';
    fileWrapper.style.background = '#ffffffcc';
  });

  fileWrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileWrapper.style.borderColor = '#b8c9dd';
    fileWrapper.style.background = '#ffffffcc';

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Prevent default drag on window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // ---------- Clear button ----------
  clearBtn.addEventListener('click', () => {
    if (isAnalyzing) return;
    resetAll();
    fileWrapper.style.borderColor = '#b8c9dd';
    fileWrapper.style.background = '#ffffffcc';
  });

  // ---------- Cancel button ----------
  cancelBtn.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
      showStatus('Request cancelled.', false);
    }
  });

  // ---------- Analyze ----------
  analyzeBtn.addEventListener('click', async () => {
    if (isAnalyzing) return;
    hideStatus();

    if (!currentFile) {
      showStatus('Please upload a clothing image first.', true);
      return;
    }

    // Re-validate (in case)
    const validationError = validateFile(currentFile);
    if (validationError) {
      showStatus(validationError, true);
      return;
    }

    setLoading(true);
    abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (abortController) abortController.abort();
    }, TIMEOUT_MS);

    try {
      // Resize/convert to JPEG for efficient upload and format compatibility
      let uploadBlob;
      try {
        uploadBlob = await resizeImage(currentFile);
      } catch (resizeErr) {
        throw new Error('Image processing failed: ' + resizeErr.message);
      }

      // Build prompt — request strict JSON
      const prompt = [
        'You are a professional clothing analyst. Analyze the clothing item in the image.',
        '',
        'Respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) using exactly this shape:',
        '{',
        '  "description": "A detailed description of the clothing, minimum 10 words (type, color, style, material, fit, details).",',
        '  "brand": "The brand name if clearly identifiable. If the brand is not clearly known or visible, use exactly \\"Unknown / Generic\\".",',
        '  "price_range": "A realistic price range in Philippine pesos (₱), for example \\"₱500 – ₱1,500\\"."',
        '}',
        '',
        'Rules:',
        '- The description must be at least 10 words long.',
        '- For brand, only state a real brand if you are confident; otherwise use "Unknown / Generic".',
        '- The price range must use the Philippine peso symbol (₱) and reflect typical Philippine retail prices.',
        '- Do not include any explanation or text outside the JSON object.'
      ].join('\n');

      // Build FormData (best for image uploads)
      const form = new FormData();
      form.append('message', prompt);
      form.append('image', uploadBlob, 'clothing.jpg');

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        body: form,
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        // Show data.error when present, map status codes
        let errMsg = (data && data.error) ? data.error : `Request failed (HTTP ${res.status}).`;
        if (res.status === 403) {
          errMsg = 'Available only in the Philippines.';
        } else if (res.status === 413) {
          errMsg = 'Image or request is too large. Try a smaller image.';
        } else if (res.status === 429) {
          const retry = res.headers.get('Retry-After');
          errMsg = 'Too many requests. ' + (retry ? `Wait ${retry} seconds.` : 'Wait a minute.');
        } else if (res.status === 502 || res.status === 503) {
          errMsg = 'AI temporarily unavailable. Please try again shortly.';
        } else if (res.status === 400 && data && data.error) {
          errMsg = data.error;
        }
        throw new Error(errMsg);
      }

      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The AI returned an empty response. Please try again.');
      }

      // Parse the reply defensively
      const parsed = extractJson(data.reply);

      if (parsed && typeof parsed === 'object') {
        const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
        const brand = typeof parsed.brand === 'string' ? parsed.brand.trim() : '';
        const priceRange = typeof parsed.price_range === 'string' ? parsed.price_range.trim() : '';

        // Validate description (minimum 10 words as required)
        const wordCount = description.split(/\s+/).filter(Boolean).length;
        if (!description || wordCount < 10) {
          // Fall back to showing the raw reply if description invalid
          throw new Error('AI response did not meet the minimum description length. Please try again.');
        }

        if (!brand) throw new Error('AI response missing brand information. Please try again.');
        if (!priceRange) throw new Error('AI response missing price range. Please try again.');

        // Render results with textContent (safe)
        descOutput.textContent = description;

        if (brand.toLowerCase() === 'unknown / generic' || brand.toLowerCase() === 'unknown' || brand.toLowerCase() === 'generic') {
          brandOutput.textContent = 'Unknown / Generic';
          brandOutput.classList.remove('brand-tag');
        } else {
          brandOutput.textContent = brand;
          brandOutput.classList.add('brand-tag');
        }

        priceOutput.textContent = priceRange;
        priceOutput.classList.add('price-tag');

        placeholderMessage.classList.add('hidden');
        resultContent.classList.remove('hidden');
      } else {
        // Parsing failed — show raw reply as plain text fallback
        // But we still want structured display. We'll show the reply in the description
        // and mark brand/price as "See description" to avoid empty fields.
        const raw = data.reply.trim();
        descOutput.textContent = raw;
        brandOutput.textContent = 'Unknown / Generic';
        brandOutput.classList.remove('brand-tag');
        priceOutput.textContent = '₱500 – ₱2,000 (estimate)';
        priceOutput.classList.add('price-tag');

        placeholderMessage.classList.add('hidden');
        resultContent.classList.remove('hidden');
        showStatus('The AI response could not be fully parsed. Showing raw reply.', false);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showStatus('Request timed out or cancelled. Please try again.', true);
      } else {
        showStatus(err.message || 'Something went wrong. Please try again.', true);
      }
    } finally {
      clearTimeout(timeoutId);
      abortController = null;
      setLoading(false);
    }
  });

  // Ensure preview hides on error
  previewImage.addEventListener('error', () => {
    previewImage.classList.add('hidden');
  });

  // Initialize
  resetAll();
})();