// prompter.js

const canvasCurrent = document.getElementById('canvas-current');
const ctxCurrent = canvasCurrent.getContext('2d');
const canvasNext = document.getElementById('canvas-next');
const ctxNext = canvasNext.getContext('2d');

const clockEl = document.getElementById('prompter-clock');
const stopwatchEl = document.getElementById('prompter-stopwatch');
const remainingEl = document.getElementById('prompter-remaining');
const remainingContainer = document.getElementById('prompter-remaining-container');
const btnFullscreen = document.getElementById('btn-prompter-fullscreen');
const messageBox = document.getElementById('prompter-message-box');
const messageText = document.getElementById('prompter-message-text');
const layout = document.querySelector('.prompter-layout');

let messageTimeout = null;

// postMessage 전송 함수
function broadcastToPresenter(msg) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(msg, '*');
  }
}

// 전체화면 토글
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.error(err);
  }
}

btnFullscreen.addEventListener('click', toggleFullscreen);

// 더블클릭으로 전체화면
layout.addEventListener('dblclick', toggleFullscreen);

// 전체화면 토글 (f 키보드 입력)
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  }
});

// 발표자로부터 메시지 수신
window.addEventListener('message', (event) => {
  const data = event.data;

  if (data.type === 'RENDER_PROMPTER') {
    renderPrompter(data.currentUrl, data.nextUrl);
  } else if (data.type === 'UPDATE_TIME') {
    clockEl.textContent = data.clock;
    stopwatchEl.textContent = data.stopwatch;
    
    if (data.remainingTime) {
      remainingContainer.style.display = 'flex';
      remainingEl.textContent = data.remainingTime;
      remainingEl.style.color = data.isOverTime ? '#ff0000' : 'var(--accent)';
    } else {
      remainingContainer.style.display = 'none';
    }
  } else if (data.type === 'SHOW_MESSAGE') {
    showMessage(data.text);
  } else if (data.type === 'CLEAR_MESSAGE') {
    clearMessage();
  }
});

function showMessage(text) {
  messageText.textContent = text;
  messageBox.style.display = 'flex';
}

function clearMessage() {
  messageBox.style.display = 'none';
  messageText.textContent = '';
}

function renderPrompter(currentUrl, nextUrl) {
  if (currentUrl) {
    const imgCur = new Image();
    imgCur.onload = () => {
      canvasCurrent.width = imgCur.width;
      canvasCurrent.height = imgCur.height;
      ctxCurrent.drawImage(imgCur, 0, 0);
    };
    imgCur.src = currentUrl;
  }

  if (nextUrl) {
    const imgNext = new Image();
    imgNext.onload = () => {
      canvasNext.width = imgNext.width;
      canvasNext.height = imgNext.height;
      ctxNext.drawImage(imgNext, 0, 0);
    };
    imgNext.src = nextUrl;
  } else {
    // 다음 페이지가 없을 경우 클리어
    ctxNext.clearRect(0, 0, canvasNext.width, canvasNext.height);
  }
}

// 준비 완료 신호
window.onload = () => {
  broadcastToPresenter({ type: 'PROMPTER_READY' });
};
