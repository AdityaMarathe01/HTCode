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
  let cameraStream = null;
  let capturedBlob = null;

  // Location button
  getLoc.addEventListener('click', () => {
    requestLocation();
  });

  // Try to obtain location automatically on load
  (function tryAutoLocation(){
    // attempt but do not block UI if denied
    if (navigator.geolocation) {
      requestLocation();
    } else {
      locStatus.textContent = 'Geolocation not supported';
    }
  })();

  function requestLocation(){
    locStatus.textContent = 'Getting location...';
    if (!navigator.geolocation) {
      locStatus.textContent = 'Geolocation not supported';
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      form.latitude.value = pos.coords.latitude;
      form.longitude.value = pos.coords.longitude;
      locStatus.textContent = `Location set (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`;
    }, (err) => {
      if (err && err.code === err.PERMISSION_DENIED) locStatus.textContent = 'Location permission denied';
      else locStatus.textContent = 'Location unavailable';
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  // File input preview
  imageInput.addEventListener('change', () => {
    const f = imageInput.files && imageInput.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    preview.src = url;
    preview.classList.remove('d-none');
    capturedBlob = null; // clear previous capture if user selected a file
    document.getElementById('formMsg').innerHTML = '';
  });

  // Camera modal handlers
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
      const url = URL.createObjectURL(blob);
      preview.src = url;
      preview.classList.remove('d-none');
      stopCamera();
      cameraModal.classList.add('d-none');
      document.getElementById('formMsg').innerHTML = '<div class="alert alert-info">Photo captured — review preview and press <strong>Submit Report</strong> to upload.</div>';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = false;
    }, 'image/jpeg', 0.9);
  });

  closeCamera.addEventListener('click', () => {
    stopCamera();
    cameraModal.classList.add('d-none');
  });

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
  }

  // Submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const msg = document.getElementById('formMsg');
    msg.textContent = '';
    // Ensure geolocation present
    if (!fd.get('latitude') || !fd.get('longitude')) {
      msg.innerHTML = '<div class="alert alert-warning">Please click <strong>Get Location</strong> before submitting.</div>';
      return;
    }
    // Ensure an image exists (file input or captured blob)
    const fileInput = imageInput.files && imageInput.files[0];
    if (!fileInput && !capturedBlob) {
      msg.innerHTML = '<div class="alert alert-warning">Please capture a photo or choose a file before submitting.</div>';
      return;
    }
    if (capturedBlob) {
      fd.delete('image');
      fd.append('image', capturedBlob, 'capture.jpg');
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    msg.innerHTML = '<div class="alert alert-primary">Uploading...</div>';
    try {
      const res = await fetch('/api/report', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      msg.innerHTML = '<div class="alert alert-success">Report submitted. Thank you.</div>';
      form.reset();
      preview.classList.add('d-none');
      locStatus.textContent = 'Location required for submission';
      capturedBlob = null;
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
      // If a captured blob exists (from camera), append it as the image
