document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reportForm');
  const getLoc = document.getElementById('getLoc');
  const locStatus = document.getElementById('locStatus');
  const preview = document.getElementById('preview');
  const imageInput = document.getElementById('imageInput');
  const openCamera = document.getElementById('openCamera');
  const cameraModal = document.getElementById('cameraModal');
  const cameraVideo = document.getElementById('cameraVideo');
  const captureBtn = document.getElementById('captureBtn');
  const closeCamera = document.getElementById('closeCamera');
  const captureCanvas = document.getElementById('captureCanvas');
  const gallery = document.getElementById('gallery');
  let cameraStream = null;
  let capturedBlob = null;

  // If this script runs on a page without the report form, avoid attaching handlers
  // but still allow gallery-only pages to load images.
  function safeLoadGalleryIfNeeded() {
    if (gallery) loadGallery().catch(() => {});
  }

  // Location button (guarded)
  if (getLoc) {
    getLoc.addEventListener('click', () => {
      requestLocation();
    });
  }

  // Automatically request location when page loads (only if locStatus exists)
  (function autoRequestLocation(){
    if (locStatus) requestLocation();
  })();

  function requestLocation(){
    if (locStatus) locStatus.textContent = 'Getting location...';
    if (!navigator.geolocation) {
      locStatus.textContent = '❌ Geolocation not supported in this browser';
      locStatus.style.color = '#d32f2f';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latEl = document.getElementById('latitude');
        const lonEl = document.getElementById('longitude');
        if (latEl) latEl.value = pos.coords.latitude;
        if (lonEl) lonEl.value = pos.coords.longitude;
        if (locStatus) {
          locStatus.textContent = `✓ Location set (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`;
          locStatus.style.color = '#2e7d32';
        }
      },
      (err) => {
        let msg = 'Location unavailable';
        if (err.code === 1) {
          msg = '❌ Permission denied - Please allow location access in browser settings';
        } else if (err.code === 2) {
          msg = '❌ Location unavailable - Check your internet connection';
        } else if (err.code === 3) {
          msg = '❌ Location request timed out - Try again';
        }
        if (locStatus) {
          locStatus.textContent = msg;
          locStatus.style.color = '#d32f2f';
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  // File input preview removed

  // Open file button (explicit) - triggers the file input
  const openFileBtn = document.getElementById('openFileBtn');
  if (openFileBtn && imageInput) {
    openFileBtn.addEventListener('click', () => {
      imageInput.click();
    });
  }

  // Camera modal handlers (guarded)
  if (openCamera && cameraModal && cameraVideo) {
    openCamera.addEventListener('click', async () => {
      cameraModal.classList.remove('d-none');
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();
      } catch (err) {
        alert('Unable to open camera: ' + err.message);
        cameraModal.classList.add('d-none');
      }
    });
  }

  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
    if (!cameraStream) return;
    const vw = cameraVideo.videoWidth || 640;
    const vh = cameraVideo.videoHeight || 480;
    captureCanvas.width = vw;
    captureCanvas.height = vh;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, vw, vh);
    captureCanvas.toBlob((blob) => {
      capturedBlob = blob;
      stopCamera();
      cameraModal.classList.add('d-none');
      document.getElementById('formMsg').innerHTML = '<div class="alert alert-info">Photo captured — press <strong>Submit Report</strong> to upload.</div>';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = false;
    }, 'image/jpeg', 0.9);
    });
  }

  if (closeCamera) {
    closeCamera.addEventListener('click', () => {
      stopCamera();
      if (cameraModal) cameraModal.classList.add('d-none');
    });
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
  }

  // Submit handler (guarded)
  if (form) {
    form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const msg = document.getElementById('formMsg');
    msg.textContent = '';

    // Strict name validation
    const name = form.name.value.trim();
    if (name && !/^[A-Za-z\s]+$/.test(name)) {
      msg.innerHTML = '<div class="alert alert-warning">Name must contain only letters and spaces.</div>';
      return;
    }
    // Strict phone validation
    const phone = form.phone.value.trim();
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      msg.innerHTML = '<div class="alert alert-warning">Phone must be a valid Indian number (10 digits, starts with 6-9).</div>';
      return;
    }
    // Ensure geolocation present
    if (!fd.get('latitude') || !fd.get('longitude')) {
      msg.innerHTML = '<div class="alert alert-warning">Please click <strong>Get Location</strong> before submitting.</div>';
      return;
    }
    // Ensure at least one image exists (file input or captured blob)
    const fileInput = imageInput && imageInput.files && imageInput.files[0];
    if (!fileInput && !capturedBlob) {
      msg.innerHTML = '<div class="alert alert-warning">Please capture a photo or choose a file before submitting.</div>';
      return;
    }
    // If both exist, send both: file as 'image', captured as 'captured_image' (base64)
    if (fileInput) {
      fd.set('image', fileInput);
    }
    if (capturedBlob) {
      // Convert blob to base64 and append as 'captured_image'
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(capturedBlob);
      });
      fd.set('captured_image', base64);
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    msg.innerHTML = '<div class="alert alert-primary">Uploading...</div>';
    try {
      const res = await fetch('/api/report', { method: 'POST', body: fd });
      let j = null;
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (ctype.includes('application/json')) {
        j = await res.json();
      } else {
        // Non-JSON response (likely an HTML error page). Read text and show concise info.
        const txt = await res.text();
        throw new Error(`Server responded ${res.status}: ${txt.slice(0,200).replace(/\s+/g,' ')}${txt.length>200? '...':''}`);
      }
      if (!res.ok) throw new Error(j.error || `Server responded ${res.status}`);
      msg.innerHTML = '<div class="alert alert-success">Report submitted. Thank you.</div>';
      form.reset();
      if (preview) preview.classList.add('d-none');
      locStatus.textContent = 'Location required for submission';
      capturedBlob = null;
        safeLoadGalleryIfNeeded(); // Refresh gallery after submit
    } catch (err) {
      msg.innerHTML = `<div class='alert alert-primary'>${err.message}</div>`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    }); // end submit handler
  } // end if(form)

  // Gallery: fetch and display recent images
  async function loadGallery() {
    if (!gallery) return;
    gallery.innerHTML = '<div class="text-muted">Loading...</div>';
    try {
      const res = await fetch('/api/gallery');
      if (!res.ok) throw new Error('Failed to load gallery');
      const data = await res.json();
      if (!Array.isArray(data.images) || !data.images.length) {
        gallery.innerHTML = '<div class="text-muted">No reports yet.</div>';
        return;
      }
      gallery.innerHTML = '';
      data.images.forEach(img => {
        const div = document.createElement('div');
        div.innerHTML = `<img src="${img}" class="gallery-img" alt="report image">`;
        gallery.appendChild(div.firstChild);
      });
    } catch (e) {
      gallery.innerHTML = '<div class="text-primary">Could not load images.</div>';
    }
  }

  // Load gallery on pages that include it
  safeLoadGalleryIfNeeded();
});
      // If a captured blob exists (from camera), append it as the image
