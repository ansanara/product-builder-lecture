// presenter.js

// 로컬 파일 보안 정책 우회를 위해 Worker 생성을 완벽히 차단하고 메인 스레드에서만 돌리도록 강제
pdfjsLib.GlobalWorkerOptions.disableWorker = true;
if (pdfjsLib.disableWorker !== undefined) {
  pdfjsLib.disableWorker = true;
}

let pdfDoc = null;
let imageSlides = []; // { url, img, dataUrlCache } 객체 배열
let presentationMode = 'pdf'; // 'pdf' 또는 'images'
let pageNum = 1;
let isBlackScreen = false;
let outputWindow = null;
let prompterWindow = null;

// DOM Elements
const uploadInput = document.getElementById('pdf-upload');
const folderUpload = document.getElementById('folder-upload');
const btnOpenOutput = document.getElementById('btn-open-output');
const btnOpenPrompter = document.getElementById('btn-open-prompter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnBlackScreen = document.getElementById('btn-black-screen');
const btnJump = document.getElementById('btn-jump');
const jumpInput = document.getElementById('jump-input');
const prompterMsgInput = document.getElementById('prompter-msg-input');
const btnSendMsg = document.getElementById('btn-send-msg');
const btnClearMsg = document.getElementById('btn-clear-msg');
const msgLog = document.getElementById('msg-log');

const canvasCurrent = document.getElementById('presenter-current-canvas');
const ctxCurrent = canvasCurrent.getContext('2d');
const canvasNext = document.getElementById('presenter-next-canvas');
const ctxNext = canvasNext.getContext('2d');

const currentInfoRow = document.getElementById('current-page-info');
const nextInfoRow = document.getElementById('next-page-info');

// Timer & Clock
const clockEl = document.getElementById('clock');
const stopwatchEl = document.getElementById('stopwatch');
const btnTimerStart = document.getElementById('btn-timer-start');
const btnTimerReset = document.getElementById('btn-timer-reset');
const targetTimeInput = document.getElementById('target-time-input');

let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;

// postMessage 전송 함수
function broadcastToOutput(msg) {
  if (outputWindow && !outputWindow.closed) {
    outputWindow.postMessage(msg, '*');
  }
}

function broadcastToPrompter(msg) {
  if (prompterWindow && !prompterWindow.closed) {
    prompterWindow.postMessage(msg, '*');
  }
}

// 시계 업데이트
setInterval(() => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  clockEl.textContent = timeStr;
  
  // 프롬프터에도 시간 전달
  syncTimeToPrompter();
}, 1000);

function syncTimeToPrompter() {
  const targetMin = parseInt(targetTimeInput.value);
  let remainingTimeStr = null;
  let isOverTime = false;

  if (!isNaN(targetMin) && targetMin > 0) {
    const targetSec = targetMin * 60;
    const diff = targetSec - timerSeconds;
    isOverTime = diff < 0;
    const absDiff = Math.abs(diff);
    const m = String(Math.floor(absDiff / 60)).padStart(2, '0');
    const s = String(absDiff % 60).padStart(2, '0');
    remainingTimeStr = (isOverTime ? '-' : '') + `${m}:${s}`;
  }

  broadcastToPrompter({
    type: 'UPDATE_TIME',
    clock: clockEl.textContent,
    stopwatch: stopwatchEl.textContent,
    remainingTime: remainingTimeStr,
    isOverTime: isOverTime
  });
}

// 타이머 조작
function updateTimerDisplay() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const s = String(timerSeconds % 60).padStart(2, '0');
  stopwatchEl.textContent = `${m}:${s}`;
  
  // 프롬프터 즉시 업데이트
  syncTimeToPrompter();
}

btnTimerStart.addEventListener('click', () => {
  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    btnTimerStart.textContent = 'Start';
  } else {
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
    isTimerRunning = true;
    btnTimerStart.textContent = 'Pause';
  }
});

btnTimerReset.addEventListener('click', () => {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerSeconds = 0;
  targetTimeInput.value = ''; // 목표 시간 초기화
  updateTimerDisplay();
  btnTimerStart.textContent = 'Start';
});


// 창 열기
btnOpenOutput.addEventListener('click', () => {
  outputWindow = window.open('audience.html', 'outputView', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
});

btnOpenPrompter.addEventListener('click', () => {
  prompterWindow = window.open('prompter.html', 'prompterView', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
});

// 동일 파일을 다시 열어도 작동하게 만들기 위한 초기화
uploadInput.addEventListener('click', (e) => {
  e.target.value = null;
});

// PDF 로드
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.onload = async function () {
    const bufferCurrent = this.result;

    try {
      if (typeof pdfjsLib === 'undefined') {
        window.pdfjsLib = window['pdfjs-dist/build/pdf'];
      }

      pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bufferCurrent) }).promise;
      presentationMode = 'pdf';
      pageNum = 1;

      renderPresenter();
    } catch (err) {
      console.error(err);
      alert('PDF Load Error: ' + (err.message || err));
    }
  };
  fileReader.readAsArrayBuffer(file);
});

