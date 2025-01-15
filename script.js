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
      const A4_WIDTH = Math.round(210 * (DPI / 25.4));
      const A4_HEIGHT = Math.round(297 * (DPI / 25.4));
      const MM_TO_PX = DPI / 25.4;
      const diameter = Math.round(180 * MM_TO_PX);
      const radius = diameter / 2;
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
            radius,
            diameter
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
  
    // Функция за обработка на едно изображение
    function processSingleImage(file, A4_WIDTH, A4_HEIGHT, centerX, centerY, radius, diameter) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            // Създаване на canvas с размери A4 при 600 DPI
            const canvas = document.createElement('canvas');
            canvas.width = A4_WIDTH;
            canvas.height = A4_HEIGHT;
            const ctx = canvas.getContext('2d');
  
            // Включване на висококачествено изглаждане
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
  
            // Запълване с бял фон
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  
            // Създаване на кръгла маска с желания радиус
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
  
            // Рисуване на изображението така, че да запълни кръга
            ctx.drawImage(img, centerX - radius, centerY - radius, diameter, diameter);
            ctx.restore();
  
            // Генериране на PNG dataURL
            const dataUrl = canvas.toDataURL("image/png");
  
            // Освобождаваме референциите за GC
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
  