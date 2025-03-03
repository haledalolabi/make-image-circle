document.addEventListener('DOMContentLoaded', function () {
  // DOM елементи
  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('fileElem');
  const fileList = document.getElementById('fileList');
  const processBtn = document.getElementById('processBtn');

  // Масив за съхранение на избраните файлове
  let filesArray = [];

  // Функция за обновяване на списъка с имената на файловете
  function updateFileList() {
    fileList.innerHTML = '';
    filesArray.forEach(file => {
      const li = document.createElement('li');
      li.textContent = file.name;
      fileList.appendChild(li);
    });
  }

  // Обработка при избор чрез файловия диалог
  fileInput.addEventListener('change', (e) => {
    filesArray = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
    updateFileList();
  });

  // Предотвратяване на стандартното поведение при drag & drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Добавяне на hover стил когато файловете са над drop зоната
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('hover'), false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('hover'), false);
  });

  // Обработка при drop събитието
  dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    filesArray = Array.from(files).filter(file => file.type.startsWith('image/'));
    updateFileList();
  });

  // Обработка при клик върху бутона за обработка
  processBtn.addEventListener('click', async () => {
    if (filesArray.length === 0) {
      alert("Моля, първо избери изображения!");
      return;
    }
    startProcessing();
    try {
      // Примерно ограничаваме едновременната обработка до 5 задачи
      const concurrencyLimit = 5;
      await processImagesWithConcurrencyLimit(concurrencyLimit);
    } catch (err) {
      console.error("Грешка при обработката:", err);
      alert("Възникна грешка при обработката.");
    }
    endProcessing();
  });

  // Функции за показване и скриване на лоудинг индикатора / прогреса
  function startProcessing() {
    processBtn.disabled = true;
    // Първоначален надпис с 0% прогрес
    processBtn.innerHTML = 'Обработени 0 от ' + filesArray.length + ' (0%)';
  }
  function endProcessing() {
    processBtn.disabled = false;
    processBtn.innerHTML = 'Обработи снимките';
  }

  /**
   * Функция, която обработва изображенията с ограничен брой едновременни задачи.
   * @param {number} limit - Максимален брой паралелно изпълнявани задачи.
   */
  async function processImagesWithConcurrencyLimit(limit) {
    const zip = new JSZip();

    // Настройки: 300 DPI за печат
    const DPI = 300;
    const MM_TO_PX = DPI / 25.4;
    const A4_WIDTH = Math.round(210 * (DPI / 25.4));
    const A4_HEIGHT = Math.round(297 * (DPI / 25.4));

    // Външен (пълен) кръг с диаметър 180mm
    const outerDiameter = Math.round(180 * MM_TO_PX);
    const outerRadius = outerDiameter / 2;
    // Черната рамка ще бъде с дебелина 3mm
    const borderPx = Math.round(1 * MM_TO_PX);
    // Вътрешният кръг, в който се рисува изображението, се получава като се намали радиусът с borderPx
    const innerRadius = outerRadius - borderPx;
    // Центрираме кръга върху A4 листа
    const centerX = A4_WIDTH / 2;
    const centerY = A4_HEIGHT / 2;

    // Създаваме списък от функции, които връщат промиси за обработка на всяко изображение
    const tasks = filesArray.map(file => async () => {
      try {
        const dataUrl = await processSingleImage(
          file,
          A4_WIDTH,
          A4_HEIGHT,
          centerX,
          centerY,
          innerRadius,
          borderPx
        );
        let baseName = file.name;
        if (baseName.lastIndexOf('.') > 0) {
          baseName = baseName.substring(0, baseName.lastIndexOf('.'));
        }
        // Връщаме обект, който съдържа името и генерирания dataUrl
        return { name: "modified_" + baseName + ".png", dataUrl };
      } catch (error) {
        console.error("Грешка при обработка на файл:", file.name, error);
        return null;
      }
    });

    // Използваме пул за ограничаване на едновременните задачи
    const results = await promisePool(tasks, limit);

    // Добавяме успешно обработените файлове към zip архива
    results.forEach(imageData => {
      if (imageData) {
        // Запазваме само base64 частта след запетаята
        zip.file(imageData.name, imageData.dataUrl.split(',')[1], { base64: true });
      }
    });

    // Генерираме и сваляме ZIP архива
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "modified_images.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Функция за ограничаване на едновременните промиси и показване на прогрес.
   * @param {Array<Function>} tasks - Масив от функции, които връщат промиси.
   * @param {number} concurrencyLimit - Максимален брой едновременни задачи.
   * @returns {Promise<Array>} - Промис, който връща резултатите от всички задачи.
   */
  async function promisePool(tasks, concurrencyLimit) {
    const results = [];
    let currentIndex = 0;
    const executing = [];
    let completed = 0;
    const total = tasks.length;

    // Функция за обновяване на прогреса
    const updateProgress = () => {
      const percentage = Math.round((completed / total) * 100);
      processBtn.innerHTML = `Обработени ${completed} от ${total} (${percentage}%)`;
    };

    const enqueue = async () => {
      if (currentIndex === tasks.length) {
        return Promise.resolve();
      }
      // Стартираме текущата задача
      const taskPromise = tasks[currentIndex++]();
      results.push(taskPromise);
      const p = taskPromise.then((result) => {
        completed++;
        updateProgress();
        executing.splice(executing.indexOf(p), 1);
        return result;
      });
      executing.push(p);

      let next = Promise.resolve();
      if (executing.length >= concurrencyLimit) {
        // Изчакваме най-бързата завършваща задача, преди да стартираме нова
        next = Promise.race(executing);
      }
      await next;
      return enqueue();
    };

    await enqueue();
    return Promise.all(results);
  }

  /**
   * Функция за обработка на едно изображение.
   * @param {File} file - Изображението за обработка.
   * @param {number} A4_WIDTH - Ширина на A4 формата.
   * @param {number} A4_HEIGHT - Височина на A4 формата.
   * @param {number} centerX - X-координата на центъра.
   * @param {number} centerY - Y-координата на центъра.
   * @param {number} innerRadius - Радиусът на вътрешния кръг (за изображението).
   * @param {number} borderPx - Дебелината на черната рамка (в px).
   * @returns {Promise<string>} - Промис, който връща dataURL на PNG изображението.
   */
  function processSingleImage(file, A4_WIDTH, A4_HEIGHT, centerX, centerY, innerRadius, borderPx) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas for A4 size
          const canvas = document.createElement('canvas');
          canvas.width = A4_WIDTH;
          canvas.height = A4_HEIGHT;
          const ctx = canvas.getContext('2d');
  
          // Enable high quality smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
  
          // Fill with white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  
          // Calculate the white margin in pixels (3mm)
          const whiteSpacePx = Math.round(3 * (ctx.canvas.width / A4_WIDTH * (300 / 25.4))); // or use MM_TO_PX if available
          // Alternatively, if MM_TO_PX is in scope:
          // const whiteSpacePx = Math.round(3 * MM_TO_PX);
  
          // Calculate the radius for the image drawing area
          const imageDrawRadius = innerRadius - whiteSpacePx;
  
          // Create a mask for the circle where the image will be drawn
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY, imageDrawRadius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
  
          // Draw the image to fill the smaller circle
          ctx.drawImage(
            img,
            centerX - imageDrawRadius,
            centerY - imageDrawRadius,
            imageDrawRadius * 2,
            imageDrawRadius * 2
          );
          ctx.restore();
  
          // Draw the black border (unchanged)
          const strokeRadius = innerRadius + borderPx / 2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, strokeRadius, 0, Math.PI * 2);
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = borderPx;
          ctx.stroke();
  
          // Generate PNG dataURL
          const dataUrl = canvas.toDataURL("image/png");
  
          // Free resources
          canvas.width = canvas.height = 0;
  
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
});