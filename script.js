document.addEventListener('DOMContentLoaded', function() {
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
    processBtn.addEventListener('click', () => {
      if (filesArray.length === 0) {
        alert("Моля, първо избери изображения!");
        return;
      }
      startProcessing();
      processImages();
    });
    
    // Функции за показване и скриване на лоудинг индикатора
    function startProcessing() {
      processBtn.disabled = true;
      processBtn.innerHTML = '<span class="spinner"></span> Обработване...';
    }
    
    function endProcessing() {
      processBtn.disabled = false;
      processBtn.innerHTML = 'Обработи снимките';
    }
    
    // Функция за обработка на изображенията
    function processImages() {
      const zip = new JSZip();
      let processedCount = 0;
    
      filesArray.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            // Създаване на canvas с размери A4 при 300 DPI (2480 x 3508 пиксела)
            const A4_WIDTH = 2480;
            const A4_HEIGHT = 3508;
            const canvas = document.createElement('canvas');
            canvas.width = A4_WIDTH;
            canvas.height = A4_HEIGHT;
            const ctx = canvas.getContext('2d');
    
            // Настройка на висококачествено изглаждане
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
    
            // Запълване с бял фон
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
    
            // Пресмятаме диаметъра в пиксели за 175 мм
            const MM_TO_PX = 300 / 25.4;  
            const diameter = 175 * MM_TO_PX; // фиксиран диаметър от 175 мм (~2067 пиксела)
            const radius = diameter / 2;
            const centerX = A4_WIDTH / 2;
            const centerY = A4_HEIGHT / 2;
    
            // Създаване на кръгла маска
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
    
            // Рисуване на изображението така, че да запълни кръгът
            ctx.drawImage(img, centerX - radius, centerY - radius, diameter, diameter);
            ctx.restore();
    
            // Генериране на PNG dataURL
            const dataUrl = canvas.toDataURL("image/png");
    
            // Променяме името на файла – премахваме оригиналното разширение и добавяме .png
            let baseName = file.name;
            if (baseName.lastIndexOf('.') > 0) {
              baseName = baseName.substring(0, baseName.lastIndexOf('.'));
            }
            zip.file("modified_" + baseName + ".png", dataUrl.split(',')[1], { base64: true });
            
            processedCount++;
            if (processedCount === filesArray.length) {
              // След обработката на всички изображения генерираме ZIP архива и го изтегляме
              zip.generateAsync({ type: "blob" }).then((content) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(content);
                a.download = "modified_images.zip";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                endProcessing();
              });
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  });
  