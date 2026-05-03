// audience.js

let currentCanvas = 1;
const canvas1 = document.getElementById('canvas-1');
const canvas2 = document.getElementById('canvas-2');
const ctx1 = canvas1.getContext('2d');
const ctx2 = canvas2.getContext('2d');
const blackScreen = document.getElementById('black-screen');
const layout = document.getElementById('audience-layout');

// postMessage 전송 함수
function broadcastToPresenter(msg) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(msg, '*');
  }
}

// 전체화면 토글 함수
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.error("Error attempting to toggle fullscreen:", err);
  }
}

// 더블클릭으로 전체화면
layout.addEventListener('dblclick', toggleFullscreen);

// 페이지 로드 시 즉시 준비 완료 신호 전송
window.addEventListener('load', () => {
  broadcastToPresenter({ type: 'AUDIENCE_READY' });
});

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

  if (data.type === 'RENDER_IMAGE') {
    renderImage(data.dataUrl, data.transitionMode);
  }
  else if (data.type === 'TOGGLE_BLACK') {
    if (data.isBlack) {
      blackScreen.classList.add('active');
    } else {
      blackScreen.classList.remove('active');
    }
  }
});

function renderImage(dataUrl, transitionMode) {
  const img = new Image();
  img.onload = () => {
    const targetCanvas = currentCanvas === 1 ? canvas2 : canvas1;
    const targetCtx = currentCanvas === 1 ? ctx2 : ctx1;
    const hideCanvas = currentCanvas === 1 ? canvas1 : canvas2;

    targetCanvas.width = img.width;
    targetCanvas.height = img.height;
    targetCtx.drawImage(img, 0, 0);

    if (transitionMode === 'cut') {
      targetCanvas.classList.add('no-transition');
      hideCanvas.classList.add('no-transition');

      requestAnimationFrame(() => {
        targetCanvas.classList.remove('canvas-hide');
        targetCanvas.classList.add('canvas-show');
        hideCanvas.classList.remove('canvas-show');
        hideCanvas.classList.add('canvas-hide');

        setTimeout(() => {
          targetCanvas.classList.remove('no-transition');
          hideCanvas.classList.remove('no-transition');
        }, 50);
      });
    } else {
      targetCanvas.classList.remove('canvas-hide');
      targetCanvas.classList.add('canvas-show');

      hideCanvas.classList.remove('canvas-show');
      hideCanvas.classList.add('canvas-hide');
    }

    currentCanvas = currentCanvas === 1 ? 2 : 1;
  };
  img.src = dataUrl;
}