// 이미지 폴더 로드
folderUpload.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  // 이미지 파일 또는 확장자 기반 필터링
  const imageFiles = files.filter(f => {
    const isImageType = f.type.startsWith('image/');
    const isImageExt = /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name);
    return isImageType || isImageExt;
  });
  
  if (imageFiles.length === 0) {
    alert('No supported image files found (jpg, png, webp, etc.) in the folder.');
    return;
  }

  // 파일 이름 순으로 숫자 정렬 (Natural Sort)
  imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // 기존 리소스 해제
  imageSlides.forEach(item => {
    if (item && item.url) URL.revokeObjectURL(item.url);
  });
  
  // 이미지 사전 로드 시작
  imageSlides = [];
  presentationMode = 'images';
  pageNum = 1;

  console.log(`Preparing ${imageFiles.length} images...`);

  // 병렬로 이미지 로드
  const loadPromises = imageFiles.map(file => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ url, img, dataUrlCache: null });
      };
      img.onerror = () => {
        console.error('Image load failed:', file.name);
        resolve(null);
      };
      img.src = url;
    });
  });

  const results = await Promise.all(loadPromises);
  imageSlides = results.filter(r => r !== null);
  
  console.log(`Ready: ${imageSlides.length} slides`);
  renderPresenter();
});

// 이미지 전용 렌더링 함수 (이미 로드된 Image 객체 사용)
async function renderImageToCanvas(item, canvas, ctx, scale = 1.2) {
  if (!item || !item.img) return;
  const img = item.img;
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

async function renderPageUrl(num, scale) {
  if (presentationMode === 'pdf') {
    if (!pdfDoc || num < 1 || num > pdfDoc.numPages) return null;
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: scale });

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;

    const renderContext = { canvasContext: tempCtx, viewport: viewport };
    await page.render(renderContext).promise;

    return {
      canvasUrl: tempCanvas.toDataURL('image/jpeg', 0.90),
      width: tempCanvas.width,
      height: tempCanvas.height
    };
  } else {
    // 이미지 모드: 캐시된 데이터가 있으면 즉시 반환
    if (num < 1 || num > imageSlides.length) return null;
    const item = imageSlides[num - 1];
    
    if (item.dataUrlCache) {
      return item.dataUrlCache;
    }

    // 캐시가 없으면 생성
    const img = item.img;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // 전송 속도 최적화를 위한 해상도 제한 (최대 1920px)
    let finalScale = 1.0;
    if (img.width > 1920) {
      finalScale = 1920 / img.width;
    }

    tempCanvas.width = img.width * finalScale;
    tempCanvas.height = img.height * finalScale;
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'medium';
    tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
    
    const result = {
      canvasUrl: tempCanvas.toDataURL('image/jpeg', 0.75), // 전송 성능 극대화
      width: tempCanvas.width,
      height: tempCanvas.height
    };
    
    item.dataUrlCache = result; // 캐시에 저장
    return result;
  }
}

async function renderPresenter() {
  const totalPages = presentationMode === 'pdf' ? (pdfDoc ? pdfDoc.numPages : 0) : imageSlides.length;
  if (totalPages === 0) return;

  currentInfoRow.textContent = `${pageNum} / ${totalPages}`;

  // 발표자 화면 렌더링
  if (presentationMode === 'pdf') {
    const page = await pdfDoc.getPage(pageNum);
    const vpCur = page.getViewport({ scale: 1.2 });
    canvasCurrent.width = vpCur.width;
    canvasCurrent.height = vpCur.height;
    await page.render({ canvasContext: ctxCurrent, viewport: vpCur }).promise;
  } else {
    await renderImageToCanvas(imageSlides[pageNum - 1], canvasCurrent, ctxCurrent, 1.2);
  }

  if (pageNum < totalPages) {
    nextInfoRow.textContent = `${pageNum + 1} / ${totalPages}`;
    if (presentationMode === 'pdf') {
      const pageNext = await pdfDoc.getPage(pageNum + 1);
      const vpNext = pageNext.getViewport({ scale: 1.2 });
      canvasNext.width = vpNext.width;
      canvasNext.height = vpNext.height;
      await pageNext.render({ canvasContext: ctxNext, viewport: vpNext }).promise;
    } else {
      await renderImageToCanvas(imageSlides[pageNum], canvasNext, ctxNext, 1.2);
    }
  } else {
    nextInfoRow.textContent = 'Last Page';
    ctxNext.clearRect(0, 0, canvasNext.width, canvasNext.height);
  }

  // 렌더링이 끝나면 외부 화면들로 전송
  broadcastPageChange();
}

