window.IndexBatchForm = (() => {
  function qs(id) {
    return document.getElementById(id);
  }

  function open(mode = 'add', batch = null) {
    const sheet = qs('addSheet');
    const title = qs('sheetTitle');
    const preview = qs('imagePreview');
    const submitText = qs('submitBatchBtn');

    AppState.merge({
      ui: {
        batchForm: {
          mode,
          editId: batch?.batch_id || null,
          imageBase64: null,
          permission: batch?.permission || 'write'
        }
      }
    });

    reset();

    if (mode === 'edit' && batch) {
      title.textContent = 'แก้ไขข้อมูลชุดสัตว์';
      submitText.textContent = 'บันทึกการแก้ไข';

      qs('ab_species').value = toDisplaySpecie(batch.batch_specie);
      qs('ab_name').value = batch.batch_name || '';
      qs('ab_initqty').value = batch.batch_iniqty ?? '';
      qs('ab_currqty').value = batch.batch_curqty ?? '';
      qs('ab_unitprice').value = batch.batch_unitprice ?? '';
      qs('ab_status').value = String(batch.batch_status ?? 1);
      qs('ab_startDate').value = batch.batch_stdate || '';
      qs('ab_endDate').value = batch.batch_endate || '';
      qs('ab_remark').value = batch.batch_remark || '';
      qs('ab_species').disabled = batch.permission === 'read';

      if (batch.batch_imgurl) {
        preview.src = AppConfig.imageUrlFromId(batch.batch_imgurl);
        preview.classList.remove('hidden');
      }
    } else {
      title.textContent = 'เพิ่มชุดสัตว์ใหม่';
      submitText.textContent = 'บันทึกข้อมูล';
      qs('ab_species').disabled = false;
    }

    bindImageInput();
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }

  function close() {
    const sheet = qs('addSheet');
    sheet.classList.remove('show');
    setTimeout(() => {
      sheet.classList.add('hidden');
      reset();
      AppState.merge({
        ui: {
          batchForm: {
            mode: 'add',
            editId: null,
            imageBase64: null
          }
        }
      });
    }, 250);
  }

  function reset() {
    const form = qs('batchForm');
    form?.reset();
    qs('ab_status').value = '1';
    qs('ab_species').disabled = false;
    qs('batchImage').value = '';
    qs('imagePreview').src = '';
    qs('imagePreview').classList.add('hidden');
  }

  function bindImageInput() {
    const input = qs('batchImage');
    if (!input) return;

    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const base64 = await fileToBase64(file);
      const resized = await resizeImage(base64, 1200, 800, 0.82);

      AppState.patch('ui.batchForm.imageBase64', resized);

      const preview = qs('imagePreview');
      preview.src = resized;
      preview.classList.remove('hidden');
    };
  }

  async function submit() {
    const mode = AppState.get().ui.batchForm.mode;
    const editId = AppState.get().ui.batchForm.editId;

    const specie = normalizeSpecie(qs('ab_species').value);
    const payload = {
      action: mode === 'edit' ? 'edit_batch' : 'add_batch',
      bid: editId,
      ab_species: specie,
      ab_name: qs('ab_name').value.trim(),
      ab_unitprice: Number(qs('ab_unitprice').value) || 0,
      ab_initqty: Number(qs('ab_initqty').value) || 0,
      ab_currqty: Number(qs('ab_currqty').value || qs('ab_initqty').value) || 0,
      ab_status: Number(qs('ab_status').value) || 0,
      ab_startDate: qs('ab_startDate').value || '',
      ab_endDate: qs('ab_endDate').value || '',
      ab_remark: qs('ab_remark').value.trim(),
      image_base64: AppState.get().ui.batchForm.imageBase64
    };

    if (mode === 'edit' && AppState.get().ui.batchForm.permission === 'read') {
      alert('คุณไม่มีสิทธิ์แก้ไข batch นี้');
      return;
    }

    if (!payload.ab_name || !payload.ab_species) {
      alert('กรุณากรอกชื่อและชนิดสัตว์');
      return;
    }

    const submitButton = qs('submitBatchBtn');
    const previousText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const response = await AppApi.post(payload);

    submitButton.disabled = false;
    submitButton.textContent = previousText;

    if (!response || response.status !== 'ok') {
      alert(response?.message || 'ไม่สามารถบันทึกข้อมูลได้');
      return;
    }

    if (payload.action === 'edit_batch' && response.updated) {
      IndexPage.updateBatchInState(response.updated);
    } else if (payload.action === 'add_batch' && response.created) {
      IndexPage.prependBatchToState(response.created);
    } else {
      AppCache.clearBatchCache();
      await IndexPage.loadBatches({ forceRefresh: true });
    }

    close();
  }

  function normalizeSpecie(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'เป็ด' || raw === 'duck') return 'duck';
    if (raw === 'ปลา' || raw === 'fish') return 'fish';
    return raw;
  }

  function toDisplaySpecie(value) {
    if (value === 'duck') return 'เป็ด';
    if (value === 'fish') return 'ปลา';
    return value || '';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function resizeImage(base64, maxWidth, maxHeight, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        let { width, height } = image;
        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = base64;
    });
  }

  return { open, close, submit };
})();