async function broadcastPageChange() {
  if ((!outputWindow || outputWindow.closed) && (!prompterWindow || prompterWindow.closed)) return;

  const totalPages = presentationMode === 'pdf' ? (pdfDoc ? pdfDoc.numPages : 0) : imageSlides.length;
  if (totalPages === 0) return;

  // 고화질 렌더링
  const currentData = await renderPageUrl(pageNum, 3.5);
  if (!currentData) return;

  // 출력 모니터 전송
  if (outputWindow && !outputWindow.closed) {
    const mode = document.querySelector('input[name="transition"]:checked').value;
    broadcastToOutput({
      type: 'RENDER_IMAGE',
      dataUrl: currentData.canvasUrl,
      transitionMode: mode
    });
  }

  // 프롬프터 모니터 전송 (다음 페이지 포함)
  if (prompterWindow && !prompterWindow.closed) {
    let nextDataUrl = null;
    if (pageNum < totalPages) {
      const nextData = await renderPageUrl(pageNum + 1, 2.0); // 프롬프터용은 2배면 충분
      nextDataUrl = nextData ? nextData.canvasUrl : null;
    }

    broadcastToPrompter({
      type: 'RENDER_PROMPTER',
      currentUrl: currentData.canvasUrl,
      nextUrl: nextDataUrl
    });
  }
}

function goPrev() {
  if (pageNum <= 1) return;
  pageNum--;
  renderPresenter();
}

function goNext() {
  const totalPages = presentationMode === 'pdf' ? (pdfDoc ? pdfDoc.numPages : 0) : imageSlides.length;
  if (pageNum >= totalPages) return;
  pageNum++;
  renderPresenter();
}

function toggleBlackScreen() {
  isBlackScreen = !isBlackScreen;
  broadcastToOutput({ type: 'TOGGLE_BLACK', isBlack: isBlackScreen });

  if (isBlackScreen) {
    btnBlackScreen.classList.remove('btn-danger');
    btnBlackScreen.classList.add('btn-primary');
    btnBlackScreen.textContent = 'Resume (B)';
  } else {
    btnBlackScreen.classList.remove('btn-primary');
    btnBlackScreen.classList.add('btn-danger');
    btnBlackScreen.textContent = 'Black Screen (B)';
  }
}

// 버튼 리스너
btnPrev.addEventListener('click', goPrev);
btnNext.addEventListener('click', goNext);
btnBlackScreen.addEventListener('click', toggleBlackScreen);

btnJump.addEventListener('click', () => {
  const target = parseInt(jumpInput.value);
  const totalPages = presentationMode === 'pdf' ? (pdfDoc ? pdfDoc.numPages : 0) : imageSlides.length;
  if (totalPages > 0 && target >= 1 && target <= totalPages) {
    pageNum = target;
    renderPresenter();
  }
});

jumpInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    btnJump.click();
  }
});

// 프롬프터 메시지 전송
function sendPrompterMessage() {
  const text = prompterMsgInput.value.trim();
  if (text) {
    broadcastToPrompter({ type: 'SHOW_MESSAGE', text: text });
    
    // 로그 추가
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const logItem = document.createElement('div');
    logItem.className = 'msg-log-item';
    logItem.innerHTML = `[${timeStr}] <b>Sent:</b> ${text}`;
    msgLog.appendChild(logItem);
    
    // 하단으로 자동 스크롤
    msgLog.scrollTop = msgLog.scrollHeight;
    
    prompterMsgInput.value = '';
  }
}

btnSendMsg.addEventListener('click', sendPrompterMessage);
prompterMsgInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    sendPrompterMessage();
  }
});

btnClearMsg.addEventListener('click', () => {
  broadcastToPrompter({ type: 'CLEAR_MESSAGE' });
  
  // 지우기 기록 로그 추가
  const logItem = document.createElement('div');
  logItem.className = 'msg-log-item';
  logItem.style.color = 'var(--danger)';
  logItem.innerHTML = `--- Message Cleared ---`;
  msgLog.appendChild(logItem);
});

window.addEventListener('beforeunload', () => {
  if (outputWindow && !outputWindow.closed) {
    outputWindow.close();
  }
  if (prompterWindow && !prompterWindow.closed) {
    prompterWindow.close();
  }
});

// 키보드 제어
window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      e.preventDefault(); goNext(); break;
    case 'ArrowLeft':
    case 'PageUp':
    case 'Backspace':
      e.preventDefault(); goPrev(); break;
    case 'b':
    case 'B':
      e.preventDefault(); toggleBlackScreen(); break;
  }
});

window.addEventListener('message', (event) => {
  if (event.data.type === 'AUDIENCE_READY' || event.data.type === 'PROMPTER_READY') {
    const totalPages = presentationMode === 'pdf' ? (pdfDoc ? pdfDoc.numPages : 0) : imageSlides.length;
    if (totalPages > 0) {
      broadcastPageChange();
    }
  }
});
